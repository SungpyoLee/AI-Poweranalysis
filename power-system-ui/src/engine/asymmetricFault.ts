/**
 * IEC 60909 비대칭 단락계산 (Asymmetric Fault Analysis)
 *
 * 계산 유형:
 *   3P  : 3상 평형 단락 (기존 shortcircuit.ts 재활용)
 *   1LG : 1선 지락  Ik1 = 3c·I_base / |Z1+Z2+Z0|
 *   LL  : 선간 단락  Ik2 = √3·c·I_base / |Z1+Z2|
 *   2LG : 2선 지락  Ik2g from Z1,Z2,Z0 sequence networks
 *
 * 가정:
 *   - 모든 변압기 = DYn11 (산업용 표준)
 *     → 1차측(Delta)은 영상 전류 차단, 2차측(Y-n)에서만 영상 전류 흐름
 *   - 부하(모터/부하)는 기여 없음 (보수적 계산)
 *   - Z2 ≈ Z1 (수동 소자 가정)
 *   - Z0_grid : Slack 버스에서 제공 (기본 Z0 = Z1)
 */

import type { Node, Edge } from 'reactflow'
import type { NodeData, EdgeData, Bus, Transformer, ThreeWindingTransformer, Cable, TransformerVectorGroup } from '../types'
import { C, type Complex } from './complex'
import { S_BASE } from './ybus'
import { complexMatInv } from './complexMatrix'
import { findTransformerBuses, findConnectedBusId } from '../utils/graphTraversal'

export interface BusAsymResult {
  nodeId:    string
  // 3상 평형
  ik3_ka:    number
  ip3_ka:    number
  // 1선 지락
  ik1_ka:    number
  ip1_ka:    number
  // 선간
  ik2_ka:    number
  // 2선 지락
  ik2g_ka:   number
  // 최악 고장 유형
  worst_type: '3P' | '1LG' | 'LL' | '2LG'
  worst_ka:   number
  // 결정 배경
  z1_pu: number   // |Z1_kk|
  z0_pu: number   // |Z0_kk|
}

export interface AsymFaultResults {
  buses: Record<string, BusAsymResult>
}

const C_MAX = 1.1  // IEC 60909 voltage factor

