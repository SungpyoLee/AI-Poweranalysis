import type { Node, Edge } from 'reactflow'
import type {
  NodeData, EdgeData,
  Bus, Transformer, Motor, Generator, Load, Cable,
  LoadflowResults, MotorLFResult,
} from '../types'
import { buildYBus, S_BASE } from './ybus'
import { nrSolve, type BusInput } from './newtonRaphson'
import { validateNetwork } from '../utils/networkValidation'
import { findConnectedBusId, findTransformerBuses } from '../utils/graphTraversal'
import { runMotorStartingAnalysis } from './motorStarting'

// ── Slack Bus 자동 탐색 ──────────────────────────────────────────────────────
// 우선순위: busType==='Slack' > PV 버스에 연결된 외부전원 > 첫 번째 버스
function detectSlackBus(nodes: Node<NodeData>[], edges: Edge<EdgeData>[]): string | null {
  const busNodes = nodes.filter(n => n.type === 'bus' && n.data.equipment.in_service)

  // Priority 1: explicit Slack type
  for (const bn of busNodes) {
    if ((bn.data.equipment as Bus).busType === 'Slack') return bn.id
  }

  // Priority 2: bus connected to a generator (treat as swing bus)
  for (const bn of busNodes) {
    for (const nd of nodes) {
      if (nd.type !== 'generator' || !nd.data.equipment.in_service) continue
      const connBus = findConnectedBusId(nd.id, nodes, edges)
      if (connBus === bn.id) return bn.id
    }
  }

  // Priority 3: first bus
  return busNodes[0]?.id ?? null
}

