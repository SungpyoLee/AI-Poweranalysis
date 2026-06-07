/**
 * TCC (Time-Current Characteristic) Data Builder — IEC 60255
 * Pure function: no store/React dependencies.
 *
 * Added:
 *  - Cable short-time withstand curves (k·S / √t)
 *  - Transformer through-fault protection curve (ANSI C57.109)
 */
import type { Node, Edge } from 'reactflow'
import type { NodeData, EdgeData, Breaker, Transformer, RelayResult, RelayCurveType } from '../types'

// ── IEC 60255 + ANSI/IEEE C37.112 formula (local copy — keeps engine pure) ────
function iecTime(M: number, tms: number, curve: RelayCurveType): number | null {
  if (M <= 1.0) return null
  switch (curve) {
    // IEC 60255
    case 'IEC_NORMAL_INVERSE':    return (0.14  * tms) / (Math.pow(M, 0.02) - 1)
    case 'IEC_VERY_INVERSE':      return (13.5  * tms) / (M - 1)
    case 'IEC_EXTREMELY_INVERSE': return (80    * tms) / (M * M - 1)
    // ANSI/IEEE C37.112
    case 'ANSI_MODERATELY_INVERSE': return tms * (0.0515 / (Math.pow(M, 0.02) - 1) + 0.114)
    case 'ANSI_INVERSE':            return tms * (19.61  / (M * M - 1) + 0.491)
    case 'ANSI_VERY_INVERSE':       return tms * (28.2   / (M * M - 1) + 0.1217)
    case 'ANSI_EXTREMELY_INVERSE':  return tms * (29.1   / (M * M - 1) + 0.1217)
    case 'ANSI_SHORT_INVERSE':      return tms * (0.0086 / (Math.pow(M, 0.02) - 1) + 0.0228)
    default: return null
  }
}

// ── Types ─────────────────────────────────────────────────────────────────────
export interface TCCPoint { x: number; y: number }

export interface TCCCurve {
  breakerId:       string
  breakerName:     string
  busName:         string
  color:           string
  pickup_a:        number
  inst_a:          number | null
  points:          TCCPoint[]           // OCR curve (plotted line)
  instSegment:     [TCCPoint, TCCPoint] | null  // vertical cliff at inst pickup
  faultCurrent_a:  number
  operatingTime_s: number
  instTrip:        boolean
}

export interface TCCFaultLine {
  current_a: number
  label:     string    // bus name
}

export interface TCCMargin {
  current_a:   number
  time_low_s:  number  // downstream relay trip time
  time_high_s: number  // upstream relay trip time  (= low + margin)
  margin_s:    number
  pass:        boolean
}

// Cable short-time withstand curve: t = (k·S / I)²
export interface TCCCableWithstand {
  cableId:   string
  cableName: string
  mm2:       number   // cross section
  k:         number   // material constant (Cu=143, Al=94)
  points:    TCCPoint[]
}

// Transformer through-fault protection (ANSI C57.109 / IEC 60076-5)
export interface TCCTransformerDamage {
  transformerId:   string
  transformerName: string
  sn_mva:          number
  // Through-fault time limit curve: t = K / I_pu²
  freqFaultPoints: TCCPoint[]  // frequent faults (t = 1250/I²)
  rareFaultPoints: TCCPoint[]  // rare faults (t = 2·I² for Cat II+)
}

export interface TCCData {
  curves:              TCCCurve[]
  faultLines:          TCCFaultLine[]
  margins:             TCCMargin[]
  cableWithstands:     TCCCableWithstand[]
  transformerDamages:  TCCTransformerDamage[]
  xMin:       number
  xMax:       number
  yMin:       number
  yMax:       number
}

// ── Color palette for up to 8 relays ─────────────────────────────────────────
const COLORS = [
  '#1a6aff', '#e03000', '#008030', '#8800cc',
  '#cc7700', '#006080', '#aa0044', '#2a6a00',
]

