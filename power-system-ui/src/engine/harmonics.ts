/**
 * IEEE 519 Harmonic Analysis Engine
 * Per-unit Ybus formulation, Sbase = 100 MVA
 * Harmonic orders: 5, 7, 11, 13, 17, 19
 */
import type { Node, Edge } from 'reactflow'
import type {
  NodeData, EdgeData, Bus, Transformer, Breaker, Motor, Load,
  LoadflowResults, HarmonicResults, HarmonicBusResult, HarmonicSourceResult,
  HarmonicSource, CapacitorBank, Reactor,
} from '../types'

// ── Constants ─────────────────────────────────────────────────────────────────
const SBASE = 100           // MVA
// 6-pulse: 5,7,11,13,17,19 / 12-pulse: additionally 23,25
const HARM_ORDERS = [5, 7, 11, 13, 17, 19, 23, 25]

// IEEE 519-2014 Table 1 THDv limits by bus voltage
function ieee519Limit(vn_kv: number): number {
  if (vn_kv <= 1.0)  return 8.0
  if (vn_kv <= 69)   return 5.0
  if (vn_kv <= 161)  return 2.5
  return 1.5
}

// ── Complex arithmetic ────────────────────────────────────────────────────────
type C = [number, number]

function cadd(a: C, b: C): C { return [a[0] + b[0], a[1] + b[1]] }
function csub(a: C, b: C): C { return [a[0] - b[0], a[1] - b[1]] }
function cmul(a: C, b: C): C {
  return [a[0] * b[0] - a[1] * b[1], a[0] * b[1] + a[1] * b[0]]
}
function cdiv(a: C, b: C): C {
  const d = b[0] * b[0] + b[1] * b[1]
  if (d < 1e-30) return [0, 0]
  return [(a[0] * b[0] + a[1] * b[1]) / d, (a[1] * b[0] - a[0] * b[1]) / d]
}
function cinv(a: C): C { return cdiv([1, 0], a) }
function cabs(a: C): number { return Math.sqrt(a[0] * a[0] + a[1] * a[1]) }

// ── Gaussian elimination with partial pivoting ────────────────────────────────
function gaussSolve(A: C[][], b: C[]): C[] | null {
  const n = b.length
  const M: C[][] = A.map((row, i) => [...row, b[i]])

  for (let col = 0; col < n; col++) {
    let maxVal = 0, pivot = col
    for (let row = col; row < n; row++) {
      const v = cabs(M[row][col])
      if (v > maxVal) { maxVal = v; pivot = row }
    }
    if (maxVal < 1e-14) return null
    ;[M[col], M[pivot]] = [M[pivot], M[col]]

    for (let row = col + 1; row < n; row++) {
      if (cabs(M[row][col]) < 1e-14) continue
      const f = cdiv(M[row][col], M[col][col])
      for (let k = col; k <= n; k++) M[row][k] = csub(M[row][k], cmul(f, M[col][k]))
    }
  }

  const x: C[] = Array.from({ length: n }, () => [0, 0] as C)
  for (let i = n - 1; i >= 0; i--) {
    let s: C = M[i][n]
    for (let j = i + 1; j < n; j++) s = csub(s, cmul(M[i][j], x[j]))
    x[i] = cdiv(s, M[i][i])
  }
  return x
}

// ── Topology helpers ──────────────────────────────────────────────────────────
interface Branch { bus1: string; bus2: string; R_pu: number; X_pu: number }

function buildEdgesByNode(edges: Edge<EdgeData>[]): Map<string, Edge<EdgeData>[]> {
  const map = new Map<string, Edge<EdgeData>[]>()
  for (const edge of edges) {
    if (!edge.data?.cable?.in_service) continue
    for (const id of [edge.source, edge.target]) {
      if (!map.has(id)) map.set(id, [])
      map.get(id)!.push(edge)
    }
  }
  return map
}

// Traverse closed breakers to find the nearest bus
function resolveTobus(
  nodeId: string,
  fromId: string,
  nodeMap: Map<string, Node<NodeData>>,
  edgesByNode: Map<string, Edge<EdgeData>[]>,
  depth = 0,
): string | null {
  if (depth > 6) return null
  const node = nodeMap.get(nodeId)
  if (!node) return null
  if (node.type === 'bus') return node.data.equipment.in_service ? nodeId : null
  if (node.type === 'breaker') {
    const b = node.data.equipment as Breaker
    if (!b.is_closed || !b.in_service) return null
    for (const edge of edgesByNode.get(nodeId) ?? []) {
      if (!edge.data?.cable?.in_service) continue
      const other = edge.source === nodeId ? edge.target : edge.source
      if (other === fromId) continue
      const result = resolveTobus(other, nodeId, nodeMap, edgesByNode, depth + 1)
      if (result) return result
    }
  }
  return null
}

