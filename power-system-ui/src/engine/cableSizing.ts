/**
 * Cable Sizing Engine — IEC 60364
 * Three checks per cable:
 *   1. Ampacity     : I_load ≤ max_i_ka × 1000
 *   2. Voltage drop : ΔV% ≤ limit (3% LV / 5% MV/HV)
 *   3. SC withstand : k × S_mm² / (√t × 1000) ≥ Ik″ [kA]
 */
import type { Node, Edge } from 'reactflow'
import type {
  NodeData, EdgeData, Bus, Motor, Load, Breaker,
  LoadflowResults, ShortCircuitResults,
  CableSizingResult, CableSizingResults,
  Cable as CableType, CableInstallMethod,
} from '../types'
import LIBRARY from '../library/cableAmpacity.json'

// ── Library entry type ────────────────────────────────────────────────────────
interface LibEntry {
  voltage_level:          'LV' | 'MV' | 'HV'
  model:                  string
  cross_section_mm2:      number
  ampacity_a:             number
  r_ohm_per_km:           number
  x_ohm_per_km:           number
  short_circuit_constant: number
}

const CABLE_LIBRARY = (LIBRARY as LibEntry[]).sort(
  (a, b) => a.cross_section_mm2 - b.cross_section_mm2,
)

// ── Helpers ───────────────────────────────────────────────────────────────────
const DEFAULT_COS_PHI = 0.85

function voltageLevel(vn_kv: number): 'LV' | 'MV' | 'HV' {
  if (vn_kv <= 1.0) return 'LV'
  if (vn_kv <= 35)  return 'MV'
  return 'HV'
}

function vdropLimit(vn_kv: number): number {
  return vn_kv <= 1.0 ? 3.0 : 5.0
}

/** ΔV% for 3-phase cable.
 *  ΔV% = √3 × I[A] × L[km] × (R cosφ + X sinφ) × 100 / (V_nom[kV] × 1000)
 */
function computeVdrop(
  i_a: number, l_km: number,
  r_ohm_per_km: number, x_ohm_per_km: number,
  v_kv: number,
  cos_phi = DEFAULT_COS_PHI,   // P1-4: 실제 역률 사용
): number {
  if (v_kv <= 0 || l_km <= 0) return 0
  const sin_phi = Math.sqrt(Math.max(1 - cos_phi * cos_phi, 0))
  const zEff = r_ohm_per_km * cos_phi + x_ohm_per_km * sin_phi
  return (Math.sqrt(3) * i_a * l_km * zEff * 100) / (v_kv * 1000)
}

/** SC withstand [kA] for a given cross section and clearing time. */
function scWithstand(mm2: number, k: number, t_s: number): number {
  if (t_s <= 0 || mm2 <= 0) return 0
  return (k * mm2) / (Math.sqrt(t_s) * 1000)
}

// ── IEC 60287 / IEC 60364-5-52 Derating factor calculation ──────────────────
// Temperature correction: Ct = √((Tmax - Ta) / (Tmax - 30))
// where Tmax = max conductor temp, Ta = ambient temp, 30°C = reference ambient
function tempCorrectionFactor(ambient_temp_c: number, ref_temp_c: number): number {
  const Ta   = ambient_temp_c
  const Tmax = ref_temp_c
  if (Tmax <= Ta) return 1.0  // avoid sqrt of negative
  const factor = (Tmax - Ta) / (Tmax - 30)
  return factor > 0 ? Math.sqrt(factor) : 1.0
}

// Installation method base derating (IEC 60364-5-52 Table B.52.2 representative values)
const INSTALL_METHOD_FACTOR: Record<CableInstallMethod, number> = {
  IN_AIR:        1.00,  // free air — reference
  CLIPPED:       0.95,  // surface clipped
  TRAY_SPACED:   0.90,  // cable tray with spacing
  TRAY_TOUCHING: 0.80,  // cable tray touching (grouped)
  DUCT:          0.75,  // in conduit/duct (worst ventilation)
  DIRECT_BURIED: 0.85,  // direct buried in soil
}

// Combined derating factor for a cable
function cableDeratingFactor(cable: CableType): number {
  const Ta   = cable.ambient_temp_c ?? 40
  const Tmax = cable.ref_temp_c ?? 70  // PVC=70, XLPE/EPR=90
  const Ct   = tempCorrectionFactor(Ta, Tmax)
  const Cm   = INSTALL_METHOD_FACTOR[cable.installation_method ?? 'IN_AIR'] ?? 1.0
  const Cg   = cable.grouping_factor ?? 1.0
  return Ct * Cm * Cg
}

/** Estimate cross-section [mm²] from conductor resistance.
 *  ρ_Cu at 70°C ≈ 0.02063 Ω·mm²/m → S ≈ 20.63 / R_Ω_per_km
 */