// ── Cable withstand curve builder ─────────────────────────────────────────────
// t = (k·S / I)²  where k=143 Cu, 94 Al; S in mm²; I in A
function buildCableWithstand(
  edges: Edge<EdgeData>[],
  xMin: number,
  xMax: number,
): TCCCableWithstand[] {
  const result: TCCCableWithstand[] = []
  for (const e of edges) {
    const cable = e.data?.cable
    if (!cable || !cable.in_service) continue
    const r = cable.r_ohm_per_km ?? 0
    if (r <= 0) continue
    // Estimate cross section from resistivity of copper at 70°C
    const mm2 = Math.round(20.63 / r)
    if (mm2 <= 0 || mm2 > 1000) continue
    const k = 143  // Cu XLPE / PVC 70°C
    const points: TCCPoint[] = []
    // Generate I from xMin to xMax, compute t
    for (let logI = Math.log10(xMin); logI <= Math.log10(xMax); logI += 0.1) {
      const I = Math.pow(10, logI)
      const t = Math.pow((k * mm2) / I, 2)
      if (t >= 0.01 && t <= 100) points.push({ x: I, y: t })
    }
    if (points.length >= 2) {
      result.push({ cableId: e.id, cableName: cable.name, mm2, k, points })
    }
  }
  return result
}

// ── Transformer damage curve builder (ANSI C57.109 Category I/II) ─────────────
// Through-fault limit for Cat I (≤5 MVA): t = 1250 / I_pu²
// Through-fault limit for Cat II (5–500 MVA): frequent = 1250/I², rare = 50/I²
// I_pu = I / I_rated_base
function buildTransformerDamage(
  nodes: Node<NodeData>[],
  xMin:  number,
  xMax:  number,
): TCCTransformerDamage[] {
  const result: TCCTransformerDamage[] = []
  for (const n of nodes) {
    if (n.type !== 'transformer' || !n.data.equipment.in_service) continue
    const eq = n.data.equipment as Transformer
    if (!eq.sn_mva || eq.sn_mva <= 0) continue

    // Reference current = transformer rated current at LV side (approx from LV kV)
    // Without network context, use a per-unit approach: I_pu = I / I_base_lv
    const vLV = eq.vn_lv_kv || 1
    const I_base_lv = (eq.sn_mva * 1000) / (Math.sqrt(3) * vLV)  // A

    // Build curve using per-unit current
    const freqFaultPoints: TCCPoint[] = []
    const rareFaultPoints: TCCPoint[] = []

    for (let logI = Math.log10(xMin); logI <= Math.log10(xMax); logI += 0.1) {
      const I = Math.pow(10, logI)
      const I_pu = I / I_base_lv
      if (I_pu < 0.5 || I_pu > 25) continue

      // Frequent fault limit: t = 1250 / I_pu²  (Cat I/II — upper limit)
      const t_freq = 1250 / (I_pu * I_pu)
      // Rare fault limit for Cat II (≥5 MVA): lower curve
      const t_rare = eq.sn_mva >= 5 ? 50 / (I_pu * I_pu) : t_freq

      if (t_freq >= 0.01 && t_freq <= 100) freqFaultPoints.push({ x: I, y: t_freq })
      if (t_rare >= 0.01 && t_rare <= 100) rareFaultPoints.push({ x: I, y: t_rare })
    }

    if (freqFaultPoints.length >= 2) {
      result.push({
        transformerId:   n.id,
        transformerName: eq.name,
        sn_mva:          eq.sn_mva,
        freqFaultPoints,
        rareFaultPoints,
      })
    }
  }
  return result
}