// ── 공통: Y1 행렬 (양상 어드미턴스) 구축 ────────────────────────────────────
function buildY1(
  busOrder: string[],
  nodes: Node<NodeData>[],
  edges: Edge<EdgeData>[],
  nodeToIdx: Map<string, number>,
  nodeMap: Map<string, Node<NodeData>>,
): Complex[][] {
  const n = busOrder.length
  const Y1: Complex[][] = Array.from({ length: n }, () =>
    Array.from({ length: n }, () => C.zero())
  )
  const stamp = (i: number, j: number, y: Complex) => { Y1[i][j] = C.add(Y1[i][j], y) }

  // 변압기
  const trNodes = nodes.filter(nd => nd.type === 'transformer' && nd.data.equipment.in_service)
  for (const trNode of trNodes) {
    const eq = trNode.data.equipment as Transformer
    const { hvBusId, lvBusId } = findTransformerBuses(trNode.id, nodes, edges)
    if (!hvBusId || !lvBusId) continue
    const hi = nodeToIdx.get(hvBusId); const li = nodeToIdx.get(lvBusId)
    if (hi === undefined || li === undefined) continue
    const vkr = eq.vkr_percent / 100; const vk = eq.vk_percent / 100
    const Xk  = Math.sqrt(Math.max(vk * vk - vkr * vkr, 0))
    const s   = S_BASE / eq.sn_mva
    const a   = 1 + (eq.tap_pos - eq.tap_neutral) * (eq.tap_step_percent / 100)
    const Ys  = C.recip({ re: vkr * s, im: Xk * s })
    stamp(hi, hi, { re: Ys.re * a * a, im: Ys.im * a * a })
    stamp(li, li, Ys)
    stamp(hi, li, { re: -Ys.re * a, im: -Ys.im * a })
    stamp(li, hi, { re: -Ys.re * a, im: -Ys.im * a })
  }

  // 3권선 변압기 — Kron 축약으로 가상 성형점 제거 (3×3 버스 등가)
  // Y_hm = Y_hv × Y_mv / Y_tot, Y_hl = Y_hv × Y_lv / Y_tot, Y_ml = Y_mv × Y_lv / Y_tot
  const tr3wNodes = nodes.filter(nd => nd.type === 'transformer3w' && nd.data.equipment.in_service)
  for (const trNode of tr3wNodes) {
    const eq = trNode.data.equipment as ThreeWindingTransformer
    // 연결 버스 탐색 (양방향)
    const connBusIds: string[] = []
    for (const e of edges) {
      if (!e.data?.cable?.in_service) continue
      if (e.source !== trNode.id && e.target !== trNode.id) continue
      const otherId = e.source === trNode.id ? e.target : e.source
      const busId = nodeMap.get(otherId)?.type === 'bus'
        ? otherId : findConnectedBusId(otherId, nodes, edges)
      if (busId && !connBusIds.includes(busId)) connBusIds.push(busId)
    }
    const sorted = connBusIds
      .map(id => ({ id, vn: (nodeMap.get(id)?.data.equipment as Bus).vn_kv ?? 0 }))
      .sort((a, b) => b.vn - a.vn)
    const [hvId, mvId, lvId] = sorted.map(s => s.id)
    if (!hvId || !mvId || !lvId) continue
    const hi = nodeToIdx.get(hvId); const mi = nodeToIdx.get(mvId); const li = nodeToIdx.get(lvId)
    if (hi === undefined || mi === undefined || li === undefined) continue

    const Z_hv_mv = (eq.vk_hv_percent / 100) * (S_BASE / Math.min(eq.sn_hv_mva, eq.sn_mv_mva))
    const Z_hv_lv = (eq.vk_mv_percent / 100) * (S_BASE / Math.min(eq.sn_hv_mva, eq.sn_lv_mva))
    const Z_mv_lv = (eq.vk_lv_percent / 100) * (S_BASE / Math.min(eq.sn_mv_mva, eq.sn_lv_mva))
    const Xhv = Math.max((Z_hv_mv + Z_hv_lv - Z_mv_lv) / 2, 1e-6)
    const Xmv = Math.max((Z_hv_mv + Z_mv_lv - Z_hv_lv) / 2, 1e-6)
    const Xlv = Math.max((Z_hv_lv + Z_mv_lv - Z_hv_mv) / 2, 1e-6)
    const Rhv = (eq.vkr_hv_percent / 100) * (S_BASE / eq.sn_hv_mva)
    const Rmv = (eq.vkr_mv_percent / 100) * (S_BASE / eq.sn_mv_mva)
    const Rlv = (eq.vkr_lv_percent / 100) * (S_BASE / eq.sn_lv_mva)

    const Yhv = C.recip({ re: Rhv, im: Xhv })
    const Ymv = C.recip({ re: Rmv, im: Xmv })
    const Ylv = C.recip({ re: Rlv, im: Xlv })
    // Ytot = Yhv + Ymv + Ylv
    const Ytot = C.add(C.add(Yhv, Ymv), Ylv)
    if (C.abs(Ytot) < 1e-12) continue

    // Kron 축약: Y_ij = -Y_i × Y_j / Y_tot (오프-다이어그널 음수)
    const Yhm = C.div(C.mul(Yhv, Ymv), Ytot)
    const Yhl = C.div(C.mul(Yhv, Ylv), Ytot)
    const Yml = C.div(C.mul(Ymv, Ylv), Ytot)

    // 자기 어드미턴스: Y_ii = Y_i - Y_i²/Y_tot = Y_i×(Y_tot-Y_i)/Y_tot
    stamp(hi, hi, C.div(C.mul(Yhv, C.add(Ymv, Ylv)), Ytot))
    stamp(mi, mi, C.div(C.mul(Ymv, C.add(Yhv, Ylv)), Ytot))
    stamp(li, li, C.div(C.mul(Ylv, C.add(Yhv, Ymv)), Ytot))
    stamp(hi, mi, C.neg(Yhm)); stamp(mi, hi, C.neg(Yhm))
    stamp(hi, li, C.neg(Yhl)); stamp(li, hi, C.neg(Yhl))
    stamp(mi, li, C.neg(Yml)); stamp(li, mi, C.neg(Yml))
  }

  // 케이블 (버스-버스)
  for (const e of edges) {
    if (!e.data?.cable?.in_service) continue
    const sn = nodeMap.get(e.source); const tn = nodeMap.get(e.target)
    if (sn?.type !== 'bus' || tn?.type !== 'bus') continue
    const fi = nodeToIdx.get(e.source); const ti = nodeToIdx.get(e.target)
    if (fi === undefined || ti === undefined) continue
    const cable = e.data.cable as Cable
    const len   = cable.length_m / 1000
    const Vkv   = (sn.data.equipment as Bus).vn_kv
    const Zb    = (Vkv * Vkv) / S_BASE
    const Yl    = C.recip({ re: cable.r_ohm_per_km * len / Zb, im: cable.x_ohm_per_km * len / Zb })
    stamp(fi, fi, Yl); stamp(ti, ti, Yl)
    stamp(fi, ti, C.neg(Yl)); stamp(ti, fi, C.neg(Yl))
  }

  // 계통 (Slack bus Thevenin)
  for (const busNode of nodes.filter(n => n.type === 'bus' && n.data.equipment.in_service)) {
    const busEq = busNode.data.equipment as Bus
    if (busEq.busType !== 'Slack') continue
    const idx = nodeToIdx.get(busNode.id); if (idx === undefined) continue
    const sc = busEq.sc_mva ?? 5000; const xr = busEq.xr_ratio ?? 10
    const Zmag  = S_BASE / sc; const ang = Math.atan(xr)
    stamp(idx, idx, C.recip({ re: Zmag * Math.cos(ang), im: Zmag * Math.sin(ang) }))
  }

  return Y1
}

