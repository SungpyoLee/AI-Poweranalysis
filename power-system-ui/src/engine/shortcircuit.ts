/**
 * IEC 60909 3-phase balanced short-circuit calculation.
 *
 * Phase 1 inclusions:
 *   - Transformer leakage Z, cable series Z (with parallel runs)
 *   - External grid Thevenin Z
 *   - Synchronous generator Xd'' contribution
 *
 * Phase 2 additions:
 *   P2-1: Induction motor contribution (IEC 60909 §4.3.4)
 *   P2-2: Minimum fault current (c_min = 0.95 LV / 1.0 MV+)
 *   P2-3: Transformer K_T correction, Generator K_G correction
 *
 * Remaining exclusions (Phase 3+):
 *   - Cable charging, transformer magnetising branch
 *   - Breaking current Ib (= Ik'' approximation)
 *   - Motor contribution for LV groups (simplified single motor model only)
 */

import type { Node, Edge } from 'reactflow'
import type { NodeData, EdgeData, Bus, Transformer, ThreeWindingTransformer, Cable, Generator, Motor, BusFaultResult, ShortCircuitResults } from '../types'
import { C } from './complex'
import { S_BASE } from './ybus'
import { computeZBusDiagonal } from './complexMatrix'
import { findTransformerBuses, findConnectedBusId } from '../utils/graphTraversal'

const C_MAX   = 1.1   // IEC 60909 — maximum fault voltage factor (HV/MV)
const _dev    = import.meta.env.DEV
const T_MIN_S = 0.05  // minimum breaker time delay for Ib calculation (IEC 60909 §4.7)
const TF_DEFAULT_S = 0.5  // 열적 등가 고장 지속 시간 기본값 (케이블 열적 선정 기준)

// ── IEC 60909-0:2016 §4.7 — Breaking current factor μ ────────────────────────
// μ reduces Ik'' to Ib accounting for DC component decay at t = tmin.
// Table 8 (tmin = 0.05 s): μ = 0.71 + 0.51 × exp(−0.30 × R/X)
// μ is clamped to [0.4, 1.0] for numerical stability.
function calcMu(R_kk: number, X_kk: number): number {
  if (Math.abs(X_kk) < 1e-9) return 1.0   // purely resistive: no DC offset
  const RoX = Math.abs(R_kk / X_kk)
  if (T_MIN_S <= 0.02) return Math.min(1, 0.84 + 0.26 * Math.exp(-0.26 * RoX))
  if (T_MIN_S <= 0.05) return Math.min(1, 0.71 + 0.51 * Math.exp(-0.30 * RoX))
  if (T_MIN_S <= 0.10) return Math.min(1, 0.56 + 0.94 * Math.exp(-0.38 * RoX))
  return 1.0  // tmin ≥ 0.25 s: DC fully decayed
}

// P2-2: c_min by voltage level
function cMin(vn_kv: number): number {
  return vn_kv <= 1.0 ? 0.95 : 1.0
}

// P2-4: Thermal equivalent short-circuit current Ith (IEC 60909-0:2016 §4.8)
// Ith = Ik'' × √(m + n)
//   n = 1 (AC component Joule integral, conservative for constant-magnitude AC)
//   m = DC component contribution over fault duration tf:
//       m = (T_DC / tf) × (1 − e^(−2×tf/T_DC))
//       where T_DC = X / (2π × f × |R|) = X/R / (2π×f)
// For thermal cable/switchgear sizing, tf = 0.5 s is the standard default.
function calcIth(ikss_ka: number, R_kk: number, X_kk: number, tf_s = TF_DEFAULT_S, freq_hz = 60): number {
  const n = 1.0
  let m: number
  if (Math.abs(R_kk) < 1e-9) {
    m = 0  // purely reactive: no DC offset energy contribution
  } else {
    const T_dc = Math.abs(X_kk) / (2 * Math.PI * freq_hz * Math.abs(R_kk))
    m = (T_dc / tf_s) * (1 - Math.exp(-2 * tf_s / T_dc))
  }
  return ikss_ka * Math.sqrt(m + n)
}

