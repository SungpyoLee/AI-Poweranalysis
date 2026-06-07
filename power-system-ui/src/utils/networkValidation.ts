import type { Node, Edge } from 'reactflow'
import type { NodeData, EdgeData, Bus, Transformer } from '../types'
import {
  findReachableNodes,
  findAllComponents,
  findTransformerBuses,
  getNeighborIds,
} from './graphTraversal'

// ── 검증 결과 타입 ────────────────────────────────────────────────────────────
export type ValidationSeverity = 'error' | 'warning'

export interface ValidationIssue {
  code:     string            // 고유 에러 코드
  severity: ValidationSeverity
  message:  string            // 사용자에게 표시할 메시지
  nodeIds?: string[]          // 관련 노드 ID (하이라이트용)
  edgeIds?: string[]          // 관련 엣지 ID
}

export interface ValidationResult {
  valid:  boolean             // error가 하나도 없으면 true
  issues: ValidationIssue[]
}

// ── 1. Isolated Bus 검증 ──────────────────────────────────────────────────────
// 연결된 엣지가 하나도 없는 버스 감지
function checkIsolatedBus(
  nodes: Node<NodeData>[],
  edges: Edge<EdgeData>[]
): ValidationIssue[] {
  const issues: ValidationIssue[] = []
  const busList = nodes.filter(n => n.type === 'bus')

  for (const bus of busList) {
    const neighbors = getNeighborIds(bus.id, edges)
    if (neighbors.length === 0) {
      issues.push({
        code:     'ISOLATED_BUS',
        severity: 'error',
        message:  `Bus "${(bus.data.equipment as Bus).name}" 에 연결된 장비가 없습니다.`,
        nodeIds:  [bus.id],
      })
    }
  }

  return issues
}

// ── 2. Unconnected Equipment 검증 ─────────────────────────────────────────────
// Bus에 도달할 수 없는 장비 감지 (Motor, Generator, Load, Transformer)
function checkUnconnectedEquipment(
  nodes: Node<NodeData>[],
  edges: Edge<EdgeData>[]
): ValidationIssue[] {
  const issues: ValidationIssue[] = []
  const targetTypes = new Set(['motor', 'generator', 'load', 'transformer'])
  const equipment   = nodes.filter(n => targetTypes.has(n.type ?? ''))

  for (const node of equipment) {
    const neighbors = getNeighborIds(node.id, edges)
    if (neighbors.length === 0) {
      issues.push({
        code:     'UNCONNECTED_EQUIPMENT',
        severity: 'warning',
        message:  `"${node.data.equipment.name}" 가 계통에 연결되지 않았습니다.`,
        nodeIds:  [node.id],
      })
    }
  }

  return issues
}

// ── 3. Loop Detection (Bus-Bus 루프) ─────────────────────────────────────────
// 동일 연결 컴포넌트 내 Bus가 2개 이상이고 서로 직접 연결된 경우
// (변압기를 거치지 않고 동일 전압 버스들이 링 형성)
function checkLoops(
  nodes: Node<NodeData>[],
  edges: Edge<EdgeData>[]
): ValidationIssue[] {
  const issues: ValidationIssue[] = []
  const components = findAllComponents(nodes, edges)
  const nodeMap    = new Map(nodes.map(n => [n.id, n]))

  for (const component of components) {
    const busesInComponent = component.filter(id => nodeMap.get(id)?.type === 'bus')
    if (busesInComponent.length < 2) continue

    // 컴포넌트 내 Bus 간 직접 경로(Transformer 없음) 탐색
    for (let i = 0; i < busesInComponent.length; i++) {
      for (let j = i + 1; j < busesInComponent.length; j++) {
        const busA = busesInComponent[i]
        const busB = busesInComponent[j]
        if (hasDirectBusToBusPath(busA, busB, nodes, edges)) {
          const nameA = (nodeMap.get(busA)?.data.equipment as Bus)?.name ?? busA
          const nameB = (nodeMap.get(busB)?.data.equipment as Bus)?.name ?? busB
          issues.push({
            code:     'BUS_LOOP',
            severity: 'warning',
            message:  `"${nameA}" 와 "${nameB}" 사이에 변압기를 거치지 않는 직결 경로가 있습니다 (루프).`,
            nodeIds:  [busA, busB],
          })
        }
      }
    }
  }

  return issues
}

// BFS: busA → busB 경로에서 Transformer를 만나지 않고 도달 가능한지
function hasDirectBusToBusPath(
  busA:  string,
  busB:  string,
  nodes: Node<NodeData>[],
  edges: Edge<EdgeData>[]
): boolean {
  const nodeMap = new Map(nodes.map(n => [n.id, n]))
  const visited = new Set<string>([busA])
  const queue   = [busA]

  while (queue.length > 0) {
    const cur = queue.shift()!
    for (const nbrId of getNeighborIds(cur, edges)) {
      if (visited.has(nbrId)) continue
      if (nbrId === busB) return true

      const nbr = nodeMap.get(nbrId)
      if (!nbr) continue
      if (nbr.type === 'transformer') continue  // Transformer 경계에서 멈춤
      if (nbr.type === 'bus') continue          // 다른 Bus는 탐색하지 않음

      visited.add(nbrId)
      queue.push(nbrId)
    }
  }

  return false
}

