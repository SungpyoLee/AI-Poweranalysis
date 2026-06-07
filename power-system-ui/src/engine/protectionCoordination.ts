/**
 * Protection Coordination Engine
 * IEC 60255 OCR / Instantaneous + ANSI/IEEE C37.112 (P2-4) + 51N earth fault (P2-5)
 * + 87T Differential relay (IEC 60255-151 / IEEE C37.91)
 * Pure function: no store dependencies.
 */
import type { Node, Edge } from 'reactflow'
import type {
  NodeData, EdgeData, Breaker, Bus, Transformer,
  RelayCurveType, RelaySettings, EarthFaultRelay, RelayResult,
  ShortCircuitResults, DifferentialRelayResult, LoadflowResults,
} from '../types'
import { getNeighborIds } from '../utils/graphTraversal'
import { findTransformerBuses } from '../utils/graphTraversal'

// ── Operating time: IEC 60255 + ANSI/IEEE C37.112 ────────────────────────────
// Returns null if below pickup (M ≤ 1)
function relayTime(M: number, tms: number, curve: RelayCurveType): number | null {
  if (M <= 1.0) return null
  switch (curve) {
    // ── IEC 60255 ──────────────────────────────────────────────────────────────
    case 'IEC_NORMAL_INVERSE':    return (0.14  * tms) / (Math.pow(M, 0.02) - 1)
    case 'IEC_VERY_INVERSE':      return (13.5  * tms) / (M - 1)
    case 'IEC_EXTREMELY_INVERSE': return (80    * tms) / (M * M - 1)
    // ── ANSI/IEEE C37.112 — P2-4 ─────────────────────────────────────────────
    // t = TD × [A / (M^p - 1) + B]  (with B additive constant where applicable)
    case 'ANSI_MODERATELY_INVERSE': return tms * (0.0515 / (Math.pow(M, 0.02) - 1) + 0.114)
    case 'ANSI_INVERSE':            return tms * (19.61  / (M * M - 1) + 0.491)
    case 'ANSI_VERY_INVERSE':       return tms * (28.2   / (M * M - 1) + 0.1217)
    case 'ANSI_EXTREMELY_INVERSE':  return tms * (29.1   / (M * M - 1) + 0.1217)
    case 'ANSI_SHORT_INVERSE':      return tms * (0.0086 / (Math.pow(M, 0.02) - 1) + 0.0228)
  }
}

// Backward-compat alias used internally
const iecTime = relayTime

// ── Trip time for a relay at a given fault current ────────────────────────────
interface TripCalc { t: number; inst: boolean; trips: boolean }

function tripCalc(relay: RelaySettings | EarthFaultRelay, fault_a: number): TripCalc {
  if (relay.inst_enabled && fault_a >= relay.inst_pickup_a) {
    return { t: 0, inst: true, trips: true }
  }
  const M = fault_a / relay.pickup_current_a
  const t = relayTime(M, relay.time_dial, relay.curve_type)
  if (t === null) return { t: Infinity, inst: false, trips: false }
  return { t, inst: false, trips: true }
}

// ── Protected (downstream) bus of a breaker ───────────────────────────────────
// Uses MIN Ik" among directly-connected buses (= downstream, further from source).
// Respects explicit protectedBusId when set.
function getDownstreamBus(
  breakerNode: Node<NodeData>,
  nodes: Node<NodeData>[],
  edges: Edge<EdgeData>[],
  sc: ShortCircuitResults,
): { busId: string; busName: string; ikss_ka: number } | null {
  const br = breakerNode.data.equipment as Breaker
  const nodeMap = new Map(nodes.map(n => [n.id, n]))

  // Priority 1: explicit protectedBusId
  if (br.protectedBusId) {
    const r = sc.buses[br.protectedBusId]
    if (r && r.ikss_ka > 0) {
      const busEq = nodeMap.get(br.protectedBusId)?.data.equipment as Bus | undefined
      return { busId: br.protectedBusId, busName: busEq?.name ?? br.protectedBusId, ikss_ka: r.ikss_ka }
    }
  }

  // Priority 2: directly-connected bus with minimum Ik" (downstream)
  const directBusIds = getNeighborIds(breakerNode.id, edges)
    .filter(id => nodeMap.get(id)?.type === 'bus')

  let minBusId   = ''
  let minBusName = ''
  let minIkss    = Infinity

  for (const busId of directBusIds) {
    const r = sc.buses[busId]
    if (r && r.ikss_ka > 0 && r.ikss_ka < minIkss) {
      minIkss    = r.ikss_ka
      minBusId   = busId
      minBusName = (nodeMap.get(busId)?.data.equipment as Bus | undefined)?.name ?? busId
    }
  }

  if (!minBusId) return null
  return { busId: minBusId, busName: minBusName, ikss_ka: minIkss }
}