// ── 영상 어드미턴스 행렬 Y0 ──────────────────────────────────────────────────
// DYn 변압기: 1차(△)는 영상전류 차단 → LV bus에 shunt로만 등장
// 케이블: r0, x0 사용
// Grid: Z0 ≈ Z1 (보수적)
function buildY0(
  busOrder: string[],
  nodes: Node<NodeData>[],
  edges: Edge<EdgeData>[],
  nodeToIdx: Map<string, number>,
  nodeMap: Map<string, Node<NodeData>>,
): Complex[][] {
  const n = busOrder.length
  const Y0: Complex[][] = Array.from({ length: n }, () =>
    Array.from({ length: n }, () => C.zero())
  )
  const stamp = (i: number, j: number, y: Complex) => { Y0[i][j] = C.add(Y0[i][j], y) }

  // 변압기 영상분 임피던스 처리 (vector_group 기반)
  // Dyn, Yd: HV delta → 영상전류 차단. Z0는 LV쪽 shunt만 등장.
  // YNyn, YNd: HV grounded Y → 양측 all-through. Z0 series 연결.
  // Dy, Dd: 양측 delta → 영상전류 완전 차단 (Z0 = ∞)
  const trNodes = nodes.filter(nd => nd.type === 'transformer' && nd.data.equipment.in_service)
  for (const trNode of trNodes) {
    const eq = trNode.data.equipment as Transformer
    const vg: TransformerVectorGroup = eq.vector_group ?? 'Dyn11'
    const { hvBusId, lvBusId } = findTransformerBuses(trNode.id, nodes, edges)
    if (!lvBusId) continue
    const li = nodeToIdx.get(lvBusId)
    const hi = hvBusId ? nodeToIdx.get(hvBusId) : undefined
    if (li === undefined) continue

    // Zero-sequence impedance: prefer explicit vk0/vkr0, else use positive-seq as fallback
    const vkr0 = (eq.vkr0_percent ?? eq.vkr_percent) / 100
    const vk0  = (eq.vk0_percent  ?? eq.vk_percent)  / 100
    const Xk0  = Math.sqrt(Math.max(vk0 * vk0 - vkr0 * vkr0, 0))
    const s    = S_BASE / eq.sn_mva

    const hvGrounded = vg.startsWith('YN')  // HV grounded Y
    const lvGrounded = vg.includes('yn') || vg.includes('Yn')  // LV grounded Y
    const hvDelta    = vg.startsWith('D') || vg.startsWith('d')
    const lvDelta    = vg.endsWith('d') || vg.endsWith('D')

    if (hvDelta && lvGrounded) {
      // Dyn: LV shunt admittance (delta HV blocks zero-seq)
      if (li !== undefined)
        stamp(li, li, C.recip({ re: vkr0 * s, im: Xk0 * s }))
    } else if (hvGrounded && lvGrounded && hi !== undefined && li !== undefined) {
      // YNyn: zero-seq flows through — series admittance (through Z0)
      const Y0s = C.recip({ re: vkr0 * s, im: Xk0 * s })
      stamp(hi, hi, Y0s); stamp(li, li, Y0s)
      stamp(hi, li, C.neg(Y0s)); stamp(li, hi, C.neg(Y0s))
    } else if (hvGrounded && lvDelta && hi !== undefined) {
      // YNd: HV grounded, LV delta — HV shunt only
      stamp(hi, hi, C.recip({ re: vkr0 * s, im: Xk0 * s }))
    } else if (hvDelta && lvDelta) {
      // Dd: both delta — zero-seq fully isolated, no stamp needed
    } else if (lvGrounded && li !== undefined) {
      // Other Yn LV configurations: LV shunt
      stamp(li, li, C.recip({ re: vkr0 * s, im: Xk0 * s }))
    }
  }

  // 3권선 변압기 Y0 — YNyn 가정: 보수적으로 LV/MV winding shunt (접지 중성점 경로)
  const tr3wNodes0 = nodes.filter(nd => nd.type === 'transformer3w' && nd.data.equipment.in_service)
  for (const trNode of tr3wNodes0) {
    const eq = trNode.data.equipment as ThreeWindingTransformer
    const connBusIds: string[] = []
    for (const e of edges) {
      if (!e.data?.cable?.in_service) continue
      if (e.source !== trNode.id && e.target !== trNode.id) continue
      const otherId = e.source === trNode.id ? e.target : e.source
      const busId = nodeMap.get(otherId)?.type === 'bus'
        ? otherId : findConnectedBusId(otherId, nodes, edges)
      if (busId && !connBusIds.includes(busId)) connBusIds.push(busId)
    }
    const sorted = connBusIds
      .map(id => ({ id, vn: (nodeMap.get(id)?.data.equipment as Bus).vn_kv ?? 0 }))
      .sort((a, b) => b.vn - a.vn)
    const [, mvId, lvId] = sorted.map(s => s.id)
    // MV + LV winding: shunt to ground (zero sequence current path via grounded neutral)
    for (const [busId, Sn, vkrP, vkP] of [
      [mvId, eq.sn_mv_mva, eq.vkr_mv_percent, Math.sqrt(Math.max(eq.vk_mv_percent**2 - eq.vkr_mv_percent**2, 0))],
      [lvId, eq.sn_lv_mva, eq.vkr_lv_percent, Math.sqrt(Math.max(eq.vk_lv_percent**2 - eq.vkr_lv_percent**2, 0))],
    ] as [string, number, number, number][]) {
      if (!busId) continue
      const idx = nodeToIdx.get(busId); if (idx === undefined) continue
      const s = S_BASE / Sn
      stamp(idx, idx, C.recip({ re: vkrP / 100 * s, im: vkP / 100 * s }))
    }
  }

  // 케이블: 영상 임피던스 r0, x0 사용
  for (const e of edges) {
    if (!e.data?.cable?.in_service) continue
    const sn = nodeMap.get(e.source); const tn = nodeMap.get(e.target)
    if (sn?.type !== 'bus' || tn?.type !== 'bus') continue
    const fi = nodeToIdx.get(e.source); const ti = nodeToIdx.get(e.target)
    if (fi === undefined || ti === undefined) continue
    const cable = e.data.cable as Cable
    const len   = cable.length_m / 1000
    const Vkv   = (sn.data.equipment as Bus).vn_kv
    const Zb    = (Vkv * Vkv) / S_BASE
    const r0    = (cable.r0_ohm_per_km ?? cable.r_ohm_per_km * 3) * len / Zb
    const x0    = (cable.x0_ohm_per_km ?? cable.x_ohm_per_km * 3) * len / Zb
    if (r0 < 1e-10 && x0 < 1e-10) continue
    const Y0l = C.recip({ re: r0, im: x0 })
    stamp(fi, fi, Y0l); stamp(ti, ti, Y0l)
    stamp(fi, ti, C.neg(Y0l)); stamp(ti, fi, C.neg(Y0l))
  }

  // Grid Z0 ≈ Z1 (같은 임피던스 사용)
  for (const busNode of nodes.filter(n => n.type === 'bus' && n.data.equipment.in_service)) {
    const busEq = busNode.data.equipment as Bus
    if (busEq.busType !== 'Slack') continue
    const idx = nodeToIdx.get(busNode.id); if (idx === undefined) continue
    const sc = busEq.sc_mva ?? 5000; const xr = busEq.xr_ratio ?? 10
    const Zmag  = S_BASE / sc; const ang = Math.atan(xr)
    stamp(idx, idx, C.recip({ re: Zmag * Math.cos(ang), im: Zmag * Math.sin(ang) }))
  }

  return Y0
}

