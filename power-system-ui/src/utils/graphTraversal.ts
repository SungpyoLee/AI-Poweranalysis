import type { Node, Edge } from 'reactflow'
import type { NodeData, EdgeData, Breaker, Bus } from '../types'

// ── 인접 노드 ID 목록 조회 ─────────────────────────────────────────────────
export function getNeighborIds(nodeId: string, edges: Edge<EdgeData>[]): string[] {
  return edges
    .filter(e => e.source === nodeId || e.target === nodeId)
    .map(e => e.source === nodeId ? e.target : e.source)
}

// ── 특정 노드에서 연결된 Bus 탐색 (BFS) ──────────────────────────────────────
// 규칙:
//   Bus 발견 → 즉시 반환
//   Breaker(is_closed=false) → 이 경로 차단
//   Transformer(stopAtTransformer=true) → 반대편으로 건너가지 않음
export function findConnectedBusId(
  startId: string,
  nodes:   Node<NodeData>[],
  edges:   Edge<EdgeData>[],
  opts:    { stopAtTransformer?: boolean } = {}
): string | null {
  const nodeMap = new Map(nodes.map(n => [n.id, n]))
  const visited = new Set<string>([startId])
  const queue   = [startId]

  while (queue.length > 0) {
    const cur = queue.shift()!

    for (const nbrId of getNeighborIds(cur, edges)) {
      if (visited.has(nbrId)) continue
      visited.add(nbrId)

      const nbr = nodeMap.get(nbrId)
      if (!nbr) continue

      // ① Bus 발견 → 즉시 반환
      if (nbr.type === 'bus') return nbrId

      // ② 개방 차단기 → 경로 차단
      if (nbr.type === 'breaker') {
        const eq = nbr.data.equipment as Breaker
        if (!eq.is_closed) continue
      }

      // ③ Transformer 경계 → 반대편 Bus로 건너가지 않음
      if (opts.stopAtTransformer && nbr.type === 'transformer') continue

      queue.push(nbrId)
    }
  }

  return null
}

// ── Transformer 양단 Bus 탐색 ─────────────────────────────────────────────────
// HV Bus(높은 vn_kv)와 LV Bus(낮은 vn_kv)를 분리 반환
export function findTransformerBuses(
  trId:  string,
  nodes: Node<NodeData>[],
  edges: Edge<EdgeData>[]
): { hvBusId: string | null; lvBusId: string | null } {
  const nodeMap = new Map(nodes.map(n => [n.id, n]))
  const busIds  = new Set<string>()

  for (const nbrId of getNeighborIds(trId, edges)) {
    const nbr = nodeMap.get(nbrId)
    if (!nbr) continue

    if (nbr.type === 'bus') {
      busIds.add(nbrId)
    } else {
      // CB 등을 통해 간접 연결된 Bus 탐색 (Transformer 경계 내에서만)
      const found = findConnectedBusId(nbrId, nodes, edges, { stopAtTransformer: true })
      if (found) busIds.add(found)
    }
  }

  const getVoltage = (id: string): number =>
    ((nodeMap.get(id)?.data.equipment as Bus)?.vn_kv) ?? 0

  const sorted = [...busIds].sort((a, b) => getVoltage(b) - getVoltage(a))

  return {
    hvBusId: sorted[0] ?? null,
    lvBusId: sorted[1] ?? null,
  }
}

// ── 모든 Bus에서 연결 가능한 노드 집합 탐색 (DFS, 개방 CB 통과 불가) ─────────
// 격리 버스 / 고립 장비 감지에 사용
export function findReachableNodes(
  startId: string,
  nodes:   Node<NodeData>[],
  edges:   Edge<EdgeData>[]
): Set<string> {
  const nodeMap = new Map(nodes.map(n => [n.id, n]))
  const visited = new Set<string>()
  const stack   = [startId]

  while (stack.length > 0) {
    const cur = stack.pop()!
    if (visited.has(cur)) continue
    visited.add(cur)

    for (const nbrId of getNeighborIds(cur, edges)) {
      if (visited.has(nbrId)) continue

      // 개방 차단기 경로 차단
      const nbr = nodeMap.get(nbrId)
      if (nbr?.type === 'breaker') {
        const eq = nbr.data.equipment as Breaker
        if (!eq.is_closed) continue
      }

      stack.push(nbrId)
    }
  }

  return visited
}

// ── 3권선 변압기 연결 버스 탐색 (HV/MV/LV 분류) ──────────────────────────────
// in-service 엣지를 통해 직접·간접 연결된 버스를 탐색하고 전압 내림차순으로 정렬.
// ybus.ts / shortcircuit.ts / asymmetricFault.ts 에서 동일하게 사용.
export function find3WTransformerBuses(
  tr3wId: string,
  nodes:  Node<NodeData>[],
  edges:  Edge<EdgeData>[],
): { hvId: string | null; mvId: string | null; lvId: string | null } {
  const nodeMap    = new Map(nodes.map(n => [n.id, n]))
  const connBusIds: string[] = []

  for (const edge of edges) {
    if (!edge.data?.cable?.in_service) continue
    if (edge.source !== tr3wId && edge.target !== tr3wId) continue
    const otherId = edge.source === tr3wId ? edge.target : edge.source
    const busId   = nodeMap.get(otherId)?.type === 'bus'
      ? otherId
      : findConnectedBusId(otherId, nodes, edges)
    if (busId && !connBusIds.includes(busId)) connBusIds.push(busId)
  }

  const sorted = connBusIds
    .map(id => ({ id, vn: ((nodeMap.get(id)?.data.equipment as Bus | undefined)?.vn_kv) ?? 0 }))
    .sort((a, b) => b.vn - a.vn)

  return {
    hvId: sorted[0]?.id ?? null,
    mvId: sorted[1]?.id ?? null,
    lvId: sorted[2]?.id ?? null,
  }
}

// ── 무향 그래프에서 연결 컴포넌트 전체 탐색 (CB 상태 무시) ──────────────────
// Loop Detection에 사용
export function findAllComponents(
  nodes: Node<NodeData>[],
  edges: Edge<EdgeData>[]
): string[][] {
  const visited   = new Set<string>()
  const components: string[][] = []

  for (const node of nodes) {
    if (visited.has(node.id)) continue

    const component: string[] = []
    const stack = [node.id]

    while (stack.length > 0) {
      const cur = stack.pop()!
      if (visited.has(cur)) continue
      visited.add(cur)
      component.push(cur)

      for (const nbrId of getNeighborIds(cur, edges)) {
        if (!visited.has(nbrId)) stack.push(nbrId)
      }
    }

    components.push(component)
  }

  return components
}