// ── Find upstream breaker with relay settings ─────────────────────────────────
// BFS from the "source side" of the current breaker (NOT going back through the
// protected bus). Returns the first closed breaker that has relay settings.
function findUpstreamBreaker(
  currentBreakerId: string,
  protectedBusId: string,
  nodes: Node<NodeData>[],
  edges: Edge<EdgeData>[],
): string | null {
  const nodeMap = new Map(nodes.map(n => [n.id, n]))
  const visited = new Set<string>([currentBreakerId, protectedBusId])
  const queue: string[] = []

  for (const nbrId of getNeighborIds(currentBreakerId, edges)) {
    if (!visited.has(nbrId)) { visited.add(nbrId); queue.push(nbrId) }
  }

  while (queue.length > 0) {
    const curId = queue.shift()!
    const cur   = nodeMap.get(curId)
    if (!cur || !cur.data.equipment.in_service) continue

    for (const nbrId of getNeighborIds(curId, edges)) {
      if (visited.has(nbrId)) continue
      visited.add(nbrId)

      const nbr = nodeMap.get(nbrId)
      if (!nbr || !nbr.data.equipment.in_service) continue

      if (nbr.type === 'breaker') {
        const eq = nbr.data.equipment as Breaker
        if (!eq.is_closed) continue          // open breaker isolates the circuit
        if (eq.relay) return nbrId            // found upstream relay breaker
        queue.push(nbrId)                     // closed non-relay breaker: traverse through
      } else if (nbr.type === 'bus' || nbr.type === 'transformer') {
        queue.push(nbrId)
      }
      // motors / generators / loads: don't traverse (load side, not source side)
    }
  }

  return null
}

// ── Main: compute relay coordination results ──────────────────────────────────
// coordMarginS: 협조 마진 최소 요구값 (IEC 60255 기본 0.3s)
// EPC 프로젝트별로 다를 수 있음 — ProjectDialog에서 설정
export function computeRelayResults(
  sc: ShortCircuitResults | null,
  nodes: Node<NodeData>[],
  edges: Edge<EdgeData>[],
  coordMarginS = 0.3,
): RelayResult[] {
  if (!sc) return []

  const breakersWithRelay = nodes.filter(n => {
    if (n.type !== 'breaker' || !n.data.equipment.in_service) return false
    return !!(n.data.equipment as Breaker).relay
  })
  if (breakersWithRelay.length === 0) return []

  const nodeMap = new Map(nodes.map(n => [n.id, n]))
  const results: RelayResult[] = []

  for (const breakerNode of breakersWithRelay) {
    const br    = breakerNode.data.equipment as Breaker
    const relay = br.relay!

    // 1. Get downstream protected bus + fault current
    const downstream = getDownstreamBus(breakerNode, nodes, edges, sc)
    if (!downstream) continue

    const fault_a = downstream.ikss_ka * 1000
    const self    = tripCalc(relay, fault_a)
    if (!self.trips) continue   // relay won't operate — skip

    // 2. Find upstream relay breaker
    const upstreamId = findUpstreamBreaker(breakerNode.id, downstream.busId, nodes, edges)

    let coordination_margin_s = Infinity
    let pass = true

    if (upstreamId) {
      const upBr = (nodeMap.get(upstreamId)?.data.equipment as Breaker | undefined)
      if (upBr?.relay) {
        const up = tripCalc(upBr.relay, fault_a)
        if (up.trips) {
          coordination_margin_s = up.t - self.t
          pass = coordination_margin_s >= coordMarginS
        }
      }
    }

    results.push({
      breakerId:              breakerNode.id,
      breakerName:            br.name,
      busName:                downstream.busName,
      fault_current_ka:       downstream.ikss_ka,
      curve_type:             relay.curve_type,
      pickup_current_a:       relay.pickup_current_a,
      time_dial:              relay.time_dial,
      relay_operating_time_s: self.t,
      inst_trip:              self.inst,
      coordination_margin_s,
      pass,
    })
  }

  // ── P2-5: 51N Earth fault relay results ─────────────────────────────────────
  // Zero-sequence fault current estimation:
  //   Solidly grounded: Ik1 ≈ 0.87 × Ik'' (rule of thumb, IEC system)
  //   Resistance/reactance grounded: lower — simplified as Ik1 ≈ 0.5 × Ik''
  //   Isolated neutral: ≈ 0 (capacitive only — not modelled)
  const breakersWith51N = nodes.filter(n =>
    n.type === 'breaker' && n.data.equipment.in_service &&
    !!(n.data.equipment as Breaker).relay_51n
  )

  for (const breakerNode of breakersWith51N) {
    const br     = breakerNode.data.equipment as Breaker
    const relay  = br.relay_51n!
    const ground = br.grounding ?? 'SOLID'
    if (ground === 'ISOLATED') continue

    const downstream = getDownstreamBus(breakerNode, nodes, edges, sc)
    if (!downstream) continue

    const gFactor = ground === 'SOLID' ? 0.87 : 0.50
    const if_ka   = downstream.ikss_ka * gFactor     // estimated ground fault current
    const fault_a = if_ka * 1000

    const self = tripCalc(relay, fault_a)
    if (!self.trips) continue

    const upstreamId = findUpstreamBreaker(breakerNode.id, downstream.busId, nodes, edges)
    let coordination_margin_s = Infinity
    let pass = true

    if (upstreamId) {
      const upBr = nodeMap.get(upstreamId)?.data.equipment as Breaker | undefined
      const upRelay = upBr?.relay_51n ?? upBr?.relay
      if (upRelay) {
        const up = tripCalc(upRelay, fault_a)
        if (up.trips) {
          coordination_margin_s = up.t - self.t
          pass = coordination_margin_s >= coordMarginS
        }
      }
    }

    results.push({
      breakerId:              breakerNode.id + '_51N',
      breakerName:            br.name + ' (51N)',
      busName:                downstream.busName,
      fault_current_ka:       if_ka,
      curve_type:             relay.curve_type,
      pickup_current_a:       relay.pickup_current_a,
      time_dial:              relay.time_dial,
      relay_operating_time_s: self.t,
      inst_trip:              self.inst,
      coordination_margin_s,
      pass,
    })
  }

  return results
}