// ── κ 계수 (IEC 60909) ───────────────────────────────────────────────────────
function kappa(Zkk: Complex): number {
  const { re, im } = Zkk
  return Math.abs(im) < 1e-9 ? 1.02 : 1.02 + 0.98 * Math.exp(-3 * re / im)
}

// ── 메인 함수 ─────────────────────────────────────────────────────────────────
export function runAsymmetricFault(
  nodes: Node<NodeData>[],
  edges: Edge<EdgeData>[],
): AsymFaultResults {
  const busNodes  = nodes.filter(n => n.type === 'bus' && n.data.equipment.in_service)
  const busOrder  = busNodes.map(b => b.id)
  const nodeToIdx = new Map(busOrder.map((id, i) => [id, i] as [string, number]))
  const nodeMap   = new Map(nodes.map(n => [n.id, n]))

  if (busOrder.length === 0) return { buses: {} }

  // 양상·영상 어드미턴스 행렬 → 임피던스 행렬 (LU 역행렬, 특이 행렬 시 graceful 처리)
  const Y1 = buildY1(busOrder, nodes, edges, nodeToIdx, nodeMap)
  const Y0 = buildY0(busOrder, nodes, edges, nodeToIdx, nodeMap)

  let Z1bus: ReturnType<typeof complexMatInv>
  let Z0bus: ReturnType<typeof complexMatInv>
  try {
    Z1bus = complexMatInv(Y1)
  } catch {
    // 연결 안 된 버스가 있으면 대각에 작은 값 추가 후 재시도
    for (let i = 0; i < Y1.length; i++) Y1[i][i] = C.add(Y1[i][i], { re: 1e-6, im: 0 })
    Z1bus = complexMatInv(Y1)
  }
  try {
    Z0bus = complexMatInv(Y0)
  } catch {
    // 영상 행렬 singular → 영상 임피던스를 Z1과 같다고 가정 (보수적)
    Z0bus = Z1bus
  }

  const buses: AsymFaultResults['buses'] = {}

  for (const busNode of busNodes) {
    const busEq  = busNode.data.equipment as Bus
    const idx    = nodeToIdx.get(busNode.id)!
    const Z1kk   = Z1bus[idx][idx]
    const Z0kk   = Z0bus[idx][idx]
    const Z2kk   = Z1kk   // Z2 ≈ Z1

    const z1 = C.abs(Z1kk);  const z0 = C.abs(Z0kk)
    if (z1 < 1e-10) {
      buses[busNode.id] = { nodeId: busNode.id, ik3_ka: 0, ip3_ka: 0, ik1_ka: 0, ip1_ka: 0,
        ik2_ka: 0, ik2g_ka: 0, worst_type: '3P', worst_ka: 0, z1_pu: 0, z0_pu: 0 }
      continue
    }

    const Ib = S_BASE / (Math.sqrt(3) * busEq.vn_kv)   // kA

    // 3상 평형
    const ik3 = C_MAX / z1 * Ib
    const k3  = kappa(Z1kk)
    const ip3 = k3 * Math.sqrt(2) * ik3

    // 1선 지락: 3c/(Z1+Z2+Z0)
    const Z_1LG = C.add(C.add(Z1kk, Z2kk), Z0kk)
    const ik1   = (3 * C_MAX) / C.abs(Z_1LG) * Ib
    const ip1   = kappa(Z_1LG) * Math.sqrt(2) * ik1

    // 선간 단락: √3·c/(Z1+Z2)
    const Z_LL = C.add(Z1kk, Z2kk)
    const ik2  = (Math.sqrt(3) * C_MAX) / C.abs(Z_LL) * Ib

    // 2선 지락: |I_a1| × √3 where I_a1 = c/(Z1 + Z2·Z0/(Z2+Z0))
    const Z2Z0 = C.mul(Z2kk, Z0kk)
    const Z2pZ0 = C.add(Z2kk, Z0kk)
    const Z_par = C.abs(Z2pZ0) < 1e-10
      ? C.zero()
      : { re: Z2Z0.re * (Z2pZ0.re / (Z2pZ0.re ** 2 + Z2pZ0.im ** 2)),
          im: Z2Z0.im * (Z2pZ0.re / (Z2pZ0.re ** 2 + Z2pZ0.im ** 2)) -
              Z2Z0.re * (Z2pZ0.im / (Z2pZ0.re ** 2 + Z2pZ0.im ** 2)) }
    const Z_2LG  = C.add(Z1kk, Z_par)
    const Ia1_2LG = C_MAX / C.abs(Z_2LG) * Ib
    // 지락 점 전류 근사: 3상 중 최대 = √3 × |Ia1|
    const ik2g = Math.sqrt(3) * Ia1_2LG

    // 최악 고장 유형
    const candidates: Array<{ type: BusAsymResult['worst_type']; ka: number }> = [
      { type: '3P',  ka: ik3  },
      { type: '1LG', ka: ik1  },
      { type: 'LL',  ka: ik2  },
      { type: '2LG', ka: ik2g },
    ]
    const worst = candidates.reduce((a, b) => a.ka >= b.ka ? a : b)

    buses[busNode.id] = { nodeId: busNode.id,
      ik3_ka: ik3, ip3_ka: ip3, ik1_ka: ik1, ip1_ka: ip1,
      ik2_ka: ik2, ik2g_ka: ik2g,
      worst_type: worst.type, worst_ka: worst.ka,
      z1_pu: z1, z0_pu: z0,
    }
  }

  return { buses }
}