// ── 4. Voltage Mismatch 검증 ─────────────────────────────────────────────────
// Transformer 양단 Bus의 공칭 전압이 Transformer 정격과 불일치하는 경우
function checkVoltageMismatch(
  nodes: Node<NodeData>[],
  edges: Edge<EdgeData>[]
): ValidationIssue[] {
  const issues:  ValidationIssue[] = []
  const nodeMap  = new Map(nodes.map(n => [n.id, n]))
  const trNodes  = nodes.filter(n => n.type === 'transformer')
  const TOLERANCE = 0.02  // 2% 허용

  for (const tr of trNodes) {
    const eq = tr.data.equipment as Transformer
    const { hvBusId, lvBusId } = findTransformerBuses(tr.id, nodes, edges)
    if (!hvBusId || !lvBusId) continue

    const hvBus = nodeMap.get(hvBusId)?.data.equipment as Bus | undefined
    const lvBus = nodeMap.get(lvBusId)?.data.equipment as Bus | undefined
    if (!hvBus || !lvBus) continue

    const hvMismatch = Math.abs(hvBus.vn_kv - eq.vn_hv_kv) / eq.vn_hv_kv
    const lvMismatch = Math.abs(lvBus.vn_kv - eq.vn_lv_kv) / eq.vn_lv_kv

    if (hvMismatch > TOLERANCE) {
      issues.push({
        code:     'VOLTAGE_MISMATCH_HV',
        severity: 'warning',
        message:  `"${eq.name}" HV 정격 ${eq.vn_hv_kv}kV와 Bus "${hvBus.name}" ${hvBus.vn_kv}kV 불일치.`,
        nodeIds:  [tr.id, hvBusId],
      })
    }
    if (lvMismatch > TOLERANCE) {
      issues.push({
        code:     'VOLTAGE_MISMATCH_LV',
        severity: 'warning',
        message:  `"${eq.name}" LV 정격 ${eq.vn_lv_kv}kV와 Bus "${lvBus.name}" ${lvBus.vn_kv}kV 불일치.`,
        nodeIds:  [tr.id, lvBusId],
      })
    }
  }

  return issues
}

// ── 5. Missing Slack Bus 검증 ─────────────────────────────────────────────────
// 계통 내 Slack Bus가 없거나 2개 이상인 경우
function checkSlackBus(
  nodes: Node<NodeData>[],
  edges: Edge<EdgeData>[]
): ValidationIssue[] {
  const issues   = []
  const busList  = nodes.filter(n => n.type === 'bus')
  const slackBuses = busList.filter(n => (n.data.equipment as Bus).busType === 'Slack')

  if (slackBuses.length === 0) {
    issues.push({
      code:     'NO_SLACK_BUS',
      severity: 'error' as ValidationSeverity,
      message:  'Slack Bus(기준 모선)가 없습니다. 조류계산을 위해 최소 1개의 Slack Bus가 필요합니다.',
    })
  } else if (slackBuses.length > 1) {
    issues.push({
      code:     'MULTIPLE_SLACK_BUS',
      severity: 'warning' as ValidationSeverity,
      message:  `Slack Bus가 ${slackBuses.length}개입니다. 1개만 권장됩니다.`,
      nodeIds:  slackBuses.map(n => n.id),
    })
  }

  // Slack Bus가 계통과 분리된 경우
  if (slackBuses.length > 0) {
    const slackId   = slackBuses[0].id
    const reachable = findReachableNodes(slackId, nodes, edges)
    const busesNotReachable = busList
      .filter(n => n.id !== slackId && !reachable.has(n.id))

    for (const bus of busesNotReachable) {
      issues.push({
        code:     'BUS_UNREACHABLE_FROM_SLACK',
        severity: 'warning' as ValidationSeverity,
        message:  `Bus "${(bus.data.equipment as Bus).name}" 가 Slack Bus에서 도달 불가능합니다 (개방 차단기 확인).`,
        nodeIds:  [bus.id, slackId],
      })
    }
  }

  return issues
}

// ── 메인 검증 함수 ────────────────────────────────────────────────────────────
export function validateNetwork(
  nodes: Node<NodeData>[],
  edges: Edge<EdgeData>[]
): ValidationResult {
  if (nodes.length === 0) {
    return {
      valid:  false,
      issues: [{
        code:     'EMPTY_NETWORK',
        severity: 'error',
        message:  '계통도에 장비가 없습니다.',
      }],
    }
  }

  const issues: ValidationIssue[] = [
    ...checkIsolatedBus(nodes, edges),
    ...checkUnconnectedEquipment(nodes, edges),
    ...checkLoops(nodes, edges),
    ...checkVoltageMismatch(nodes, edges),
    ...checkSlackBus(nodes, edges),
  ]

  const hasError = issues.some(i => i.severity === 'error')

  return { valid: !hasError, issues }
}