// ── 87T Differential Relay Computation ───────────────────────────────────────
// Checks if differential current exceeds pickup threshold, considering:
//   - Percentage differential characteristic (dual-slope biased diff)
//   - 2nd harmonic restraint for magnetizing inrush blocking
//
// Input currents from loadflow (proxy for through-fault current imbalance).
// Full accuracy requires CT ratios and actual differential CT measurements.
// This implementation uses load-flow unbalance as an approximation.
export function computeDifferentialRelayResults(
  nodes:    Node<NodeData>[],
  edges:    Edge<EdgeData>[],
  loadflow: LoadflowResults | null,
): DifferentialRelayResult[] {
  const results: DifferentialRelayResult[] = []
  if (!loadflow) return results

  // Find all breakers with 87T relay adjacent to a transformer
  const nodeMap = new Map(nodes.map(n => [n.id, n]))

  for (const node of nodes) {
    if (node.type !== 'breaker') continue
    const br = node.data.equipment as Breaker
    if (!br.relay_87t || !br.in_service) continue

    // Find connected transformer
    const neighbors = getNeighborIds(node.id, edges)
    let trNode: Node<NodeData> | undefined

    for (const nbrId of neighbors) {
      const nbr = nodeMap.get(nbrId)
      if (nbr?.type === 'transformer') {
        trNode = nbr; break
      }
    }

    if (!trNode) continue
    const trEq = trNode.data.equipment as Transformer
    const rel  = br.relay_87t

    // Rated currents (from transformer MVA rating)
    const I_rated_hv = (trEq.sn_mva * 1000) / (Math.sqrt(3) * trEq.vn_hv_kv)  // A
    const I_rated_lv = (trEq.sn_mva * 1000) / (Math.sqrt(3) * trEq.vn_lv_kv)   // A

    // Differential current proxy from load flow transformer result
    const lfTr = loadflow.transformers[trNode.id]
    const I_diff_proxy = lfTr
      ? Math.abs(lfTr.p_hv_mw - lfTr.p_lv_mw) * 1000 / (Math.sqrt(3) * trEq.vn_hv_kv) * 1.05
      : 0

    const diff_pct = I_rated_hv > 0 ? (I_diff_proxy / I_rated_hv) * 100 : 0
    const restrain = (I_rated_hv + I_rated_lv) / 2  // average restraint current

    // Dual-slope biased differential characteristic:
    // Slope 1 applies for I_restrain < breakpoint (typically 1 pu)
    // Slope 2 applies above breakpoint
    const breakpoint_pu = 1.0
    const I_restrain_pu = restrain / I_rated_hv
    const slope = I_restrain_pu < breakpoint_pu ? rel.slope1_pct : rel.slope2_pct
    const min_diff_pct = rel.pickup_pct + (slope / 100) * (I_restrain_pu * 100)

    // Inrush detection: harmonic restraint blocks operation if 2nd harmonic > threshold
    // Approximated: treat as not blocking for steady-state loadflow
    const inrush_blocked = false  // No harmonic data from LF; user must verify

    const trips = diff_pct >= min_diff_pct && !inrush_blocked

    results.push({
      breakerId:          node.id,
      breakerName:        br.name,
      transformerName:    trEq.name,
      rated_current_hv_a: Math.round(I_rated_hv),
      rated_current_lv_a: Math.round(I_rated_lv),
      diff_current_pct:   Math.round(diff_pct * 100) / 100,
      restrain_current_a: Math.round(restrain),
      trips,
      inrush_blocked,
      pass: !trips,  // 87T should NOT trip during normal load (pass = no false trip)
    })
  }

  return results
}
