/**
 * contingency.ts (N-1) 단위 테스트.
 *
 * 조류계산 자체(Newton-Raphson)는 별도 엔진(loadflow.ts)이 책임지므로 여기서는
 * 재검증하지 않는다. 이 모듈이 하는 일 — "이 장비를 뺀 네트워크로 다시 조류계산을
 * 돌린다"는 동작 자체가 실제로 장비를 제거하는지 — 를 검증한다.
 */
import { describe, it, expect } from 'vitest'
import type { Node as RFNode, Edge as RFEdge } from 'reactflow'
import type { NodeData, EdgeData, Bus, Motor } from '../types'
import { defaultEquipment, defaultCable } from '../types'
import { runContingencyAnalysis } from './contingency'
import { runLocalLoadflow } from './loadflow'

function bus(id: string, name: string, opts: Partial<Bus> = {}): RFNode<NodeData> {
  return { id, type: 'bus', position: { x: 0, y: 0 }, data: { equipment: { ...(defaultEquipment('bus', id) as Bus), name, ...opts } } }
}
function breaker(id: string, name: string): RFNode<NodeData> {
  return { id, type: 'breaker', position: { x: 0, y: 0 }, data: { equipment: { ...defaultEquipment('breaker', id), name } } }
}
function motor(id: string, name: string, opts: Partial<Motor> = {}): RFNode<NodeData> {
  return { id, type: 'motor', position: { x: 0, y: 0 }, data: { equipment: { ...(defaultEquipment('motor', id) as Motor), name, ...opts } } }
}
function edge(id: string, source: string, target: string): RFEdge<EdgeData> {
  return { id, source, target, type: 'cable', data: { cable: defaultCable(id) } }
}

// SRC(Slack) — Cable — LOAD(PQ) — Cable — CB1(breaker) — Cable — M1(motor)
// M1은 CB1을 통해서만 LOAD 버스에 연결된다.
function radialFeederNetwork(rated_kw = 3000) {
  const nodes = [
    bus('src', 'SRC', { busType: 'Slack', vn_kv: 22.9 }),
    bus('load', 'LOAD', { vn_kv: 22.9 }),
    breaker('cb1', 'CB1'),
    motor('m1', 'M1', { rated_kw, vn_kv: 22.9 }),
  ]
  const edges = [
    edge('e1', 'src', 'load'),
    edge('e2', 'load', 'cb1'),
    edge('e3', 'cb1', 'm1'),
  ]
  return { nodes, edges }
}

describe('runContingencyAnalysis — 차단기(breaker) N-1', () => {
  it('회귀: 차단기 하나를 제거한 케이스는 그 뒤에 매달린 전동기 부하가 실제로 빠진 조류계산 결과를 낸다', () => {
    // 예전 버그: 차단기 N-1 케이스가 equipment.in_service만 false로 바꿨는데,
    // findConnectedBusId/findReachableNodes(연결성 판정 함수들)는 차단기를 지날 때
    // is_closed만 보고 in_service는 전혀 보지 않는다. 그래서 "차단기 제거" 케이스가
    // 사실상 기준 케이스와 완전히 동일한 조류계산 결과를 냈다 — 그 차단기에 물린
    // 전동기가 여전히 정상 급전되는 것처럼 계산됐다는 뜻.
    const { nodes, edges } = radialFeederNetwork()

    const baseline = runLocalLoadflow(nodes, edges)
    const baselineLoadV = baseline.buses['load'].vm_pu
    const baselineCableLoading = baseline.lines['e1'].loading_percent

    const result = runContingencyAnalysis(nodes, edges)
    const cb1Case = result.cases.find(c => c.equipmentId === 'cb1')
    expect(cb1Case).toBeDefined()
    expect(cb1Case!.converged).toBe(true)

    // 차단기가 열리면 M1이 완전히 빠지므로: LOAD 버스 전압은 무부하에 가까워져
    // 1.0 pu에 훨씬 가까워야 하고(기준 케이스보다 반드시 더 높아야 함),
    // 상류 케이블의 부하율도 기준 케이스보다 뚜렷이 낮아져야 한다.
    expect(cb1Case!.minVoltagePu).toBeGreaterThan(baselineLoadV)
    expect(cb1Case!.minVoltagePu).toBeCloseTo(1.0, 2)
    expect(cb1Case!.maxLoadingPercent).toBeLessThan(baselineCableLoading * 0.1)
  })

  it('전동기 자체(generator/transformer와 달리 breaker가 아닌 노드)를 제거하는 케이스는 기존과 동일하게 in_service로 처리된다', () => {
    // breaker 전용 분기가 다른 장비 타입(transformer/generator)의 기존 동작을
    // 건드리지 않는지 확인 — generator 케이스가 여전히 in_service 기반으로 빠지는지.
    const nodes = [
      bus('src', 'SRC', { busType: 'Slack', vn_kv: 22.9 }),
      bus('load', 'LOAD', { vn_kv: 22.9 }),
      { id: 'gen1', type: 'generator', position: { x: 0, y: 0 },
        data: { equipment: { ...defaultEquipment('generator', 'gen1'), name: 'GEN1', p_mw: 1 } } } as RFNode<NodeData>,
    ]
    const edges = [edge('e1', 'src', 'load'), edge('e2', 'load', 'gen1')]

    const result = runContingencyAnalysis(nodes, edges)
    const genCase = result.cases.find(c => c.equipmentId === 'gen1')
    expect(genCase).toBeDefined()
    expect(genCase!.converged).toBe(true)
  })
})