// P2-3: Transformer correction factor K_T (IEC 60909-0 §3.3.3)
// K_T = 0.95 × c_max / (1 + 0.6 × xT_pu_sys)
// Applied to transformer series impedance → Z_T_eff = K_T × Z_T
function calcKT(vkr_pu_sys: number, xk_pu_sys: number): number {
  const xT = Math.sqrt(vkr_pu_sys ** 2 + xk_pu_sys ** 2)
  return (0.95 * C_MAX) / (1 + 0.6 * xT)
}

// P2-3: Generator correction factor K_G (IEC 60909-0 §4.3.1.1)
// K_G = c_max / (1 + xd''_pu_sys × sin_phi_G)
function calcKG(xdpp_sys: number, cos_phi_rated: number): number {
  const sin_phi = Math.sqrt(Math.max(1 - cos_phi_rated ** 2, 0))
  return C_MAX / (1 + xdpp_sys * sin_phi)
}

export function runLocalShortcircuit(
  nodes: Node<NodeData>[],
  edges: Edge<EdgeData>[],
): ShortCircuitResults {
  const busNodes  = nodes.filter(n => n.type === 'bus' && n.data.equipment.in_service)
  const n         = busNodes.length
  const busOrder  = busNodes.map(b => b.id)
  const nodeToIdx = new Map(busOrder.map((id, i) => [id, i] as [string, number]))
  const nodeMap   = new Map(nodes.map(nd => [nd.id, nd]))

  if (n === 0) return { buses: {} }

  // P1-1: 3권선 변압기 가상 성형점 — 실제 버스 뒤에 인덱스 배치
  const tr3wNodes  = nodes.filter(nd => nd.type === 'transformer3w' && nd.data.equipment.in_service)
  const virtualIds = tr3wNodes.map(nd => nd.id + '_STAR')
  const N          = n + virtualIds.length
  const nodeToIdxFull = new Map<string, number>([
    ...Array.from(nodeToIdx.entries()),
    ...virtualIds.map((id, k) => [id, n + k] as [string, number]),
  ])

  // ── 1. Build Y_sc (N×N: 실제 버스 n개 + 가상 성형점) ─────────────────────────
  const Y = Array.from({ length: N }, () =>
    Array.from({ length: N }, () => C.zero())
  )
  const stamp = (i: number, j: number, y: typeof Y[0][0]) => {
    Y[i][j] = C.add(Y[i][j], y)
  }

  // 1a. Transformer series impedance — with P2-3 K_T correction
  const trNodes = nodes.filter(nd => nd.type === 'transformer' && nd.data.equipment.in_service)
  const ktMap   = new Map<string, number>()  // trNode.id → K_T value

  for (const trNode of trNodes) {
    const eq = trNode.data.equipment as Transformer
    const { hvBusId, lvBusId } = findTransformerBuses(trNode.id, nodes, edges)
    if (!hvBusId || !lvBusId) continue
    const hi = nodeToIdx.get(hvBusId)
    const li = nodeToIdx.get(lvBusId)
    if (hi === undefined || li === undefined) continue

    const vkr_pu = eq.vkr_percent / 100
    const vk_pu  = eq.vk_percent  / 100
    const Xk_pu  = Math.sqrt(Math.max(vk_pu * vk_pu - vkr_pu * vkr_pu, 0))
    const scale  = S_BASE / eq.sn_mva

    // Tap ratio a = 1 + (tap_pos − tap_neutral) × step/100
    const tap_step = eq.tap_step_percent ?? 1.25
    const a = 1 + (eq.tap_pos - eq.tap_neutral) * (tap_step / 100)

    // P2-3: K_T correction (applied to series impedance)
    const K_T = calcKT(vkr_pu * scale, Xk_pu * scale)
    ktMap.set(trNode.id, K_T)

    // Transformer π-model with off-nominal tap a on HV side (IEC 60076):
    //   Y_HH += Ys × a²,  Y_LL += Ys,  Y_HL = Y_LH = -Ys × a
    const Z_s  = { re: vkr_pu * scale / K_T, im: Xk_pu * scale / K_T }
    const Y_s  = C.recip(Z_s)
    const a2   = a * a
    stamp(hi, hi, { re: Y_s.re * a2, im: Y_s.im * a2 })
    stamp(li, li, Y_s)
    stamp(hi, li, { re: -Y_s.re * a, im: -Y_s.im * a })
    stamp(li, hi, { re: -Y_s.re * a, im: -Y_s.im * a })
  }

  // 1b. Cable series impedance — P1-3 parallel runs
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
    const len_km = cable.length_m / 1000
    const V_kv   = (srcNode.data.equipment as Bus).vn_kv
    const Z_base = (V_kv * V_kv) / S_BASE
    const R_pu   = (cable.r_ohm_per_km * len_km) / Z_base / par
    const X_pu   = (cable.x_ohm_per_km * len_km) / Z_base / par
    const Y_line = C.recip({ re: R_pu, im: X_pu })

    stamp(fi, fi, Y_line)
    stamp(ti, ti, Y_line)
    stamp(fi, ti, C.neg(Y_line))
    stamp(ti, fi, C.neg(Y_line))
  }

  // 1b-2. 3권선 변압기 성형 등가 (star equivalent) — P1-1 fix
  // IEC 60076-1 §8.9 + K_T 보정 적용
  const kt3wMap = new Map<string, { ktHv: number; ktMv: number; ktLv: number }>()

  for (const trNode of tr3wNodes) {
    const eq     = trNode.data.equipment as ThreeWindingTransformer
    const starId = trNode.id + '_STAR'
    const si     = nodeToIdxFull.get(starId)!

    // 연결 버스 탐색 (양방향 엣지 처리)
    const connBusIds: string[] = []
    for (const edge of edges) {
      if (!edge.data?.cable?.in_service) continue
      if (edge.source !== trNode.id && edge.target !== trNode.id) continue
      const otherId = edge.source === trNode.id ? edge.target : edge.source
      const busId = nodeMap.get(otherId)?.type === 'bus'
        ? otherId
        : findConnectedBusId(otherId, nodes, edges)
      if (busId && !connBusIds.includes(busId)) connBusIds.push(busId)
    }

    const sorted = connBusIds
      .map(id => ({ id, vn: (nodeMap.get(id)?.data.equipment as Bus).vn_kv ?? 0 }))
      .sort((a, b) => b.vn - a.vn)
    const [hvId, mvId, lvId] = sorted.map(p => p.id)
    if (!hvId || !mvId || !lvId) continue

    const hi = nodeToIdxFull.get(hvId)
    const mi = nodeToIdxFull.get(mvId)
    const li = nodeToIdxFull.get(lvId)
    if (hi === undefined || mi === undefined || li === undefined) continue

    // 성형 임피던스 — IEC 60076-1 §8.9 쌍 시험값 기반
    const Z_hv_mv = (eq.vk_hv_percent / 100) * (S_BASE / Math.min(eq.sn_hv_mva, eq.sn_mv_mva))
    const Z_hv_lv = (eq.vk_mv_percent / 100) * (S_BASE / Math.min(eq.sn_hv_mva, eq.sn_lv_mva))
    const Z_mv_lv = (eq.vk_lv_percent / 100) * (S_BASE / Math.min(eq.sn_mv_mva, eq.sn_lv_mva))

    const Xhv = Math.max((Z_hv_mv + Z_hv_lv - Z_mv_lv) / 2, 1e-6)
    const Xmv = Math.max((Z_hv_mv + Z_mv_lv - Z_hv_lv) / 2, 1e-6)
    const Xlv = Math.max((Z_hv_lv + Z_mv_lv - Z_hv_mv) / 2, 1e-6)

    const Rhv = (eq.vkr_hv_percent / 100) * (S_BASE / eq.sn_hv_mva)
    const Rmv = (eq.vkr_mv_percent / 100) * (S_BASE / eq.sn_mv_mva)
    const Rlv = (eq.vkr_lv_percent / 100) * (S_BASE / eq.sn_lv_mva)

    // K_T 보정 (IEC 60909 §3.3.3) — 각 권선별 적용
    const ktHv = calcKT(Rhv, Xhv)
    const ktMv = calcKT(Rmv, Xmv)
    const ktLv = calcKT(Rlv, Xlv)
    kt3wMap.set(trNode.id, { ktHv, ktMv, ktLv })

    const Y_hv = C.recip({ re: Rhv / ktHv, im: Xhv / ktHv })
    const Y_mv = C.recip({ re: Rmv / ktMv, im: Xmv / ktMv })
    const Y_lv = C.recip({ re: Rlv / ktLv, im: Xlv / ktLv })

    // 성형 가지 스탬핑: HV→star, MV→star, LV→star
    stamp(hi, hi, Y_hv);  stamp(si, si, Y_hv);  stamp(hi, si, C.neg(Y_hv));  stamp(si, hi, C.neg(Y_hv))
    stamp(mi, mi, Y_mv);  stamp(si, si, Y_mv);  stamp(mi, si, C.neg(Y_mv));  stamp(si, mi, C.neg(Y_mv))
    stamp(li, li, Y_lv);  stamp(si, si, Y_lv);  stamp(li, si, C.neg(Y_lv));  stamp(si, li, C.neg(Y_lv))

    if (_dev) console.log(
      `  TR3W "${eq.name}": K_T_HV=${ktHv.toFixed(3)} K_T_MV=${ktMv.toFixed(3)} K_T_LV=${ktLv.toFixed(3)}`
    )
  }

  // 1c. External grid Thevenin shunt at Slack buses
  for (const busNode of busNodes) {
    const busEq = busNode.data.equipment as Bus
    if (busEq.busType !== 'Slack') continue
    const idx = nodeToIdx.get(busNode.id)!

    const sc_mva   = busEq.sc_mva   ?? 5000
    const xr_ratio = busEq.xr_ratio ?? 10
    const Z_mag    = S_BASE / sc_mva
    const angle    = Math.atan(xr_ratio)
    const Y_grid   = C.recip({ re: Z_mag * Math.cos(angle), im: Z_mag * Math.sin(angle) })
    stamp(idx, idx, Y_grid)
  }

  // 1d. Synchronous generator Xd'' — P1-2 + P2-3 K_G correction
  const kgMap = new Map<string, number>()  // genNode.id → K_G value

  for (const genNode of nodes) {
    if (genNode.type !== 'generator' || !genNode.data.equipment.in_service) continue
    const gen = genNode.data.equipment as Generator
    if (!gen.xdpp_pu || gen.xdpp_pu <= 0) continue

    const busId = findConnectedBusId(genNode.id, nodes, edges)
    if (!busId) continue
    const idx = nodeToIdx.get(busId)
    if (idx === undefined) continue

    const xdpp_sys   = gen.xdpp_pu * (S_BASE / gen.sn_mva)
    const cos_phi_g  = gen.cos_phi_rated ?? gen.pf ?? 0.85
    const K_G        = calcKG(xdpp_sys, cos_phi_g)
    kgMap.set(genNode.id, K_G)

    // Y_gen_corrected = 1 / (j·K_G·Xd'') = { re: 0, im: -1/(K_G·xdpp_sys) }
    stamp(idx, idx, { re: 0, im: -1 / (K_G * xdpp_sys) })
    if (_dev) console.log(`  Gen "${gen.name}": Xd''_sys=${xdpp_sys.toFixed(4)} K_G=${K_G.toFixed(3)}`)
  }

  // P2-1: Induction motor contribution (IEC 60909 §4.3.4)
  // Each motor → Zm_sys = (1/LRC) × S_BASE/Sm  (purely reactive approx.)
  // LRC = starting_current_multiple (I_start / I_rated)
  // Sm_mva = rated_kw / 1000 / (efficiency/100 × power_factor)
  for (const motNode of nodes) {
    if (motNode.type !== 'motor' || !motNode.data.equipment.in_service) continue
    const mot = motNode.data.equipment as Motor
    if (!mot.starting_current_multiple || mot.starting_current_multiple <= 1) continue

    const busId = findConnectedBusId(motNode.id, nodes, edges)
    if (!busId) continue
    const idx = nodeToIdx.get(busId)
    if (idx === undefined) continue

    const eta    = Math.max((mot.efficiency ?? 94) / 100, 0.5)
    const pf     = Math.max(mot.power_factor ?? 0.85, 0.1)
    const sm_mva = (mot.rated_kw / 1000) / (eta * pf)    // apparent power MVA
    const Xm_sys = (1 / mot.starting_current_multiple) * (S_BASE / sm_mva)

    // Y_motor shunt = 1/(j·Xm) = { re: 0, im: -1/Xm_sys }
    stamp(idx, idx, { re: 0, im: -1 / Xm_sys })
  }

  // ── 2. P3-1: Z_kk diagonal — LU factorisation, no full inverse ──────────────
  // computeZBusDiagonal factorises Y once, then solves Y·z=eₖ per bus.
  // Avoids storing the N×N Z-bus matrix — critical for N > 50.
  const Z_diag = computeZBusDiagonal(Y)

  // ── 3. Fault quantities ──────────────────────────────────────────────────────
  const buses: Record<string, BusFaultResult> = {}

  if (_dev) {
    console.group('[ShortCircuit] IEC 60909 — P3-1: LU solver, P2: K_T/K_G/Motor')
    console.log(`  ${n} buses`)
  }

  for (const busNode of busNodes) {
    const busEq     = busNode.data.equipment as Bus
    const idx       = nodeToIdx.get(busNode.id)!
    const Z_kk      = Z_diag[idx]
    const Z_abs     = C.abs(Z_kk)
    const I_base_kA = S_BASE / (Math.sqrt(3) * busEq.vn_kv)

    if (Z_abs < 1e-10) {
      buses[busNode.id] = { nodeId: busNode.id, ikss_ka: 0, skss_mva: 0, ip_ka: 0, ib_ka: 0 }
      continue
    }

    const ikss_ka   = (C_MAX / Z_abs) * I_base_kA
    const skss_mva  = C_MAX * S_BASE / Z_abs
    const R_kk      = Z_kk.re
    const X_kk      = Z_kk.im
    const kappa     = Math.abs(X_kk) < 1e-9
      ? 1.02
      : 1.02 + 0.98 * Math.exp(-3 * R_kk / X_kk)
    const ip_ka     = kappa * Math.sqrt(2) * ikss_ka

    // IEC 60909-0 §4.7: Ib = μ × Ik'' (breaking current with DC decay)
    const mu    = calcMu(R_kk, X_kk)
    const ib_ka = mu * ikss_ka

    // P2-2: minimum fault current
    const c_min    = cMin(busEq.vn_kv)
    const ikss_ka_min = (c_min / Z_abs) * I_base_kA

    // P2-4: thermal equivalent current Ith (IEC 60909-0 §4.8)
    const ith_ka = calcIth(ikss_ka, R_kk, X_kk, TF_DEFAULT_S)

    buses[busNode.id] = {
      nodeId:       busNode.id,
      ikss_ka,
      skss_mva,
      ip_ka,
      ib_ka,
      ikss_ka_min,
      ith_ka,
      tf_s: TF_DEFAULT_S,
      kt_applied:   trNodes.some(tr => {
        const { hvBusId, lvBusId } = findTransformerBuses(tr.id, nodes, edges)
        return hvBusId === busNode.id || lvBusId === busNode.id
      }),
      kg_applied:   [...kgMap.keys()].some(id => {
        const busId = findConnectedBusId(id, nodes, edges)
        return busId === busNode.id
      }),
    }

    if (_dev) console.log(
      `  "${busEq.name}" [${busEq.vn_kv}kV]: Ik"=${ikss_ka.toFixed(3)} kA  Ith=${ith_ka.toFixed(3)} kA  Ik"_min=${ikss_ka_min.toFixed(3)} kA`
    )
  }

  if (_dev) console.groupEnd()
  return { buses }
}
