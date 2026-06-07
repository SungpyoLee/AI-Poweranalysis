import type { Node, Edge } from 'reactflow'
import type {
  NodeData, EdgeData,
  Bus, Transformer, Motor, Generator, Load, Cable,
} from '../types'
import { validateNetwork, type ValidationIssue } from './networkValidation'
import { findConnectedBusId, findTransformerBuses } from './graphTraversal'

// ── ID 매핑 (ReactFlow nodeId ↔ pandapower 정수 인덱스) ─────────────────────
export interface IdMaps {
  nodeToIndex: Map<string, number>   // ReactFlow nodeId → pandapower bus index
  indexToNode: Map<number, string>   // pandapower bus index → ReactFlow nodeId
  trToIndex:   Map<string, number>   // transformer nodeId → pandapower tr index
  indexToTr:   Map<number, string>   // pandapower tr index → transformer nodeId
  edgeToIndex: Map<string, number>   // edgeId → pandapower line index
  indexToEdge: Map<number, string>   // pandapower line index → edgeId
}

export interface PayloadResult {
  payload: Record<string, unknown>
  idMaps:  IdMaps
}

// ── 검증 실패 시 던지는 에러 ──────────────────────────────────────────────────
export class ValidationError extends Error {
  constructor(public issues: ValidationIssue[]) {
    super('Network validation failed: ' + issues.map(i => i.message).join('; '))
    this.name = 'ValidationError'
  }
}