// ── Main export ───────────────────────────────────────────────────────────────
export function buildTCCData(
  relayResults: RelayResult[],
  nodes:        Node<NodeData>[],
  edges:        Edge<EdgeData>[] = [],
): TCCData {
  const empty: TCCData = {
    curves: [], faultLines: [], margins: [],
    cableWithstands: [], transformerDamages: [],
    xMin: 100, xMax: 10000, yMin: 0.01, yMax: 100,
  }
  if (relayResults.length === 0) return empty

  const nodeMap = new Map(nodes.map(n => [n.id, n]))

  // ── Compute x range ────────────────────────────────────────────────────────
  let xMin = Infinity, xMax = 0
  for (const r of relayResults) {
    const relay = (nodeMap.get(r.breakerId)?.data.equipment as Breaker | undefined)?.relay
    if (!relay) continue
    xMin = Math.min(xMin, relay.pickup_current_a * 0.5)
    xMax = Math.max(xMax, r.fault_current_ka * 1000 * 3)
  }
  if (!isFinite(xMin)) return empty

  xMin = Math.pow(10, Math.floor(Math.log10(xMin)))
  xMax = Math.pow(10, Math.ceil(Math.log10(xMax)))
  const yMin = 0.01, yMax = 100

  // ── Build curves ──────────────────────────────────────────────────────────
  const curves: TCCCurve[] = []
  const seenFaults = new Map<number, string>()

  for (let ci = 0; ci < relayResults.length; ci++) {
    const r     = relayResults[ci]
    const relay = (nodeMap.get(r.breakerId)?.data.equipment as Breaker | undefined)?.relay
    if (!relay) continue

    const pickup_a = relay.pickup_current_a
    const inst_a   = relay.inst_enabled ? relay.inst_pickup_a : null
    const fault_a  = r.fault_current_ka * 1000
    const color    = COLORS[ci % COLORS.length]

    // OCR curve: 300 log-spaced multiples from 1.005 up to inst limit or 20
    const maxM    = inst_a ? Math.min(20, (inst_a / pickup_a) * 0.999) : 20
    const points: TCCPoint[] = []
    for (let i = 0; i <= 300; i++) {
      const M = 1.005 * Math.pow(maxM / 1.005, i / 300)
      const t = iecTime(M, relay.time_dial, relay.curve_type)
      if (t === null || t < yMin || t > yMax) continue
      const I = M * pickup_a
      if (I < xMin || I > xMax) continue
      points.push({ x: I, y: t })
    }

    // Instantaneous vertical cliff
    let instSegment: [TCCPoint, TCCPoint] | null = null
    if (inst_a && inst_a >= xMin && inst_a <= xMax) {
      const t_top = iecTime((inst_a / pickup_a) * 0.999, relay.time_dial, relay.curve_type)
      instSegment = [
        { x: inst_a, y: Math.min(t_top ?? 0.5, yMax) },
        { x: inst_a, y: 0.02 },
      ]
    }

    curves.push({
      breakerId: r.breakerId, breakerName: r.breakerName, busName: r.busName,
      color, pickup_a, inst_a, points, instSegment,
      faultCurrent_a:  fault_a,
      operatingTime_s: r.relay_operating_time_s,
      instTrip:        r.inst_trip,
    })

    if (!seenFaults.has(fault_a)) seenFaults.set(fault_a, r.busName)
  }

  // ── Fault lines ───────────────────────────────────────────────────────────
  const faultLines: TCCFaultLine[] = [...seenFaults.entries()].map(
    ([current_a, label]) => ({ current_a, label }),
  )

  // ── Coordination margin annotations ───────────────────────────────────────
  const margins: TCCMargin[] = []
  for (const r of relayResults) {
    if (!isFinite(r.coordination_margin_s)) continue
    if (r.relay_operating_time_s <= 0 || !isFinite(r.relay_operating_time_s)) continue
    const t_down = r.relay_operating_time_s
    const t_up   = t_down + r.coordination_margin_s
    if (t_up > yMax) continue
    margins.push({
      current_a:   r.fault_current_ka * 1000,
      time_low_s:  t_down,
      time_high_s: t_up,
      margin_s:    r.coordination_margin_s,
      pass:        r.pass,
    })
  }

  // ── Cable withstand + transformer damage curves ───────────────────────────
  const cableWithstands    = buildCableWithstand(edges, xMin, xMax)
  const transformerDamages = buildTransformerDamage(nodes, xMin, xMax)

  return { curves, faultLines, margins, cableWithstands, transformerDamages, xMin, xMax, yMin, yMax }
}