// ── 메인 엔진 함수 ────────────────────────────────────────────────────────────
export function runLocalLoadflow(
  nodes: Node<NodeData>[],
  edges: Edge<EdgeData>[],
  frequency_hz = 60,
): LoadflowResults {
  const t0 = performance.now()

  // ── 1. 검증 ─────────────────────────────────────────────────────────────────
  const validation = validateNetwork(nodes, edges)
  if (!validation.valid) {
    const msgs = validation.issues.filter(i => i.severity === 'error').map(i => i.message)
    throw new Error('검증 실패: ' + msgs.join('; '))
  }

  // ── 2. Y-Bus 구성 ────────────────────────────────────────────────────────────
  const { Y, busOrder, nodeToIdx, realBusCount, virtualIds } = buildYBus(nodes, edges, frequency_hz)
  const nodeMap    = new Map(nodes.map(n => [n.id, n]))
  const slackBusId = detectSlackBus(nodes, edges)
  if (!slackBusId) throw new Error('Slack Bus를 찾을 수 없습니다')

  const _dev = import.meta.env.DEV
  if (_dev) {
    console.group('[LoadFlow] Newton-Raphson')
    console.log(`  Network : ${busOrder.length} buses, ${nodes.filter(n=>n.type==='transformer').length} transformers`)
    console.log(`  Slack   : "${(nodeMap.get(slackBusId)?.data.equipment as Bus).name}"`)
    console.log(`  S_base  : ${S_BASE} MVA`)
  }

  // ── 3. 버스별 장비 분류 ─────────────────────────────────────────────────────
  const equipmentByBus = new Map<string, Node<NodeData>[]>()
  for (const id of busOrder) equipmentByBus.set(id, [])

  for (const nd of nodes) {
    if (!nd.data.equipment.in_service) continue
    // 3권선 변압기는 Y-bus 가상 노드로 처리 — P/Q 주입 없음
    if (nd.type === 'bus' || nd.type === 'breaker' || nd.type === 'transformer' || nd.type === 'transformer3w') continue
    const connBusId = findConnectedBusId(nd.id, nodes, edges)
    if (connBusId && equipmentByBus.has(connBusId)) {
      equipmentByBus.get(connBusId)!.push(nd)
    }
  }

  // ── 4. BusInput 빌더 (ZIP 전압 의존 부하 반영) ────────────────────────────────
  // V_pu_map: busId → 현재 추정 전압 (ZIP 외부 반복용, 최초 flat-start = 1.0)
  // 3권선 변압기의 가상 성형점(star node)은 PQ(0,0) 부동 노드로 추가됨.
  function buildBusInputs(V_pu_map: Map<string, number>): BusInput[] {
    const realInputs = busOrder.map((busId) => {
      const busEq = nodeMap.get(busId)!.data.equipment as Bus
      let P_inject = 0
      let Q_inject = 0
      let vm_spec  = 1.0
      let q_min_pu = -Infinity
      let q_max_pu = Infinity
      const V_bus  = V_pu_map.get(busId) ?? 1.0

      for (const nd of equipmentByBus.get(busId) ?? []) {
        switch (nd.type) {
          case 'generator': {
            const eq = nd.data.equipment as Generator
            P_inject += eq.p_mw / S_BASE
            if (busEq.busType === 'PV') {
              vm_spec  = eq.vm_pu
              q_min_pu = eq.min_q_mvar / S_BASE
              q_max_pu = eq.max_q_mvar / S_BASE
            }
            break
          }
          case 'motor': {
            const eq  = nd.data.equipment as Motor
            const pf  = Math.max(eq.power_factor, 0.01)
            const eff = Math.max(eq.efficiency, 1) / 100
            const p_mw   = (eq.rated_kw / eff) / 1000
            const q_mvar = p_mw * Math.tan(Math.acos(pf))
            P_inject -= p_mw   / S_BASE
            Q_inject -= q_mvar / S_BASE
            break
          }
          case 'load': {
            const eq = nd.data.equipment as Load
            const p_nom_mw = (eq.p_kw / 1000) * eq.scaling
            const q_nom_mvar = eq.q_kvar !== 0
              ? (eq.q_kvar / 1000) * eq.scaling
              : p_nom_mw * Math.tan(Math.acos(Math.max(eq.pf, 0.01)))

            // ZIP 전압 의존성: P/Q = Pnom × [Z·V² + I·V + P] / 100
            const cz = (eq.const_z_percent ?? 0) / 100
            const ci = (eq.const_i_percent ?? 0) / 100
            const cp = (eq.const_p_percent ?? 100) / 100
            // 세 계수 합이 1이 아닐 경우 보정 (입력 오류 방어)
            const cSum = cz + ci + cp
            const V2 = V_bus * V_bus
            const zipFactor = cSum > 0
              ? (cz * V2 + ci * V_bus + cp) / cSum
              : 1.0
            P_inject -= (p_nom_mw   * zipFactor) / S_BASE
            Q_inject -= (q_nom_mvar * zipFactor) / S_BASE
            break
          }
        }
      }

      const busType: BusInput['type'] =
        busId === slackBusId   ? 'SLACK' :
        busEq.busType === 'PV' ? 'PV'   :
        'PQ'

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

    // 3권선 변압기 가상 성형점: P=0, Q=0 부동 PQ 노드
    const virtualInputs: BusInput[] = virtualIds.map(vid => ({
      nodeId: vid,
      type:   'PQ',
      V:      1.0,
      theta:  0,
      P_spec: 0,
      Q_spec: 0,
      q_min:  -Infinity,
      q_max:   Infinity,
    }))

    return [...realInputs, ...virtualInputs]
  }

  // ── 5. ZIP 외부 반복 + Newton-Raphson ────────────────────────────────────────
  // 상수 전력 부하(const_p=100%)만 있으면 1회 반복으로 수렴.
  // ZIP 혼합 부하가 있으면 최대 5회 외부 반복으로 전압 의존성 수렴.
  const ZIP_MAX_OUTER = 5
  const ZIP_TOL       = 1e-5   // pu — 연속된 전압 변화가 이 이하이면 조기 종료

  let V_pu_map = new Map(busOrder.map(id => [id, 1.0]))
  let busInputs = buildBusInputs(V_pu_map)
  let nr = nrSolve(Y, busInputs)

  for (let zipIter = 1; zipIter < ZIP_MAX_OUTER; zipIter++) {
    // ZIP 수렴 판정은 실제 버스만 대상 (가상 성형점 제외)
    const V_new = new Map<string, number>()
    let maxDV = 0
    for (const r of nr.buses.slice(0, realBusCount)) {
      V_new.set(r.nodeId, r.vm_pu)
      maxDV = Math.max(maxDV, Math.abs(r.vm_pu - (V_pu_map.get(r.nodeId) ?? 1.0)))
    }
    V_pu_map = V_new
    if (maxDV < ZIP_TOL) break
    busInputs = buildBusInputs(V_pu_map)
    nr = nrSolve(Y, busInputs)
  }

  const elapsedMs = performance.now() - t0

  if (_dev) {
    console.log(`\n  Iteration log:`)
    for (const { iter, maxMismatch } of nr.iterLog) {
      console.log(`    Iter ${iter}: maxMismatch = ${maxMismatch.toExponential(4)} pu`)
    }
    if (nr.converged) {
      console.log(`\n  ✓ Converged in ${nr.iterationCount} iterations (${elapsedMs.toFixed(1)} ms)`)
    } else {
      console.warn(`  ✗ NOT converged after ${nr.iterationCount} iterations`)
    }
    if (nr.pvSwitches.length > 0) {
      console.warn(`\n  PV → PQ switches: ${nr.pvSwitches.length}`)
      for (const sw of nr.pvSwitches) {
        const lim = (sw.Q_lim_pu * S_BASE).toFixed(2)
        const Q   = (sw.Q_pu    * S_BASE).toFixed(2)
        console.warn(`    Iter ${sw.iter}: ${sw.nodeId} Q=${Q} MVAr hit ${sw.reason}=${lim} MVAr`)
      }
    }
  }

  // ── 5. 버스 결과 매핑 (가상 성형점 제외, realBusCount 이내만 보고) ────────────
  const buses: LoadflowResults['buses'] = {}
  for (const r of nr.buses.slice(0, realBusCount)) {
    const busEq = nodeMap.get(r.nodeId)!.data.equipment as Bus
    buses[r.nodeId] = {
      nodeId:    r.nodeId,
      vm_pu:     r.vm_pu,
      va_degree: r.va_degree,
      p_mw:      r.P_inj_pu * S_BASE,
      q_mvar:    r.Q_inj_pu * S_BASE,
    }
    if (_dev) console.log(
      `  Bus "${busEq.name}" [${busInputs.find(b=>b.nodeId===r.nodeId)?.type}]` +
      ` : V=${r.vm_pu.toFixed(4)} pu, θ=${r.va_degree.toFixed(3)}°` +
      ` | P=${(r.P_inj_pu*S_BASE).toFixed(3)} MW, Q=${(r.Q_inj_pu*S_BASE).toFixed(3)} MVAr`
    )
  }

  // ── 6. 변압기 결과 계산 ──────────────────────────────────────────────────────
  const transformers: LoadflowResults['transformers'] = {}
  const solvedState = new Map(
    nr.buses.map(r => [r.nodeId, { V: r.vm_pu, theta: r.va_degree * (Math.PI / 180) }])
  )

  for (const trNode of nodes.filter(nd => nd.type === 'transformer' && nd.data.equipment.in_service)) {
    const eq = trNode.data.equipment as Transformer
    const { hvBusId, lvBusId } = findTransformerBuses(trNode.id, nodes, edges)
    if (!hvBusId || !lvBusId) continue

    const hvS = solvedState.get(hvBusId)
    const lvS = solvedState.get(lvBusId)
    if (!hvS || !lvS) continue

    // Series and shunt admittance (same as ybus.ts)
    const vkr  = eq.vkr_percent / 100
    const vk   = eq.vk_percent  / 100
    const Xk   = Math.sqrt(Math.max(vk * vk - vkr * vkr, 0))
    const ratio = S_BASE / eq.sn_mva
    const R = vkr * ratio
    const X = Xk  * ratio
    const denom  = R * R + X * X
    const g_s    = R / denom       // series conductance
    const b_s    = -X / denom      // series susceptance (negative → inductive)
    const g_fe   = (eq.pfe_kw / 1000 / eq.sn_mva) * (eq.sn_mva / S_BASE)
    const i0_pu  = (eq.i0_percent / 100) * (eq.sn_mva / S_BASE)
    const b_m    = Math.sqrt(Math.max(i0_pu * i0_pu - g_fe * g_fe, 0))
    const g_sh   = g_fe / 2       // half-shunt at each terminal
    const b_sh   = -b_m / 2

    const { V: Vh, theta: Th } = hvS
    const { V: Vl, theta: Tl } = lvS
    const dt = Th - Tl  // θ_hv − θ_lv

    // Branch power: P_ij = Vi²(g_s+g_sh) − ViVj(g_s cosΔθ + b_s sinΔθ)
    const P_hv = Vh * Vh * (g_s + g_sh) - Vh * Vl * (g_s * Math.cos(dt) + b_s * Math.sin(dt))
    const Q_hv = -Vh * Vh * (b_s + b_sh) - Vh * Vl * (g_s * Math.sin(dt) - b_s * Math.cos(dt))
    const P_lv = Vl * Vl * (g_s + g_sh) - Vl * Vh * (g_s * Math.cos(-dt) + b_s * Math.sin(-dt))
    const Q_lv = -Vl * Vl * (b_s + b_sh) - Vl * Vh * (g_s * Math.sin(-dt) - b_s * Math.cos(-dt))

    const P_hv_mw   = P_hv * S_BASE
    const Q_hv_mvar = Q_hv * S_BASE
    const P_lv_mw   = P_lv * S_BASE   // negative = power flows INTO lv bus
    const Q_lv_mvar = Q_lv * S_BASE
    const pl_mw     = P_hv_mw + P_lv_mw          // total losses (copper + iron)
    const S_mva     = Math.sqrt(P_hv_mw ** 2 + Q_hv_mvar ** 2)
    const loading   = (S_mva / eq.sn_mva) * 100

    transformers[trNode.id] = {
      nodeId:          trNode.id,
      loading_percent: loading,
      p_hv_mw:         P_hv_mw,
      q_hv_mvar:       Q_hv_mvar,
      p_lv_mw:         P_lv_mw,
      q_lv_mvar:       Q_lv_mvar,
      pl_mw,
    }
    if (_dev) console.log(
      `  TR  "${eq.name}": loading=${loading.toFixed(2)}%` +
      ` | P_hv=${P_hv_mw.toFixed(3)} MW, P_lv=${P_lv_mw.toFixed(3)} MW` +
      ` | loss=${pl_mw.toFixed(4)} MW`
    )
  }

  // ── 7. Cable (Line) 결과 계산 ────────────────────────────────────────────────
  const lines: LoadflowResults['lines'] = {}

  for (const edge of edges) {
    if (!edge.data?.cable?.in_service) continue
    const srcNode = nodeMap.get(edge.source)
    const tgtNode = nodeMap.get(edge.target)
    if (srcNode?.type !== 'bus' || tgtNode?.type !== 'bus') continue

    const fS = solvedState.get(edge.source)
    const tS = solvedState.get(edge.target)
    if (!fS || !tS) continue

    const cable    = edge.data.cable as Cable
    const len_km   = cable.length_m / 1000
    const V_from_kv = (srcNode.data.equipment as Bus).vn_kv
    const Z_base   = (V_from_kv * V_from_kv) / S_BASE
    const R_pu     = (cable.r_ohm_per_km * len_km) / Z_base
    const X_pu     = (cable.x_ohm_per_km * len_km) / Z_base
    const denom    = R_pu * R_pu + X_pu * X_pu
    if (denom < 1e-12) continue

    const g_s = R_pu / denom
    const b_s = -X_pu / denom   // negative (inductive)

    const B_pu       = (cable.c_nf_per_km * len_km * 1e-9) * 2 * Math.PI * 60 * Z_base
    const B_sh_half  = B_pu / 2  // per-end capacitive susceptance

    const Vf = fS.V
    const Vt = tS.V
    const dt = fS.theta - tS.theta

    const P_from = Vf * Vf * g_s - Vf * Vt * (g_s * Math.cos(dt) + b_s * Math.sin(dt))
    const Q_from = -Vf * Vf * (b_s + B_sh_half) - Vf * Vt * (g_s * Math.sin(dt) - b_s * Math.cos(dt))
    const P_to   = Vt * Vt * g_s - Vt * Vf * (g_s * Math.cos(-dt) + b_s * Math.sin(-dt))
    const Q_to   = -Vt * Vt * (b_s + B_sh_half) - Vt * Vf * (g_s * Math.sin(-dt) - b_s * Math.cos(-dt))

    const P_from_mw   = P_from * S_BASE
    const Q_from_mvar = Q_from * S_BASE
    const P_to_mw     = P_to   * S_BASE
    const Q_to_mvar   = Q_to   * S_BASE
    const pl_mw       = P_from_mw + P_to_mw
    const ql_mvar     = Q_from_mvar + Q_to_mvar

    // Current from from_bus base
    const I_base_kA = S_BASE / (Math.sqrt(3) * V_from_kv)
    const S_from_pu = Math.sqrt(P_from * P_from + Q_from * Q_from)
    const i_ka      = (S_from_pu / Vf) * I_base_kA

    const loading_percent = cable.max_i_ka > 0 ? (i_ka / cable.max_i_ka) * 100 : 0
    const vdrop_percent   = Vf > 0 ? (Vf - Vt) / Vf * 100 : 0

    lines[edge.id] = {
      edgeId: edge.id,
      loading_percent,
      p_from_mw:  P_from_mw,
      q_from_mvar: Q_from_mvar,
      p_to_mw:    P_to_mw,
      q_to_mvar:  Q_to_mvar,
      pl_mw,
      ql_mvar,
      i_ka,
      vdrop_percent,
    }

    if (_dev) console.log(
      `  Line "${cable.name}": I=${(i_ka * 1000).toFixed(1)}A, loading=${loading_percent.toFixed(1)}%` +
      ` | ΔV=${vdrop_percent.toFixed(3)}%, pl=${(pl_mw * 1000).toFixed(2)}kW`
    )
  }

  // ── 8. Generator 결과 계산 (실제 버스만) ───────────────────────────────────
  const generators: LoadflowResults['generators'] = {}

  for (const busId of busOrder) {
    for (const nd of equipmentByBus.get(busId) ?? []) {
      if (nd.type !== 'generator') continue
      const eq       = nd.data.equipment as Generator
      const busInput = busInputs.find(b => b.nodeId === busId)!
      const busRes   = buses[busId]
      const wasSwitched = busInput.type === 'PV' &&
        nr.pvSwitches.some(s => s.nodeId === busId)

      generators[nd.id] = {
        generatorId: nd.id,
        busId,
        p_mw:   eq.p_mw,
        q_mvar: busRes.q_mvar,
        vm_pu:  busRes.vm_pu,
        mode:   wasSwitched ? 'PQ_LIMIT' : 'PV',
      }

      if (_dev) {
        if (wasSwitched) {
          const sw = nr.pvSwitches.find(s => s.nodeId === busId)!
          console.warn(
            `  ⚠ "${eq.name}" PV→PQ: Q=${busRes.q_mvar.toFixed(2)}MVAr ` +
            `(${sw.reason}=${(sw.Q_lim_pu * S_BASE).toFixed(2)}MVAr)`
          )
        } else if (busInput.type === 'PV') {
          console.log(
            `  Gen "${eq.name}": P=${eq.p_mw.toFixed(2)}MW` +
            ` Q=${busRes.q_mvar.toFixed(3)}MVAr [PV  V=${busRes.vm_pu.toFixed(4)}pu]`
          )
        }
      }
    }
  }

  // ── 9. Motor 결과 계산 ──────────────────────────────────────────────────────
  const motors: LoadflowResults['motors'] = {}

  for (const busId of busOrder) {
    for (const nd of equipmentByBus.get(busId) ?? []) {
      if (nd.type !== 'motor') continue
      const eq  = nd.data.equipment as Motor
      const pf  = Math.max(eq.power_factor, 0.01)
      const eff = Math.max(eq.efficiency, 1) / 100
      const p_mw   = (eq.rated_kw / eff) / 1000
      const q_mvar = p_mw * Math.tan(Math.acos(pf))
      const running_current_a  = (p_mw * 1e6) / (Math.sqrt(3) * eq.vn_kv * 1000 * pf)
      const starting_current_a = running_current_a * eq.starting_current_multiple

      motors[nd.id] = {
        motorId:            nd.id,
        busId,
        p_mw,
        q_mvar,
        running_current_a,
        starting_current_a,
      } satisfies MotorLFResult

      if (_dev) console.log(
        `  Motor "${eq.name}": P=${p_mw.toFixed(3)}MW Q=${q_mvar.toFixed(3)}Mvar` +
        ` | Ir=${running_current_a.toFixed(1)}A Is=${starting_current_a.toFixed(1)}A`
      )
    }
  }

  // ── 10. Motor Starting Analysis ─────────────────────────────────────────────
  const motorStarts = runMotorStartingAnalysis(nodes, edges)

  if (_dev) console.groupEnd()

  return {
    converged: nr.converged,
    meta: {
      iterationCount: nr.iterationCount,
      maxMismatch:    nr.maxMismatch,
      elapsedMs,
    },
    buses,
    transformers,
    lines,
    generators,
    motors,
    motorStarts,
  }
}
