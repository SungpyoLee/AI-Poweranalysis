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
import { getNeighborIds, computeDistFromSource } from '../utils/graphTraversal'
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
// "Downstream" = away from the source (Slack bus), determined structurally via
// distFromSource (see computeDistFromSource) rather than by only looking at
// directly-connected bus-type neighbors. This matters because most real
// breakers gate a single piece of equipment (motor/generator) or a transformer
// directly — not another bus — so the old "min Ik" among direct bus neighbors"
// heuristic degenerated to picking the breaker's OWN upstream bus whenever no
// bus sat immediately on its downstream side, which then fed wrong values into
// findUpstreamBreaker's search (see below).
//
// The downstream search stops at a transformer boundary rather than crossing
// into the other voltage level: this engine has no fault-current referral
// through the transformer's turns ratio, so a bus beyond a transformer is in a
// different current domain and cannot be compared against this breaker's own
// (same-voltage-side) pickup setting. Respects explicit protectedBusId when set.
function getDownstreamBus(
  breakerNode:    Node<NodeData>,
  nodes:          Node<NodeData>[],
  edges:          Edge<EdgeData>[],
  sc:             ShortCircuitResults,
  distFromSource: Map<string, number>,
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

  // Priority 2: nearest same-voltage bus strictly downstream (away from source)
  const myDist = distFromSource.get(breakerNode.id)
  if (myDist !== undefined) {
    const visited = new Set<string>([breakerNode.id])
    const queue: string[] = []
    for (const nbrId of getNeighborIds(breakerNode.id, edges)) {
      const nbrDist = distFromSource.get(nbrId)
      if (nbrDist === undefined || nbrDist <= myDist) continue   // 상류/자기자신 방향 제외
      visited.add(nbrId); queue.push(nbrId)
    }

    while (queue.length > 0) {
      const curId = queue.shift()!
      const cur   = nodeMap.get(curId)
      if (!cur || !cur.data.equipment.in_service) continue

      if (cur.type === 'bus') {
        const r = sc.buses[curId]
        if (r && r.ikss_ka > 0) {
          const busEq = cur.data.equipment as Bus
          return { busId: curId, busName: busEq.name, ikss_ka: r.ikss_ka }
        }
      }
      if (cur.type === 'transformer' || cur.type === 'transformer3w') continue  // 전압 경계 — 건너가지 않음

      const curDist = distFromSource.get(curId)
      for (const nbrId of getNeighborIds(curId, edges)) {
        if (visited.has(nbrId)) continue
        const nbrDist = distFromSource.get(nbrId)
        if (nbrDist === undefined || curDist === undefined || nbrDist <= curDist) continue
        visited.add(nbrId)
        const nbr = nodeMap.get(nbrId)
        if (!nbr || !nbr.data.equipment.in_service) continue
        if (nbr.type === 'breaker' && !(nbr.data.equipment as Breaker).is_closed) continue
        queue.push(nbrId)
      }
    }
  }

  // Priority 3: no same-voltage downstream bus exists (dead-ends at a motor/
  // generator/load, or immediately behind a transformer) — fall back to this
  // breaker's own local (upstream) bus as the best available proxy for the
  // fault current its relay must clear. This mirrors the original heuristic
  // and is the same approximation as before for this specific case; the fix
  // above only changes breakers that DO have a genuine downstream bus.
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
// BFS strictly toward the source (via distFromSource), so it can never wander
// into a downstream branch — the old version excluded only "the (possibly
// wrong) protected bus" from the search and treated transformers as plain
// pass-through nodes, which let it cross a transformer FORWARD into its own
// downstream LV network and mistake a downstream feeder breaker for an
// upstream one (confirmed against the bundled example: CB-103's "upstream"
// resolved to CB-201, a breaker strictly downstream of CB-103 on the far side
// of the same transformer). Distance-from-source makes "toward the source"
// well-defined regardless of what kind of equipment sits on either side.
//
// Like getDownstreamBus, this stops at a transformer boundary rather than
// crossing it — an upstream relay on the other side of a transformer can't be
// evaluated against this breaker's own fault current without referring it
// through the turns ratio, which this engine doesn't do.
function findUpstreamBreaker(
  currentBreakerId: string,
  nodes:            Node<NodeData>[],
  edges:            Edge<EdgeData>[],
  distFromSource:   Map<string, number>,
): string | null {
  const nodeMap = new Map(nodes.map(n => [n.id, n]))
  const myDist  = distFromSource.get(currentBreakerId)
  if (myDist === undefined) return null

  const visited = new Set<string>([currentBreakerId])
  const queue: string[] = []
  for (const nbrId of getNeighborIds(currentBreakerId, edges)) {
    const nbrDist = distFromSource.get(nbrId)
    if (nbrDist === undefined || nbrDist >= myDist) continue   // 소스 쪽(더 가까운 쪽)으로만 이동
    visited.add(nbrId); queue.push(nbrId)
  }

  while (queue.length > 0) {
    const curId = queue.shift()!
    const cur   = nodeMap.get(curId)
    if (!cur || !cur.data.equipment.in_service) continue
    if (cur.type === 'transformer' || cur.type === 'transformer3w') continue  // 전압 경계 — 건너가지 않음

    const curDist = distFromSource.get(curId)
    for (const nbrId of getNeighborIds(curId, edges)) {
      if (visited.has(nbrId)) continue
      const nbrDist = distFromSource.get(nbrId)
      if (nbrDist === undefined || curDist === undefined || nbrDist >= curDist) continue
      visited.add(nbrId)

      const nbr = nodeMap.get(nbrId)
      if (!nbr || !nbr.data.equipment.in_service) continue

      if (nbr.type === 'breaker') {
        const eq = nbr.data.equipment as Breaker
        if (!eq.is_closed) continue          // open breaker isolates the circuit
        if (eq.relay) return nbrId            // found upstream relay breaker
        queue.push(nbrId)                     // closed non-relay breaker: traverse through
      } else if (nbr.type === 'bus') {
        queue.push(nbrId)
      }
      // transformer boundary handled above; motors/generators/loads are never
      // strictly closer to source than curId, so they're excluded by the
      // nbrDist < curDist check and never reached here anyway.
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
  // 주의: 예전엔 여기서 상간(50/51) 계전기가 하나도 없으면 바로 return []
  // 했는데, 이 함수는 뒤에서 51N(지락) 계전기도 같은 results 배열에 처리한다.
  // 그래서 "51N 지락 계전기만 있고 50/51은 하나도 없는" 흔한 구성(저압
  // 계통 등)에서는 51N 결과까지 통째로 사라지는 버그가 있었다.
  const nodeMap = new Map(nodes.map(n => [n.id, n]))
  const distFromSource = computeDistFromSource(nodes, edges)
  const results: RelayResult[] = []

  for (const breakerNode of breakersWithRelay) {
    const br    = breakerNode.data.equipment as Breaker
    const relay = br.relay!

    // 1. Get downstream protected bus + fault current
    const downstream = getDownstreamBus(breakerNode, nodes, edges, sc, distFromSource)
    if (!downstream) continue

    const fault_a = downstream.ikss_ka * 1000
    const self    = tripCalc(relay, fault_a)
    if (!self.trips) continue   // relay won't operate — skip

    // 2. Find upstream relay breaker
    const upstreamId = findUpstreamBreaker(breakerNode.id, nodes, edges, distFromSource)

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

    const downstream = getDownstreamBus(breakerNode, nodes, edges, sc, distFromSource)
    if (!downstream) continue

    const gFactor = ground === 'SOLID' ? 0.87 : 0.50
    const if_ka   = downstream.ikss_ka * gFactor     // estimated ground fault current
    const fault_a = if_ka * 1000

    const self = tripCalc(relay, fault_a)
    if (!self.trips) continue

    const upstreamId = findUpstreamBreaker(breakerNode.id, nodes, edges, distFromSource)
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
// Restraint and differential currents are both derived from each side's
// ACTUAL loadflow current (apparent power ÷ rated voltage), normalized to
// that side's own rated current — as a real relay's CT ratio selection
// would. Restraint therefore rises with real loading, same as a physical
// percentage-differential relay; it is NOT a fixed value from nameplate
// rating alone.
// Full accuracy still requires real CT ratios and true differential CT
// measurements (this uses steady-state load flow as an approximation, so
// it cannot see actual internal-fault waveforms or CT saturation).
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

    // Rated currents (from transformer MVA rating) — used only to normalize
    // each side's ACTUAL current into per-unit (as CT ratio selection does
    // for a real relay), not as the restraint quantity itself.
    const I_rated_hv = (trEq.sn_mva * 1000) / (Math.sqrt(3) * trEq.vn_hv_kv)  // A
    const I_rated_lv = (trEq.sn_mva * 1000) / (Math.sqrt(3) * trEq.vn_lv_kv)   // A

    // Actual through-current on each side from the load flow (apparent power,
    // not just real power, so a reactive-only imbalance is also seen).
    const lfTr = loadflow.transformers[trNode.id]
    const S_hv_mva = lfTr ? Math.hypot(lfTr.p_hv_mw, lfTr.q_hv_mvar) : 0
    const S_lv_mva = lfTr ? Math.hypot(lfTr.p_lv_mw, lfTr.q_lv_mvar) : 0
    const I_hv_actual = (S_hv_mva * 1000) / (Math.sqrt(3) * trEq.vn_hv_kv)  // A
    const I_lv_actual = (S_lv_mva * 1000) / (Math.sqrt(3) * trEq.vn_lv_kv)  // A
    const I_hv_pu = I_rated_hv > 0 ? I_hv_actual / I_rated_hv : 0
    const I_lv_pu = I_rated_lv > 0 ? I_lv_actual / I_rated_lv : 0

    // Restraint = average of both sides' ACTUAL through-current (pu), not the
    // transformer's fixed nameplate rating. A real 87T relay restrains on the
    // secondary CT currents it is actually seeing right now — restraint must
    // rise with real loading so the relay tolerates more CT mismatch error at
    // heavy load without misoperating, and stays sensitive at light load.
    const I_restrain_pu = (I_hv_pu + I_lv_pu) / 2
    const restrain = (I_hv_actual + I_lv_actual) / 2  // A, for display only

    // Differential current = actual through-current mismatch between sides (pu)
    const diff_pct = Math.abs(I_hv_pu - I_lv_pu) * 100

    // Dual-slope biased differential characteristic:
    // Slope 1 applies for I_restrain < breakpoint (typically 1 pu)
    // Slope 2 applies above breakpoint
    const breakpoint_pu = 1.0
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