function estimateMM2(r_ohm_per_km: number): number {
  if (r_ohm_per_km <= 0) return 0
  const raw = 20.63 / r_ohm_per_km
  const standards = [16, 25, 35, 50, 70, 95, 120, 150, 185, 200, 240, 300, 325, 400, 500]
  return standards.reduce((prev, cur) =>
    Math.abs(cur - raw) < Math.abs(prev - raw) ? cur : prev
  )
}

/** Resolve a nodeId through closed breakers to the nearest Bus. */
function resolveTobus(
  nodeId: string,
  nodeMap: Map<string, Node<NodeData>>,
  edgesByNode: Map<string, Edge<EdgeData>[]>,
  depth = 0,
): string | null {
  if (depth > 6) return null
  const node = nodeMap.get(nodeId)
  if (!node) return null
  if (node.type === 'bus') return nodeId
  if (node.type === 'breaker') {
    const eq = node.data.equipment as Breaker
    if (!eq.in_service || !eq.is_closed) return null
    for (const edge of edgesByNode.get(nodeId) ?? []) {
      const otherId = edge.source === nodeId ? edge.target : edge.source
      if (otherId === nodeId) continue
      const result = resolveTobus(otherId, nodeMap, edgesByNode, depth + 1)
      if (result) return result
    }
  }
  return null
}