function buildBranches(
  nodes: Node<NodeData>[],
  edges: Edge<EdgeData>[],
): Branch[] {
  const nodeMap = new Map(nodes.map(n => [n.id, n]))
  const edgesByNode = buildEdgesByNode(edges)
  const branches: Branch[] = []
  const seen = new Set<string>()

  const addBranch = (bus1: string, bus2: string, R: number, X: number) => {
    const key = bus1 < bus2 ? `${bus1}|${bus2}` : `${bus2}|${bus1}`
    if (seen.has(key)) return
    seen.add(key)
    branches.push({ bus1, bus2, R_pu: Math.max(R, 1e-7), X_pu: Math.max(X, 1e-6) })
  }

  // ① Cable edges that connect two buses (possibly via closed breakers)
  for (const edge of edges) {
    const cable = edge.data?.cable
    if (!cable?.in_service) continue
    const b1 = resolveTobus(edge.source, '', nodeMap, edgesByNode)
    const b2 = resolveTobus(edge.target, '', nodeMap, edgesByNode)
    if (!b1 || !b2 || b1 === b2) continue

    const bus = nodeMap.get(b1)?.data.equipment as Bus | undefined
    if (!bus) continue
    const Zbase = bus.vn_kv * bus.vn_kv / SBASE
    const lkm = cable.length_m / 1000 / Math.max(cable.parallel, 1)
    addBranch(b1, b2,
      cable.r_ohm_per_km * lkm / Zbase,
      cable.x_ohm_per_km * lkm / Zbase,
    )
  }

  // ② Transformer series impedances between two buses
  for (const node of nodes) {
    if (node.type !== 'transformer' || !node.data.equipment.in_service) continue
    const tr = node.data.equipment as Transformer
    const buses: string[] = []
    for (const edge of edgesByNode.get(node.id) ?? []) {
      if (!edge.data?.cable?.in_service) continue
      const other = edge.source === node.id ? edge.target : edge.source
      const busId = resolveTobus(other, node.id, nodeMap, edgesByNode)
      if (busId && !buses.includes(busId)) buses.push(busId)
    }
    if (buses.length >= 2) {
      const scale = SBASE / tr.sn_mva
      const R = tr.vkr_percent / 100 * scale
      const X = Math.sqrt(Math.max(0, tr.vk_percent ** 2 - tr.vkr_percent ** 2)) / 100 * scale
      addBranch(buses[0], buses[1], R, X)
    }
  }

  return branches
}

// ── Harmonic source helpers ───────────────────────────────────────────────────
// h23/h25: typical 12-pulse converter values (IEC 61000-2-4)
const PRESETS: Record<string, HarmonicSource> = {
  VFD:       { enabled: true, source_type: 'VFD',       h5_percent: 25, h7_percent: 14, h11_percent: 9, h13_percent: 7, h17_percent: 4, h19_percent: 3, h23_percent: 2, h25_percent: 1.5 },
  UPS:       { enabled: true, source_type: 'UPS',       h5_percent: 28, h7_percent: 15, h11_percent: 9, h13_percent: 7, h17_percent: 4, h19_percent: 3, h23_percent: 2, h25_percent: 1.5 },
  Rectifier: { enabled: true, source_type: 'Rectifier', h5_percent: 22, h7_percent: 13, h11_percent: 8, h13_percent: 6, h17_percent: 3, h19_percent: 2, h23_percent: 1.5, h25_percent: 1 },
  Inverter:  { enabled: true, source_type: 'Inverter',  h5_percent: 15, h7_percent: 10, h11_percent: 6, h13_percent: 4, h17_percent: 3, h19_percent: 2, h23_percent: 1, h25_percent: 0.8 },
}

function hPercent(src: HarmonicSource, order: number): number {
  switch (order) {
    case 5:  return src.h5_percent
    case 7:  return src.h7_percent
    case 11: return src.h11_percent
    case 13: return src.h13_percent
    case 17: return src.h17_percent
    case 19: return src.h19_percent
    case 23: return src.h23_percent ?? 0
    case 25: return src.h25_percent ?? 0
    default: return 0
  }
}

