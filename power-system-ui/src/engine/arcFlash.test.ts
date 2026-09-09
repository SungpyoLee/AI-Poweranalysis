/**
 * arcFlash.ts 단위 테스트.
 *
 * IEEE 1584 근사식 자체(Iarc/입사에너지/AFB)는 파일 자체가 "표준의 정확한
 * 전체 방정식이 아닌 근사"임을 명시하고 있어 재도출하지 않는다. 대신 이
 * 엔진이 직접 하는 일 — 어느 차단기의 동작시간을 "이 모선의 고장 차단시간"으로
 * 쓸지 고르는 로직, 그리고 작업거리·인클로저 기본값 처리 — 를 검증한다.
 */
import { describe, it, expect } from 'vitest'
import type { Node as RFNode, Edge as RFEdge } from 'reactflow'
import type { NodeData, EdgeData, Bus, RelayResult, ShortCircuitResults } from '../types'
import { defaultEquipment, defaultCable } from '../types'
import { computeArcFlash } from './arcFlash'

function bus(id: string, name: string, vn_kv: number, busType: Bus['busType'] = 'PQ'): RFNode<NodeData> {
  return {
    id, type: 'bus', position: { x: 0, y: 0 },
    data: { equipment: { ...(defaultEquipment('bus', id) as Bus), name, vn_kv, busType } },
  }
}
function breaker(id: string, name: string): RFNode<NodeData> {
  return { id, type: 'breaker', position: { x: 0, y: 0 }, data: { equipment: { ...defaultEquipment('breaker', id), name } } }
}
function motor(id: string, name: string): RFNode<NodeData> {
  return { id, type: 'motor', position: { x: 0, y: 0 }, data: { equipment: { ...defaultEquipment('motor', id), name } } }
}
function edge(id: string, source: string, target: string): RFEdge<EdgeData> {
  return { id, source, target, type: 'cable', data: { cable: defaultCable(id) } }
}
function sc(faults: Record<string, number>): ShortCircuitResults {
  const buses: ShortCircuitResults['buses'] = {}
  for (const [nodeId, ikss_ka] of Object.entries(faults)) {
    buses[nodeId] = { nodeId, ikss_ka, skss_mva: 0, ip_ka: 0, ib_ka: 0 }
  }
  return { buses }
}
function relayResult(overrides: Partial<RelayResult> & { breakerId: string; relay_operating_time_s: number }): RelayResult {
  return {
    breakerName: 'CB', busName: 'BUS', fault_current_ka: 10, curve_type: 'IEC_NORMAL_INVERSE',
    pickup_current_a: 100, time_dial: 0.2, inst_trip: overrides.relay_operating_time_s === 0,
    coordination_margin_s: Infinity, pass: true,
    ...overrides,
  }
}

describe('computeArcFlash — 차단시간 산정', () => {
  it('회귀: 이 모선의 하류(feeder) 차단기가 아무리 빨라도 모선 자체의 고장 차단시간으로 쓰지 않는다', () => {
    // 예전 버그: MAIN에 인접한 "모든" 닫힌 차단기 중 가장 빠른 동작시간을 그대로
    // MAIN의 아크플래시 차단시간으로 썼다. 하지만 MAIN에서 갈라져 나가는 하류
    // feeder 차단기(CB_FEEDER, 전동기 보호용)는 MAIN 자체에서 발생한 고장의
    // 전류 경로에 있지 않다 — 그 차단기가 아무리 빨리(순시) 열려도 MAIN의
    // 고장은 전혀 꺼지지 않는다. CB_FEEDER의 협조판정용 자기평가 시간(자기
    // 쪽 모선=MAIN 기준으로 계산된, 정당한 값)을 그대로 가져다 쓰면 안 된다.
    const nodes = [
      bus('main', 'MAIN', 22.9, 'Slack'),
      breaker('cbFeeder', 'CB-FEEDER'),
      motor('m1', 'M1'),
    ]
    const edges = [edge('e1', 'main', 'cbFeeder'), edge('e2', 'cbFeeder', 'm1')]
    const scResult = sc({ main: 10 })
    // CB-FEEDER의 협조 결과: MAIN 기준 순시 트립(t=0) — 실제 이 앱의
    // computeRelayResults가 만들어낼 법한, 정당하지만 방향이 다른 값.
    const relayResults = [relayResult({ breakerId: 'cbFeeder', busName: 'MAIN', fault_current_ka: 10, relay_operating_time_s: 0 })]

    const result = computeArcFlash(scResult, nodes, edges, relayResults)
    const mainItem = result.items['main']
    expect(mainItem).toBeDefined()
    // 상류 차단기를 못 찾았으므로 기본값 0.3s를 써야 한다 (CB-FEEDER의 0s가 아니라)
    expect(mainItem.clearing_time_s).toBe(0.3)
  })

  it('정상 케이스: 진짜 상류(소스 쪽) 차단기가 있으면 그 동작시간을 그대로 쓴다', () => {
    const nodes = [
      bus('source', 'SOURCE', 154, 'Slack'),
      breaker('cbUp', 'CB-UP'),
      bus('main', 'MAIN', 22.9),
    ]
    const edges = [edge('e1', 'source', 'cbUp'), edge('e2', 'cbUp', 'main')]
    const scResult = sc({ source: 5, main: 10 })
    const relayResults = [relayResult({ breakerId: 'cbUp', busName: 'MAIN', fault_current_ka: 10, relay_operating_time_s: 0.15 })]

    const result = computeArcFlash(scResult, nodes, edges, relayResults)
    const mainItem = result.items['main']
    expect(mainItem.clearing_time_s).toBeCloseTo(0.15, 6)
  })

  it('상류 차단기가 열려 있으면(is_closed=false) 차단시간 후보에서 제외된다', () => {
    const nodes = [
      bus('source', 'SOURCE', 154, 'Slack'),
      { ...breaker('cbUp', 'CB-UP'),
        data: { equipment: { ...defaultEquipment('breaker', 'cbUp'), name: 'CB-UP', is_closed: false } } } as RFNode<NodeData>,
      bus('main', 'MAIN', 22.9),
    ]
    const edges = [edge('e1', 'source', 'cbUp'), edge('e2', 'cbUp', 'main')]
    const scResult = sc({ source: 5, main: 10 })
    const relayResults = [relayResult({ breakerId: 'cbUp', busName: 'MAIN', fault_current_ka: 10, relay_operating_time_s: 0.15 })]

    const result = computeArcFlash(scResult, nodes, edges, relayResults)
    expect(result.items['main'].clearing_time_s).toBe(0.3)
  })
})
