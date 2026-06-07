import type { Node, Edge } from 'reactflow'
import type {
  NodeData, EdgeData,
  Bus, Motor, Generator, Load,
  MotorStartResult,
} from '../types'
import { buildYBus, S_BASE } from './ybus'
import { nrSolve, type BusInput } from './newtonRaphson'
import { findConnectedBusId } from '../utils/graphTraversal'

// Mirror of loadflow.ts detectSlackBus (kept local to avoid coupling)
function detectSlackBus(nodes: Node<NodeData>[], edges: Edge<EdgeData>[]): string | null {
  const busNodes = nodes.filter(n => n.type === 'bus' && n.data.equipment.in_service)
  for (const bn of busNodes) {
    if ((bn.data.equipment as Bus).busType === 'Slack') return bn.id
  }
  for (const bn of busNodes) {
    for (const nd of nodes) {
      if (nd.type !== 'generator' || !nd.data.equipment.in_service) continue
      if (findConnectedBusId(nd.id, nodes, edges) === bn.id) return bn.id
    }
  }
  return busNodes[0]?.id ?? null
}

/**
 * For each in-service motor, run one NR solve with that motor in starting
 * condition (Istart = Irated × multiplier, modelled as fixed PQ at rated V).
 * All other equipment remains at normal operating state.
 * Returns an empty object if there are no motors or no slack bus.
 */
export function runMotorStartingAnalysis(
  nodes: Node<NodeData>[],
  edges: Edge<EdgeData>[],
): Record<string, MotorStartResult> {
  const results: Record<string, MotorStartResult> = {}

  const motorNodes = nodes.filter(n => n.type === 'motor' && n.data.equipment.in_service)
  if (motorNodes.length === 0) return results

  const slackBusId = detectSlackBus(nodes, edges)
  if (!slackBusId) return results

  const { Y, busOrder } = buildYBus(nodes, edges)
  const nodeMap = new Map(nodes.map(n => [n.id, n]))

  // equipmentByBus: busId → non-bus, non-breaker, non-transformer nodes
  const equipmentByBus = new Map<string, Node<NodeData>[]>()
  for (const id of busOrder) equipmentByBus.set(id, [])
  for (const nd of nodes) {
    if (!nd.data.equipment.in_service) continue
    if (nd.type === 'bus' || nd.type === 'breaker' || nd.type === 'transformer') continue
    const connBusId = findConnectedBusId(nd.id, nodes, edges)
    if (connBusId && equipmentByBus.has(connBusId)) {
      equipmentByBus.get(connBusId)!.push(nd)
    }
  }

  for (const motorNode of motorNodes) {
    const eq = motorNode.data.equipment as Motor
    const connBusId = findConnectedBusId(motorNode.id, nodes, edges)
    if (!connBusId || !busOrder.includes(connBusId)) continue

    // ── Running condition at rated voltage ──────────────────────────────────
    const pf  = Math.max(eq.power_factor, 0.01)
    const eff = Math.max(eq.efficiency, 1) / 100
    const p_run_mw      = (eq.rated_kw / eff) / 1000
    const running_current_a  = (p_run_mw * 1e6) / (Math.sqrt(3) * eq.vn_kv * 1000 * pf)

    // ── Starting condition: Istart = Irated × multiplier ───────────────────
    const start_current_a = running_current_a * eq.starting_current_multiple
    const start_mva       = Math.sqrt(3) * eq.vn_kv * (start_current_a / 1000)
    const p_start_mw      = start_mva * pf
    const q_start_mvar    = start_mva * Math.sin(Math.acos(pf))

    // ── Build bus injections (this motor → starting, others → running) ────
    const busInputs: BusInput[] = busOrder.map((busId) => {
      const busEq = nodeMap.get(busId)!.data.equipment as Bus
      let P_inject = 0
      let Q_inject = 0
      let vm_spec  = 1.0
      let q_min_pu = -Infinity
      let q_max_pu =  Infinity

      for (const nd of equipmentByBus.get(busId) ?? []) {
        if (nd.id === motorNode.id) {
          P_inject -= p_start_mw   / S_BASE
          Q_inject -= q_start_mvar / S_BASE
        } else {
          switch (nd.type) {
            case 'generator': {
              const g = nd.data.equipment as Generator
              P_inject += g.p_mw / S_BASE
              if (busEq.busType === 'PV') {
                vm_spec  = g.vm_pu
                q_min_pu = g.min_q_mvar / S_BASE
                q_max_pu = g.max_q_mvar / S_BASE
              }
              break
            }
            case 'motor': {
              const m   = nd.data.equipment as Motor
              const mpf = Math.max(m.power_factor, 0.01)
              const meff = Math.max(m.efficiency, 1) / 100
              const pm  = (m.rated_kw / meff) / 1000
              const qm  = pm * Math.tan(Math.acos(mpf))
              P_inject -= pm / S_BASE
              Q_inject -= qm / S_BASE
              break
            }
            case 'load': {
              const l  = nd.data.equipment as Load
              const pm = (l.p_kw / 1000) * l.scaling
              const qm = l.q_kvar !== 0
                ? (l.q_kvar / 1000) * l.scaling
                : pm * Math.tan(Math.acos(Math.max(l.pf, 0.01)))
              P_inject -= pm / S_BASE
              Q_inject -= qm / S_BASE
              break
            }
          }
        }
      }

      const busType: BusInput['type'] =
        busId === slackBusId    ? 'SLACK' :
        busEq.busType === 'PV' ? 'PV'    : 'PQ'

      return {
        nodeId: busId,
        type:   busType,
        V:      busType === 'SLACK' ? 1.0 : (busType === 'PV' ? vm_spec : 1.0),
        theta:  0,
        P_spec: P_inject,
        Q_spec: Q_inject,
        q_min:  busType === 'PV' ? q_min_pu : -Infinity,
        q_max:  busType === 'PV' ? q_max_pu :  Infinity,
      }
    })

    const nr = nrSolve(Y, busInputs)
    const busResult          = nr.buses.find(b => b.nodeId === connBusId)
    const terminal_voltage_pu = busResult?.vm_pu ?? 1.0
    const voltage_drop_percent = (1 - terminal_voltage_pu) * 100

    results[motorNode.id] = {
      motorId:              motorNode.id,
      start_current_a,
      running_current_a,
      start_mva,
      terminal_voltage_pu,
      voltage_drop_percent,
      pass: terminal_voltage_pu >= 0.85,
    }
  }

  return results
}
