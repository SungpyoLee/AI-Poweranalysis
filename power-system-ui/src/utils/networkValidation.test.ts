/**
 * networkValidation.ts 단위 테스트.
 *
 * "이 네트워크가 실제 계산 엔진이 보는 것과 같은 그림으로 검증되는지"를
 * 확인한다 — 특히 findReachableNodes(→ checkSlackBus의 도달성 판정)가
 * loadflow.ts 등 실제 계산 엔진과 똑같이 in_service:false 케이블/장비를
 * 걸러내는지.
 */
import { describe, it, expect } from 'vitest'
import type { Node as RFNode, Edge as RFEdge } from 'reactflow'
import type { NodeData, EdgeData, Bus } from '../types'
import { defaultEquipment, defaultCable } from '../types'
import { validateNetwork } from './networkValidation'

function bus(id: string, name: string, busType: Bus['busType'] = 'PQ'): RFNode<NodeData> {
  return { id, type: 'bus', position: { x: 0, y: 0 }, data: { equipment: { ...(defaultEquipment('bus', id) as Bus), name, busType } } }
}
function edge(id: string, source: string, target: string, inService = true): RFEdge<EdgeData> {
  return { id, source, target, type: 'cable', data: { cable: { ...defaultCable(id), in_service: inService } } }
}

describe('validateNetwork — Slack Bus 도달성', () => {
  it('회귀: 폐기(in_service:false)된 케이블 하나로만 연결된 버스는 "도달 불가"로 잡아낸다', () => {
    // 예전 버그: findReachableNodes가 cable.in_service를 전혀 확인하지 않았다.
    // 그런데 loadflow.ts 등 실제 계산 엔진은 폐기된 케이블을 전부 걸러내고
    // 지나가지 않는다(Y-bus에 아예 안 들어감). 그래서 검증 로직은 "다
    // 연결됨, 문제없음"이라고 하는데 실제 조류계산에서는 그 버스가 전기적으로
        // 완전히 고립된 상태(Singular Jacobian 등)가 되는 불일치가 있었다.
    const nodes = [
      bus('main', 'MAIN', 'Slack'),
      bus('isolated', 'ISOLATED'),
    ]
    const edges = [edge('e1', 'main', 'isolated', false)]   // 폐기된 케이블

    const result = validateNetwork(nodes, edges)
    const issue = result.issues.find(i => i.code === 'BUS_UNREACHABLE_FROM_SLACK')
    expect(issue).toBeDefined()
    expect(issue!.nodeIds).toContain('isolated')
  })

  it('정상 케이블로 연결되면 도달 가능하다고 판정한다', () => {
    const nodes = [
      bus('main', 'MAIN', 'Slack'),
      bus('connected', 'CONNECTED'),
    ]
    const edges = [edge('e1', 'main', 'connected', true)]

    const result = validateNetwork(nodes, edges)
    expect(result.issues.find(i => i.code === 'BUS_UNREACHABLE_FROM_SLACK')).toBeUndefined()
  })
})