// ── Main export ───────────────────────────────────────────────────────────────
export function computeCableSizing(
  nodes: Node<NodeData>[],
  edges: Edge<EdgeData>[],
  loadflow: LoadflowResults | null,
  shortcircuit: ShortCircuitResults | null,
): CableSizingResults {
  const nodeMap = new Map(nodes.map(n => [n.id, n]))
  const edgesByNode = new Map<string, Edge<EdgeData>[]>()
  for (const e of edges) {
    if (!edgesByNode.has(e.source)) edgesByNode.set(e.source, [])
    if (!edgesByNode.has(e.target)) edgesByNode.set(e.target, [])
    edgesByNode.get(e.source)!.push(e)
    edgesByNode.get(e.target)!.push(e)
  }

  const cables: Record<string, CableSizingResult> = {}

  for (const edge of edges) {
    if (!edge.data?.cable) continue
    const cable = edge.data.cable

    // ── Find connected buses ───────────────────────────────────────────────
    const srcBusId = resolveTobus(edge.source, nodeMap, edgesByNode)
    const tgtBusId = resolveTobus(edge.target, nodeMap, edgesByNode)

    // Use source bus voltage for sizing (prefer the higher-voltage side if different)
    const srcBus  = srcBusId ? (nodeMap.get(srcBusId)?.data.equipment as Bus) : null
    const tgtBus  = tgtBusId ? (nodeMap.get(tgtBusId)?.data.equipment as Bus) : null
    const vn_kv   = Math.max(srcBus?.vn_kv ?? 0, tgtBus?.vn_kv ?? 0) || 0.4
    const fromBus = srcBus?.name ?? '—'
    const toBus   = tgtBus?.name ?? '—'

    const lvl   = voltageLevel(vn_kv)
    const dvLim = vdropLimit(vn_kv)
    const L_km  = (cable.length_m ?? 100) / 1000
    const par   = Math.max(cable.parallel ?? 1, 1)   // P1-3 병렬 회선

    // ── Load current + 실제 역률 계산 (P1-4) ─────────────────────────────
    let i_load_a    = 0
    let pSum_kw     = 0   // 유효전력 합계
    let qSum_kvar   = 0   // 무효전력 합계
    const lfLine = loadflow?.lines[edge.id]
    if (lfLine && lfLine.i_ka > 0) {
      i_load_a = lfLine.i_ka * 1000
      // LF 결과에서 실제 PF 산출
      const p = Math.abs(lfLine.p_from_mw ?? 0)
      const q = Math.abs(lfLine.q_from_mvar ?? 0)
      pSum_kw   = p * 1000
      qSum_kvar = q * 1000
    } else {
      // 부하 추정 + 역률 수집
      for (const n of nodes) {
        const connectedBusId = resolveTobus(n.id, nodeMap, edgesByNode)
        if (connectedBusId !== tgtBusId) continue
        if (n.type === 'load') {
          const eq = n.data.equipment as Load
          if (!eq.in_service) continue
          const p = (eq.p_kw ?? 0) * (eq.scaling ?? 1)
          const q = eq.q_kvar !== 0
            ? eq.q_kvar * (eq.scaling ?? 1)
            : p * Math.tan(Math.acos(Math.max(eq.pf ?? DEFAULT_COS_PHI, 0.1)))
          pSum_kw   += p
          qSum_kvar += q
          const s_kva = Math.sqrt(p * p + q * q) / 1000
          i_load_a   += s_kva / (Math.sqrt(3) * vn_kv)
        } else if (n.type === 'motor') {
          const eq = n.data.equipment as Motor
          if (!eq.in_service) continue
          const pf  = Math.max(eq.power_factor ?? DEFAULT_COS_PHI, 0.1)
          const eta = Math.max((eq.efficiency ?? 95) / 100, 0.5)
          const p   = (eq.rated_kw ?? 0) / eta
          const q   = p * Math.tan(Math.acos(pf))
          pSum_kw   += p
          qSum_kvar += q
          i_load_a  += (p / 1000) / (Math.sqrt(3) * vn_kv * pf)
        }
      }
    }
    if (i_load_a < 1) i_load_a = (cable.max_i_ka ?? 0.1) * 1000 * par * 0.5

    // 실제 역률
    const s_total = Math.sqrt(pSum_kw * pSum_kw + qSum_kvar * qSum_kvar)
    const actual_cos_phi = s_total > 0 ? Math.min(pSum_kw / s_total, 1) : DEFAULT_COS_PHI

    // ── IEC 60287 Derating factor ──────────────────────────────────────────
    const derating = cableDeratingFactor(cable as CableType)

    // ── Existing cable checks (P1-3: 병렬 회선) ───────────────────────────
    const i_per_cable = i_load_a / par                                      // 회선당 전류
    const ampacity_a  = (cable.max_i_ka ?? 0.1) * 1000 * par * derating    // 보정 후 전체 허용전류
    const vdrop       = computeVdrop(
      i_per_cable, L_km,
      cable.r_ohm_per_km ?? 0.2, cable.x_ohm_per_km ?? 0.08,
      vn_kv, actual_cos_phi,
    )
    const existingMM2 = estimateMM2(cable.r_ohm_per_km ?? 0.2)

    // ── Short circuit ─────────────────────────────────────────────────────
    // Use lower-voltage bus fault level (more demanding side for the cable)
    const lowerBusId = (srcBus && tgtBus)
      ? (srcBus.vn_kv <= tgtBus.vn_kv ? srcBusId! : tgtBusId!)
      : (srcBusId ?? tgtBusId ?? '')
    const scBus       = shortcircuit?.buses[lowerBusId]
    const ik_ka       = scBus?.ikss_ka ?? 0

    // Clearing time: find any relay on connected breakers
    let t_clr = 0.5  // default 0.5 s (time-overcurrent)
    for (const n of nodes) {
      if (n.type !== 'breaker') continue
      const connBusId = resolveTobus(n.id, nodeMap, edgesByNode)
      if (connBusId !== lowerBusId) continue
      const br = n.data.equipment as Breaker
      if (br.relay?.inst_enabled && ik_ka * 1000 >= (br.relay.inst_pickup_a ?? Infinity)) {
        t_clr = 0.05   // instantaneous ≈ 50 ms
        break
      }
    }
    t_clr = Math.max(t_clr, 0.02)   // floor 20 ms

    const sc_withstand = scWithstand(existingMM2, 143, t_clr)

    // ── Pass/fail ─────────────────────────────────────────────────────────
    const passAmpacity     = i_load_a <= ampacity_a
    const passVoltageDrop  = vdrop     <= dvLim
    const passShortCircuit = ik_ka <= 0 || sc_withstand >= ik_ka

    // ── Library selection ─────────────────────────────────────────────────
    const libFiltered = CABLE_LIBRARY.filter(e => e.voltage_level === lvl)
    let recEntry: LibEntry | null = null

    for (const entry of libFiltered) {
      const dv_lib  = computeVdrop(i_per_cable, L_km, entry.r_ohm_per_km, entry.x_ohm_per_km, vn_kv, actual_cos_phi)
      const sc_lib  = scWithstand(entry.cross_section_mm2, entry.short_circuit_constant, t_clr)
      // Apply same derating to library cable ampacity
      const amp_ok  = entry.ampacity_a * derating >= i_load_a
      const dv_ok   = dv_lib <= dvLim
      const sc_ok   = ik_ka <= 0 || sc_lib >= ik_ka
      if (amp_ok && dv_ok && sc_ok) { recEntry = entry; break }
    }
    if (!recEntry && libFiltered.length > 0) {
      recEntry = libFiltered[libFiltered.length - 1]  // largest available
    }

    const pass     = passAmpacity && passVoltageDrop && passShortCircuit
    const severity = pass
      ? 'PASS'
      : (passAmpacity && passShortCircuit ? 'WARNING' : 'FAIL')

    cables[edge.id] = {
      cableId:   edge.id,
      cableName: cable.name,
      fromBus,
      toBus,
      vn_kv,
      loadCurrentA:        Math.round(i_load_a * 10) / 10,   // 전체 전류
      ampacityA:           ampacity_a,                        // 병렬 포함 허용전류
      voltageDropPercent:  Math.round(vdrop * 1000) / 1000,
      vdropLimit:          dvLim,
      shortCircuitKA:      ik_ka,
      scWithstandKA:       Math.round(sc_withstand * 1000) / 1000,
      clearingTimeS:       t_clr,
      existingMM2,
      recommendedModel:    recEntry?.model ?? '—',
      recommendedMM2:      recEntry?.cross_section_mm2 ?? 0,
      passAmpacity,
      passVoltageDrop,
      passShortCircuit,
      pass,
      severity,
    }
  }

  return { cables }
}
