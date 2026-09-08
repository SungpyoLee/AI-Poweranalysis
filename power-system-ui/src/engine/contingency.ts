/**
 * N-1 Contingency Analysis Engine
 * For each in-service transformer / cable / breaker / generator:
 *   clone network → remove equipment → run loadflow → collect violations
 */
import type { Node, Edge } from 'reactflow'
import type {
  NodeData, EdgeData, Bus, Breaker,
  ContingencyResult, ContingencyResults,
} from '../types'
import { getNeighborIds } from '../utils/graphTraversal'
import { runLocalLoadflow } from './loadflow'

// ── Island detection ──────────────────────────────────────────────────────────
// BFS from all Slack buses through in-service equipment + closed breakers.
// Returns IDs of buses NOT reachable from any source.
function detectIslands(nodes: Node<NodeData>[], edges: Edge<EdgeData>[]): string[] {
  const activeEdges = edges.filter(e => e.data?.cable?.in_service !== false)
  const nodeMap     = new Map(nodes.map(n => [n.id, n]))

  const slackIds = nodes
    .filter(n => n.type === 'bus' && n.data.equipment.in_service)
    .filter(n => (n.data.equipment as Bus).busType === 'Slack')
    .map(n => n.id)

  if (slackIds.length === 0) {
    return nodes
      .filter(n => n.type === 'bus' && n.data.equipment.in_service)
      .map(n => n.id)
  }

  const reachable = new Set<string>()
  const queue: string[] = []
  for (const id of slackIds) { reachable.add(id); queue.push(id) }

  while (queue.length > 0) {
    const curId = queue.shift()!
    for (const nbrId of getNeighborIds(curId, activeEdges)) {
      if (reachable.has(nbrId)) continue
      const nbr = nodeMap.get(nbrId)
      if (!nbr || !nbr.data.equipment.in_service) continue
      if (nbr.type === 'breaker') {
        if (!(nbr.data.equipment as Breaker).is_closed) continue
      }
      reachable.add(nbrId)
      queue.push(nbrId)
    }
  }

  return nodes
    .filter(n => n.type === 'bus' && n.data.equipment.in_service && !reachable.has(n.id))
    .map(n => n.id)
}

// ── Suppress console noise during repeated loadflow calls ─────────────────────
function runLoadflowSilent(nodes: Node<NodeData>[], edges: Edge<EdgeData>[]) {
  const saved = { group: console.group, groupEnd: console.groupEnd, log: console.log }
  const noop = (..._args: unknown[]) => {}
  console.group = noop as typeof console.group
  console.groupEnd = noop as typeof console.groupEnd
  console.log = noop as typeof console.log
  try {
    return runLocalLoadflow(nodes, edges)
  } finally {
    console.group    = saved.group
    console.groupEnd = saved.groupEnd
    console.log      = saved.log
  }
}

// ── Single contingency case ───────────────────────────────────────────────────
function analyzeOneContingency(
  equipmentId:   string,
  equipmentName: string,
  equipmentType: ContingencyResult['equipmentType'],
  nodes:         Node<NodeData>[],
  edges:         Edge<EdgeData>[],
): ContingencyResult {
  const islandedBuses = detectIslands(nodes, edges)

  let converged = false
  const undervoltageBuses:      string[] = []
  const overloadedTransformers: string[] = []
  const overloadedLines:        string[] = []
  let minVoltagePu      = NaN
  let maxLoadingPercent = NaN

  try {
    const lf = runLoadflowSilent(nodes, edges)
    converged = lf.converged

    if (converged) {
      minVoltagePu      = Infinity
      maxLoadingPercent = 0

      for (const b of Object.values(lf.buses)) {
        if (b.vm_pu < 0.95) undervoltageBuses.push(b.nodeId)
        if (b.vm_pu < minVoltagePu) minVoltagePu = b.vm_pu
      }
      if (!isFinite(minVoltagePu)) minVoltagePu = 1.0

      for (const t of Object.values(lf.transformers)) {
        if (t.loading_percent > 100) overloadedTransformers.push(t.nodeId)
        if (t.loading_percent > maxLoadingPercent) maxLoadingPercent = t.loading_percent
      }
      for (const l of Object.values(lf.lines)) {
        if (l.loading_percent > 100) overloadedLines.push(l.edgeId)
        if (l.loading_percent > maxLoadingPercent) maxLoadingPercent = l.loading_percent
      }
    }
  } catch {
    converged = false
  }

  const hasIslands    = islandedBuses.length > 0
  const hasViolations = undervoltageBuses.length > 0
    || overloadedTransformers.length > 0
    || overloadedLines.length > 0

  const severity: ContingencyResult['severity'] =
    !converged || hasIslands ? 'FAIL'
    : hasViolations          ? 'WARNING'
    :                          'PASS'

  return {
    equipmentId, equipmentName, equipmentType,
    converged, islandedBuses,
    overloadedTransformers, overloadedLines, undervoltageBuses,
    maxLoadingPercent, minVoltagePu, severity,
  }
}

// ── Main export ───────────────────────────────────────────────────────────────
export function runContingencyAnalysis(
  nodes: Node<NodeData>[],
  edges: Edge<EdgeData>[],
): ContingencyResults {
  const cases: ContingencyResult[] = []

  // Node contingencies: transformer, breaker, generator
  for (const node of nodes) {
    if (!node.data.equipment.in_service) continue
    if (node.type !== 'transformer' && node.type !== 'transformer3w' &&
        node.type !== 'breaker' && node.type !== 'generator') continue

    // 차단기는 in_service가 아니라 is_closed로 "개방"을 표현해야 한다 — 연결성 판정
    // 함수들(findConnectedBusId/findReachableNodes, utils/graphTraversal.ts)이
    // 차단기를 지나갈지 말지는 오직 is_closed만 보고, in_service는 전혀 보지 않는다.
    // in_service만 false로 두면 loadflow 쪽 연결성 판정에는 아무 영향이 없어서
    // (그 차단기가 물려 있는 부하/전동기가 여전히 정상 연결된 것처럼 계산됨),
    // "차단기" N-1 케이스가 사실상 기준 케이스와 동일하게 나오는 버그가 있었다.
    const eqPatch = node.type === 'breaker' ? { is_closed: false } : { in_service: false }
    const modNodes = nodes.map(n =>
      n.id === node.id
        ? { ...n, data: { ...n.data, equipment: { ...n.data.equipment, ...eqPatch } } }
        : n
    )

    // transformer3w is reported as 'transformer' in ContingencyResult (same category)
    const eqType: ContingencyResult['equipmentType'] =
      node.type === 'transformer3w' ? 'transformer' : node.type as ContingencyResult['equipmentType']

    cases.push(analyzeOneContingency(
      node.id,
      node.data.equipment.name,
      eqType,
      modNodes,
      edges,
    ))
  }

  // Edge contingencies: cable
  for (const edge of edges) {
    if (!edge.data?.cable) continue
    if (edge.data.cable.in_service === false) continue

    const modEdges = edges.map(e =>
      e.id === edge.id
        ? { ...e, data: { ...e.data!, cable: { ...e.data!.cable, in_service: false } } }
        : e
    )

    cases.push(analyzeOneContingency(
      edge.id,
      edge.data.cable.name,
      'cable',
      nodes,
      modEdges,
    ))
  }

  return { cases }
}
