import type { Node, Edge } from 'reactflow'
import type {
  NodeData, EdgeData, Bus, Transformer, ThreeWindingTransformer,
  Cable, CapacitorBank, Reactor,
} from '../types'
import { C, type Complex } from './complex'
import { findTransformerBuses, findConnectedBusId, find3WTransformerBuses } from '../utils/graphTraversal'

export const S_BASE = 100 // MVA

export interface YBusResult {
  Y:          Complex[][]        // N×N admittance matrix (N = buses + virtual nodes)
  busOrder:   string[]           // busOrder[i] = ReactFlow nodeId of bus at index i
  nodeToIdx:  Map<string, number>
  realBusCount: number           // number of real buses (vs virtual nodes)
  virtualIds:  string[]          // star node IDs for 3-winding transformers
}

export function buildYBus(
  nodes: Node<NodeData>[],
  edges: Edge<EdgeData>[],
  frequency_hz = 60,
): YBusResult {
  // ── 1. Collect in-service buses ───────────────────────────────────────────────
  const busNodes  = nodes.filter(n => n.type === 'bus' && n.data.equipment.in_service)
  const realBusN  = busNodes.length
  const busOrder  = busNodes.map(b => b.id)

  // P3-2: Count 3-winding transformers — each needs one virtual neutral node
  const tr3wNodes = nodes.filter(nd => nd.type === 'transformer3w' && nd.data.equipment.in_service)
  const virtualIds = tr3wNodes.map(nd => nd.id + '_STAR')

  // Combined index: real buses first, then virtual neutral nodes
  const allIds    = [...busOrder, ...virtualIds]
  const n         = allIds.length
  const nodeToIdx = new Map(allIds.map((id, i) => [id, i] as [string, number]))

  // ── 2. N×N complex zero matrix ───────────────────────────────────────────────
  const Y: Complex[][] = Array.from({ length: n }, () =>
    Array.from({ length: n }, () => C.zero())
  )

  const stamp = (i: number, j: number, y: Complex) => {
    Y[i][j] = C.add(Y[i][j], y)
  }

  const stampBranch = (i: number, j: number, Y_s: Complex) => {
    stamp(i, i, Y_s); stamp(j, j, Y_s)
    stamp(i, j, C.neg(Y_s)); stamp(j, i, C.neg(Y_s))
  }

  const nodeMap = new Map(nodes.map(nd => [nd.id, nd]))

  // ── 3. 2-winding Transformers (π-model with tap) ──────────────────────────────
  const trNodes = nodes.filter(nd => nd.type === 'transformer' && nd.data.equipment.in_service)
  for (const trNode of trNodes) {
    const eq = trNode.data.equipment as Transformer
    const { hvBusId, lvBusId } = findTransformerBuses(trNode.id, nodes, edges)
    if (!hvBusId || !lvBusId) continue
    const hi = nodeToIdx.get(hvBusId)
    const li = nodeToIdx.get(lvBusId)
    if (hi === undefined || li === undefined) continue

    const vkr_pu = eq.vkr_percent / 100
    const vk_pu  = eq.vk_percent  / 100
    const Xk_pu  = Math.sqrt(Math.max(vk_pu ** 2 - vkr_pu ** 2, 0))
    const ratio  = S_BASE / eq.sn_mva
    const Y_series = C.recip({ re: vkr_pu * ratio, im: Xk_pu * ratio })

    const g_fe     = (eq.pfe_kw / 1000 / eq.sn_mva) * (eq.sn_mva / S_BASE)
    const i0_pu    = (eq.i0_percent / 100) * (eq.sn_mva / S_BASE)
    const b_m      = Math.sqrt(Math.max(i0_pu ** 2 - g_fe ** 2, 0))
    const Y_sh_h   = { re: g_fe / 2, im: -b_m / 2 }

    const a  = 1 + (eq.tap_pos - eq.tap_neutral) * (eq.tap_step_percent / 100)
    const a2 = a * a

    stamp(hi, hi, C.add({ re: Y_series.re * a2, im: Y_series.im * a2 }, Y_sh_h))
    stamp(li, li, C.add(Y_series, Y_sh_h))
    stamp(hi, li, { re: -Y_series.re * a, im: -Y_series.im * a })
    stamp(li, hi, { re: -Y_series.re * a, im: -Y_series.im * a })
  }

  // ── P3-2: 3-winding Transformers (star equivalent — virtual neutral node) ─────
  // IEC 60076-1 §8.9 star impedances from paired short-circuit tests:
  //   Z_hv = (Z_hv_mv + Z_hv_lv − Z_mv_lv) / 2
  //   Z_mv = (Z_hv_mv + Z_mv_lv − Z_hv_lv) / 2
  //   Z_lv = (Z_hv_lv + Z_mv_lv − Z_hv_mv) / 2
  // where Z_hv_mv = vk_hv/100 × S_BASE/min(sn_hv,sn_mv), etc.
  for (const trNode of tr3wNodes) {
    const eq = trNode.data.equipment as ThreeWindingTransformer
    const starId = trNode.id + '_STAR'
    const si = nodeToIdx.get(starId)!

    const { hvId, mvId, lvId } = find3WTransformerBuses(trNode.id, nodes, edges)
    if (!hvId || !mvId || !lvId) continue

    const hi = nodeToIdx.get(hvId)
    const mi = nodeToIdx.get(mvId)
    const li = nodeToIdx.get(lvId)
    if (hi === undefined || mi === undefined || li === undefined) continue

    // Paired short-circuit impedances in system pu
    const Z_hv_mv = (eq.vk_hv_percent / 100) * (S_BASE / Math.min(eq.sn_hv_mva, eq.sn_mv_mva))
    const Z_hv_lv = (eq.vk_mv_percent / 100) * (S_BASE / Math.min(eq.sn_hv_mva, eq.sn_lv_mva))
    const Z_mv_lv = (eq.vk_lv_percent / 100) * (S_BASE / Math.min(eq.sn_mv_mva, eq.sn_lv_mva))

    const Xhv = Math.max((Z_hv_mv + Z_hv_lv - Z_mv_lv) / 2, 1e-6)
    const Xmv = Math.max((Z_hv_mv + Z_mv_lv - Z_hv_lv) / 2, 1e-6)
    const Xlv = Math.max((Z_hv_lv + Z_mv_lv - Z_hv_mv) / 2, 1e-6)

    const Rhv = (eq.vkr_hv_percent / 100) * (S_BASE / eq.sn_hv_mva)
    const Rmv = (eq.vkr_mv_percent / 100) * (S_BASE / eq.sn_mv_mva)
    const Rlv = (eq.vkr_lv_percent / 100) * (S_BASE / eq.sn_lv_mva)

    // Stamp star branches: HV→star, MV→star, LV→star
    stampBranch(hi, si, C.recip({ re: Rhv, im: Xhv }))
    stampBranch(mi, si, C.recip({ re: Rmv, im: Xmv }))
    stampBranch(li, si, C.recip({ re: Rlv, im: Xlv }))

    // Shunt at star node (magnetising)
    const g_fe = (eq.pfe_kw / 1000 / eq.sn_hv_mva) * (eq.sn_hv_mva / S_BASE)
    stamp(si, si, { re: g_fe, im: 0 })
  }

  // ── 4. Bus-to-Bus cable lines (π-model) ──────────────────────────────────────
  for (const edge of edges) {
    if (!edge.data?.cable?.in_service) continue
    const srcNode = nodeMap.get(edge.source)
    const tgtNode = nodeMap.get(edge.target)
    if (srcNode?.type !== 'bus' || tgtNode?.type !== 'bus') continue

    const fi = nodeToIdx.get(edge.source)
    const ti = nodeToIdx.get(edge.target)
    if (fi === undefined || ti === undefined) continue

    const cable  = edge.data.cable as Cable
    const par    = Math.max(cable.parallel ?? 1, 1)
    const len    = cable.length_m / 1000
    const R_ohm  = (cable.r_ohm_per_km * len) / par
    const X_ohm  = (cable.x_ohm_per_km * len) / par
    const B_s    = (cable.c_nf_per_km * len * 1e-9) * 2 * Math.PI * frequency_hz * par

    const V_kv   = (srcNode.data.equipment as Bus).vn_kv
    const Z_base = (V_kv * V_kv) / S_BASE
    const Y_s    = C.recip({ re: R_ohm / Z_base, im: X_ohm / Z_base })
    const Y_sh_h = { re: 0, im: (B_s * Z_base) / 2 }

    stamp(fi, fi, C.add(Y_s, Y_sh_h)); stamp(ti, ti, C.add(Y_s, Y_sh_h))
    stamp(fi, ti, C.neg(Y_s));          stamp(ti, fi, C.neg(Y_s))
  }

  // ── P3-3: Shunt Capacitor Banks (−jB → +jB in Y) ────────────────────────────
  for (const capNode of nodes) {
    if (capNode.type !== 'capacitor' || !capNode.data.equipment.in_service) continue
    const cap = capNode.data.equipment as CapacitorBank
    const busId = findConnectedBusId(capNode.id, nodes, edges)
    if (!busId) continue
    const idx = nodeToIdx.get(busId)
    if (idx === undefined) continue

    const Qeff = cap.qn_mvar * (cap.step_enabled / Math.max(cap.steps, 1))
    if (cap.vn_kv <= 0 || Qeff <= 0) continue

    // B_cap = Q_rated / V²_rated → B_pu = Q_rated / S_BASE (at V = 1 pu rated)
    stamp(idx, idx, { re: 0, im: Qeff / S_BASE })   // +jB (leading)
  }

  // ── P3-3: Shunt Reactors (−jB in Y) ──────────────────────────────────────────
  for (const reactNode of nodes) {
    if (reactNode.type !== 'reactor' || !reactNode.data.equipment.in_service) continue
    const react = reactNode.data.equipment as Reactor
    if (!react.is_shunt) continue  // series reactor handled as cable in load flow

    const busId = findConnectedBusId(reactNode.id, nodes, edges)
    if (!busId) continue
    const idx = nodeToIdx.get(busId)
    if (idx === undefined) continue

    if (react.qn_mvar <= 0) continue
    // −jQ/S_BASE (absorbing)
    stamp(idx, idx, { re: 0, im: -react.qn_mvar / S_BASE })
  }

  return { Y, busOrder, nodeToIdx, realBusCount: realBusN, virtualIds }
}