// ── 메인 함수 ─────────────────────────────────────────────────────────────────
export function buildNetworkPayload(
  nodes: Node<NodeData>[],
  edges: Edge<EdgeData>[]
): PayloadResult {
  // ① 검증 — error가 하나라도 있으면 중단
  const validation = validateNetwork(nodes, edges)
  if (!validation.valid) {
    throw new ValidationError(validation.issues.filter(i => i.severity === 'error'))
  }

  const nodeMap = new Map(nodes.map(n => [n.id, n]))

  // ── Bus 인덱스 매핑 ──────────────────────────────────────────────────────────
  const busNodes  = nodes.filter(n => n.type === 'bus' && n.data.equipment.in_service)
  const nodeToIndex = new Map<string, number>()
  const indexToNode = new Map<number, string>()

  busNodes.forEach((n, i) => {
    nodeToIndex.set(n.id, i)
    indexToNode.set(i, n.id)
  })

  // ── Transformer 인덱스 매핑 ───────────────────────────────────────────────────
  const trNodes  = nodes.filter(n => n.type === 'transformer' && n.data.equipment.in_service)
  const trToIndex   = new Map<string, number>()
  const indexToTr   = new Map<number, string>()

  trNodes.forEach((n, i) => {
    trToIndex.set(n.id, i)
    indexToTr.set(i, n.id)
  })

  // ── Line(Cable edge) 인덱스 매핑 ────────────────────────────────────────────
  // Bus-to-Bus 직결 edge만 line으로 처리 (Breaker를 통하는 경우는 switch로 처리됨)
  const lineEdges: Edge<EdgeData>[] = []
  for (const e of edges) {
    const src = nodeMap.get(e.source)
    const tgt = nodeMap.get(e.target)
    if (src?.type === 'bus' && tgt?.type === 'bus') {
      lineEdges.push(e)
    }
  }

  const edgeToIndex = new Map<string, number>()
  const indexToEdge = new Map<number, string>()
  lineEdges.forEach((e, i) => {
    edgeToIndex.set(e.id, i)
    indexToEdge.set(i, e.id)
  })

  // ── buses 배열 ───────────────────────────────────────────────────────────────
  const buses = busNodes.map(n => {
    const eq = n.data.equipment as Bus
    return {
      name:    eq.name,
      vn_kv:   eq.vn_kv,
      type:    eq.busType === 'Slack' ? 'b' : eq.busType === 'PV' ? 'b' : 'b',
      in_service: eq.in_service,
    }
  })

  // ── external_grids (Slack Bus) ────────────────────────────────────────────────
  const external_grids = busNodes
    .filter(n => (n.data.equipment as Bus).busType === 'Slack')
    .map(n => {
      const busIdx = nodeToIndex.get(n.id)!
      return { bus: busIdx, name: `Grid@${(n.data.equipment as Bus).name}`, vm_pu: 1.0, va_degree: 0 }
    })

  // ── generators ───────────────────────────────────────────────────────────────
  const generators = nodes
    .filter(n => n.type === 'generator' && n.data.equipment.in_service)
    .flatMap(n => {
      const eq = n.data.equipment as Generator
      const busId = findConnectedBusId(n.id, nodes, edges)
      if (!busId) return []
      const busIdx = nodeToIndex.get(busId)
      if (busIdx === undefined) return []
      return [{
        name:        eq.name,
        bus:         busIdx,
        p_mw:        eq.p_mw,
        vm_pu:       eq.vm_pu,
        sn_mva:      eq.sn_mva,
        max_q_mvar:  eq.max_q_mvar,
        min_q_mvar:  eq.min_q_mvar,
        vn_kv:       eq.vn_kv,
        xd_pu:       eq.xd_pu,
        xd_prime_pu: eq.xd_prime_pu,
        xdpp_pu:     eq.xdpp_pu,
        x2_pu:       eq.x2_pu,
        x0_pu:       eq.x0_pu,
        cos_phi_rated: eq.cos_phi_rated,
        in_service:  eq.in_service,
      }]
    })

  // ── motors ───────────────────────────────────────────────────────────────────
  const motors = nodes
    .filter(n => n.type === 'motor' && n.data.equipment.in_service)
    .flatMap(n => {
      const eq = n.data.equipment as Motor
      const busId = findConnectedBusId(n.id, nodes, edges)
      if (!busId) return []
      const busIdx = nodeToIndex.get(busId)
      if (busIdx === undefined) return []
      return [{
        name:          eq.name,
        bus:           busIdx,
        sn_kva:        eq.rated_kw / eq.power_factor,
        p_kw:          eq.rated_kw,
        vn_kv:         eq.vn_kv,
        pf:            eq.power_factor,
        efficiency:    eq.efficiency,
        i_start_ratio: eq.starting_current_multiple,
        cos_phi_start: eq.power_factor,
        in_service:    eq.in_service,
      }]
    })

  // ── loads ─────────────────────────────────────────────────────────────────────
  const loads = nodes
    .filter(n => n.type === 'load' && n.data.equipment.in_service)
    .flatMap(n => {
      const eq = n.data.equipment as Load
      const busId = findConnectedBusId(n.id, nodes, edges)
      if (!busId) return []
      const busIdx = nodeToIndex.get(busId)
      if (busIdx === undefined) return []
      return [{
        name:             eq.name,
        bus:              busIdx,
        p_kw:             eq.p_kw,
        q_kvar:           eq.q_kvar,
        vn_kv:            eq.vn_kv,
        const_z_percent:  eq.const_z_percent,
        const_i_percent:  eq.const_i_percent,
        const_p_percent:  eq.const_p_percent,
        scaling:          eq.scaling,
        in_service:       eq.in_service,
      }]
    })

  // ── transformers ──────────────────────────────────────────────────────────────
  const transformers = trNodes.flatMap(n => {
    const eq = n.data.equipment as Transformer
    const { hvBusId, lvBusId } = findTransformerBuses(n.id, nodes, edges)
    if (!hvBusId || !lvBusId) return []
    const hvIdx = nodeToIndex.get(hvBusId)
    const lvIdx = nodeToIndex.get(lvBusId)
    if (hvIdx === undefined || lvIdx === undefined) return []
    return [{
      name:             eq.name,
      hv_bus:           hvIdx,
      lv_bus:           lvIdx,
      sn_mva:           eq.sn_mva,
      vn_hv_kv:         eq.vn_hv_kv,
      vn_lv_kv:         eq.vn_lv_kv,
      vk_percent:       eq.vk_percent,
      vkr_percent:      eq.vkr_percent,
      pfe_kw:           eq.pfe_kw,
      i0_percent:       eq.i0_percent,
      tap_pos:          eq.tap_pos,
      tap_neutral:      eq.tap_neutral,
      tap_min:          eq.tap_min,
      tap_max:          eq.tap_max,
      tap_step_percent: eq.tap_step_percent,
      in_service:       eq.in_service,
    }]
  })

  // ── lines (Bus-Bus cable edges) ───────────────────────────────────────────────
  const lines = lineEdges.flatMap(e => {
    const cable = e.data?.cable as Cable | undefined
    if (!cable?.in_service) return []
    const fromIdx = nodeToIndex.get(e.source)
    const toIdx   = nodeToIndex.get(e.target)
    if (fromIdx === undefined || toIdx === undefined) return []
    return [{
      name:            cable.name,
      from_bus:        fromIdx,
      to_bus:          toIdx,
      std_type:        cable.std_type || null,
      length_km:       cable.length_m / 1000,
      r_ohm_per_km:    cable.r_ohm_per_km,
      x_ohm_per_km:    cable.x_ohm_per_km,
      c_nf_per_km:     cable.c_nf_per_km,
      r0_ohm_per_km:   cable.r0_ohm_per_km,
      x0_ohm_per_km:   cable.x0_ohm_per_km,
      c0_nf_per_km:    cable.c0_nf_per_km,
      max_i_ka:        cable.max_i_ka,
      parallel:        cable.parallel,
      in_service:      cable.in_service,
    }]
  })

  const payload: Record<string, unknown> = {
    name:           'PowerFlow Network',
    f_hz:           60,
    buses,
    external_grids,
    generators,
    motors,
    loads,
    transformers,
    lines,
  }

  return {
    payload,
    idMaps: { nodeToIndex, indexToNode, trToIndex, indexToTr, edgeToIndex, indexToEdge },
  }
}