// ── Main export ───────────────────────────────────────────────────────────────
export function computeHarmonics(
  nodes:    Node<NodeData>[],
  edges:    Edge<EdgeData>[],
  loadflow: LoadflowResults | null,
): HarmonicResults {
  const empty: HarmonicResults = { buses: {}, sources: [] }

  const nodeMap    = new Map(nodes.map(n => [n.id, n]))
  const edgesByNode = buildEdgesByNode(edges)

  // Active bus nodes only
  const busNodes = nodes.filter(
    n => n.type === 'bus' && n.data.equipment.in_service,
  )
  if (busNodes.length === 0) return empty

  const busIndex = new Map<string, number>(busNodes.map((n, i) => [n.id, i]))
  const N = busNodes.length

  // Build network branches (fundamental-frequency, per-unit)
  const branches = buildBranches(nodes, edges)

  // ── Collect harmonic sources ─────────────────────────────────────────────
  interface SourceInfo {
    nodeId:    string
    name:      string
    sourceType: string
    busId:     string
    busName:   string
    i_fund_a:  number
    harmonic:  HarmonicSource
  }
  const sourceList: SourceInfo[] = []

  for (const node of nodes) {
    let harmonic: HarmonicSource | undefined
    let i_fund_a = 0
    let sourceType = ''

    if (node.type === 'motor') {
      const m = node.data.equipment as Motor
      if (!m.in_service || !m.harmonic?.enabled) continue
      harmonic    = m.harmonic
      sourceType  = m.harmonic.source_type
      i_fund_a    = m.rated_kw * 1000 / (Math.sqrt(3) * m.vn_kv * 1000 * (m.efficiency / 100) * m.power_factor)
    } else if (node.type === 'load') {
      const l = node.data.equipment as Load
      if (!l.in_service || !l.harmonic?.enabled) continue
      harmonic    = l.harmonic
      sourceType  = l.harmonic.source_type
      i_fund_a    = l.p_kw * 1000 / (Math.sqrt(3) * l.vn_kv * 1000 * l.pf)
    } else {
      continue
    }

    const busId = resolveTobus(node.id, '', nodeMap, edgesByNode)
    if (!busId) continue
    const busName = (nodeMap.get(busId)?.data.equipment as Bus | undefined)?.name ?? busId

    sourceList.push({
      nodeId: node.id,
      name: node.data.equipment.name,
      sourceType,
      busId,
      busName,
      i_fund_a: isFinite(i_fund_a) ? i_fund_a : 0,
      harmonic,
    })
  }

  // ── Build per-harmonic distortion ────────────────────────────────────────
  // distortion[busId][h] = Dh%
  const distMap: Record<string, Record<number, number>> = {}
  for (const bn of busNodes) distMap[bn.id] = {}

  for (const h of HARM_ORDERS) {
    // Build Y(h)
    const Y: C[][] = Array.from({ length: N }, () =>
      Array.from({ length: N }, () => [0, 0] as C),
    )

    // Small leakage shunt on all buses (prevents singularity for isolated buses)
    for (let i = 0; i < N; i++) Y[i][i] = cadd(Y[i][i], [1e-4, 0])

    // Branch admittances at harmonic h
    for (const br of branches) {
      const i = busIndex.get(br.bus1)
      const j = busIndex.get(br.bus2)
      if (i === undefined || j === undefined) continue
      const yij = cinv([br.R_pu, h * br.X_pu])
      Y[i][i] = cadd(Y[i][i], yij)
      Y[j][j] = cadd(Y[j][j], yij)
      Y[i][j] = csub(Y[i][j], yij)
      Y[j][i] = csub(Y[j][i], yij)
    }

    // Source Thevenin shunts (slack bus = harmonic sink)
    for (let i = 0; i < N; i++) {
      const bus = busNodes[i].data.equipment as Bus
      if (bus.busType === 'Slack') {
        const Ssc_pu = (bus.sc_mva ?? 5000) / SBASE
        const xr     = bus.xr_ratio ?? 10
        const Zmag   = 1 / Ssc_pu
        const Xth    = Zmag * xr / Math.sqrt(1 + xr * xr)
        const Rth    = Zmag      / Math.sqrt(1 + xr * xr)
        Y[i][i] = cadd(Y[i][i], cinv([Rth, h * Xth]))
      } else if (bus.busType === 'PV') {
        // Generator bus: stiff voltage source → large shunt admittance
        Y[i][i] = cadd(Y[i][i], [50, 0])
      }
    }

    // Shunt capacitor banks: Y_cap(h) = +j·h·B_cap  (B_cap = Q/S_BASE at V=1 pu)
    // Capacitive shunts cause parallel resonance with system inductance — critical for THD.
    for (const node of nodes) {
      if (node.type !== 'capacitor' || !node.data.equipment.in_service) continue
      const cap   = node.data.equipment as CapacitorBank
      const busId = resolveTobus(node.id, '', nodeMap, edgesByNode)
      if (!busId) continue
      const i = busIndex.get(busId)
      if (i === undefined) continue
      const Qeff = cap.qn_mvar * (cap.step_enabled / Math.max(cap.steps, 1))
      if (Qeff <= 0) continue
      Y[i][i] = cadd(Y[i][i], [0, h * Qeff / SBASE])
    }

    // Shunt reactors: Y_reactor(h) = −j / (h·X_L)  (X_L = Q/S_BASE at V=1 pu)
    for (const node of nodes) {
      if (node.type !== 'reactor' || !node.data.equipment.in_service) continue
      const react = node.data.equipment as Reactor
      if (!react.is_shunt || react.qn_mvar <= 0) continue
      const busId = resolveTobus(node.id, '', nodeMap, edgesByNode)
      if (!busId) continue
      const i = busIndex.get(busId)
      if (i === undefined) continue
      const X_L_pu = react.qn_mvar / SBASE   // fundamental reactance in pu
      Y[i][i] = cadd(Y[i][i], [0, -1 / (h * X_L_pu)])
    }

    // Build injection vector I(h)
    const Ivec: C[] = Array.from({ length: N }, () => [0, 0] as C)
    for (const src of sourceList) {
      const i = busIndex.get(src.busId)
      if (i === undefined) continue
      const bus   = busNodes[i].data.equipment as Bus
      const Ibase = SBASE * 1000 / (Math.sqrt(3) * bus.vn_kv)  // A
      const Ih_a  = src.i_fund_a * hPercent(src.harmonic, h) / 100
      const Ih_pu = Ih_a / Ibase
      Ivec[i] = cadd(Ivec[i], [Ih_pu, 0])
    }

    const Vh = gaussSolve(Y, Ivec)
    if (!Vh) continue

    for (let i = 0; i < N; i++) {
      const busId = busNodes[i].id
      const V1_pu = loadflow?.buses[busId]?.vm_pu ?? 1.0
      const Vh_pu = cabs(Vh[i])
      distMap[busId][h] = Vh_pu / V1_pu * 100
    }
  }

  // ── Assemble bus results ─────────────────────────────────────────────────
  const buses: Record<string, HarmonicBusResult> = {}
  for (const bn of busNodes) {
    const bus  = bn.data.equipment as Bus
    const dist = distMap[bn.id]
    const orders = HARM_ORDERS.filter(h => dist[h] !== undefined)

    const thdv_percent = Math.sqrt(orders.reduce((s, h) => s + dist[h] ** 2, 0))
    const maxEntry     = orders.reduce(
      (best, h) => dist[h] > best.val ? { h, val: dist[h] } : best,
      { h: 0, val: 0 },
    )
    const limit = ieee519Limit(bus.vn_kv)

    buses[bn.id] = {
      busId:                 bn.id,
      busName:               bus.name,
      vn_kv:                 bus.vn_kv,
      thdv_percent:          parseFloat(thdv_percent.toFixed(4)),
      distortion:            dist,
      max_order:             maxEntry.h,
      max_distortion_percent: parseFloat(maxEntry.val.toFixed(4)),
      ieee519_limit:         limit,
      ieee519_pass:          thdv_percent <= limit,
    }
  }

  // ── Assemble source results ──────────────────────────────────────────────
  const sources: HarmonicSourceResult[] = sourceList.map(src => {
    const harmonic_currents: Record<number, number> = {}
    for (const h of HARM_ORDERS) {
      harmonic_currents[h] = src.i_fund_a * hPercent(src.harmonic, h) / 100
    }
    const thdi_percent = Math.sqrt(
      HARM_ORDERS.reduce((s, h) => s + hPercent(src.harmonic, h) ** 2, 0),
    )
    return {
      sourceId:          src.nodeId,
      sourceName:        src.name,
      sourceType:        src.sourceType,
      busId:             src.busId,
      busName:           src.busName,
      i_fund_a:          src.i_fund_a,
      thdi_percent:      parseFloat(thdi_percent.toFixed(2)),
      harmonic_currents,
    }
  })

  return { buses, sources }
}

export { PRESETS as HARMONIC_PRESETS, HARM_ORDERS }
