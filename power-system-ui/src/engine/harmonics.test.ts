/**
 * harmonics.ts 단위 테스트.
 *
 * IEEE 519 THD 한계표는 표준값이라 재도출하지 않는다. 대신 이 엔진이 실제로
 * "고조파원/커패시터/리액터를 찾아 연결하는지" — 즉 계산이 항상 0%를 내는
 * 죽은 기능은 아닌지 — 를 검증한다.
 */
import { describe, it, expect } from 'vitest'
import type { Node as RFNode, Edge as RFEdge } from 'reactflow'
import type { NodeData, EdgeData, Bus, Motor, Load, CapacitorBank } from '../types'
import { defaultEquipment, defaultCable } from '../types'
import { computeHarmonics } from './harmonics'

function bus(id: string, name: string, vn_kv: number, busType: Bus['busType'] = 'PQ'): RFNode<NodeData> {
  return { id, type: 'bus', position: { x: 0, y: 0 }, data: { equipment: { ...(defaultEquipment('bus', id) as Bus), name, vn_kv, busType } } }
}
function edge(id: string, source: string, target: string): RFEdge<EdgeData> {
  return { id, source, target, type: 'cable', data: { cable: defaultCable(id) } }
}
const VFD_HARMONIC = {
  enabled: true, source_type: 'VFD' as const,
  h5_percent: 25, h7_percent: 14, h11_percent: 9, h13_percent: 7, h17_percent: 4, h19_percent: 3,
}

describe('computeHarmonics — 고조파원 탐색', () => {
  it('회귀: 모터에 설정한 고조파원이 실제로 잡혀서 0%가 아닌 전압 왜곡을 만든다', () => {
    // 예전 버그: 소스 목록을 모을 때 resolveTobus(모터의ID, ...)를 직접
    // 호출했는데, 이 함수는 시작 노드가 버스/차단기가 아니면(모터는 둘 다
    // 아님) 이웃을 보지도 않고 바로 null을 반환했다. 그래서 모터/부하에
    // 설정한 고조파원은 하나도 안 잡혔고, computeHarmonics는 항상 소스
        // 0개·왜곡 0%·PASS만 냈다 — IEEE 519 기능 전체가 죽어 있었다는 뜻.
    const nodes = [
      bus('main', 'MAIN', 6.6, 'Slack'),
      { id: 'm1', type: 'motor', position: { x: 0, y: 0 },
        data: { equipment: { ...(defaultEquipment('motor', 'm1') as Motor), vn_kv: 6.6, rated_kw: 500, harmonic: VFD_HARMONIC } } } as RFNode<NodeData>,
    ]
    const edges = [edge('e1', 'main', 'm1')]

    const result = computeHarmonics(nodes, edges, null)
    expect(result.sources).toHaveLength(1)
    expect(result.sources[0].sourceId).toBe('m1')
    expect(result.buses['main'].thdv_percent).toBeGreaterThan(0)
  })

  it('회귀: 부하에 설정한 고조파원도 잡힌다', () => {
    const nodes = [
      bus('main', 'MAIN', 0.4, 'Slack'),
      { id: 'l1', type: 'load', position: { x: 0, y: 0 },
        data: { equipment: { ...(defaultEquipment('load', 'l1') as Load), vn_kv: 0.4, p_kw: 100, harmonic: VFD_HARMONIC } } } as RFNode<NodeData>,
    ]
    const edges = [edge('e1', 'main', 'l1')]

    const result = computeHarmonics(nodes, edges, null)
    expect(result.sources).toHaveLength(1)
    expect(result.buses['main'].thdv_percent).toBeGreaterThan(0)
  })

  it('회귀: 커패시터 뱅크가 실제로 회로에 연결되어 계산에 영향을 준다', () => {
    // 같은 이유의 버그가 커패시터/리액터 연결 탐색에도 있었다 — 있으나 마나였다.
    // 커패시터가 실제로 연결됐다면 공진 상태가 바뀌어 THDv가 달라져야 한다.
    const makeNodes = (withCap: boolean): RFNode<NodeData>[] => {
      const ns: RFNode<NodeData>[] = [
        bus('main', 'MAIN', 6.6, 'Slack'),
        { id: 'm1', type: 'motor', position: { x: 0, y: 0 },
          data: { equipment: { ...(defaultEquipment('motor', 'm1') as Motor), vn_kv: 6.6, rated_kw: 500, harmonic: VFD_HARMONIC } } } as RFNode<NodeData>,
      ]
      if (withCap) {
        ns.push({ id: 'cap1', type: 'capacitor', position: { x: 0, y: 0 },
          data: { equipment: { ...(defaultEquipment('capacitor', 'cap1') as CapacitorBank), vn_kv: 6.6, qn_mvar: 5, steps: 1, step_enabled: 1 } } } as RFNode<NodeData>)
      }
      return ns
    }
    const makeEdges = (withCap: boolean): RFEdge<EdgeData>[] => {
      const es = [edge('e1', 'main', 'm1')]
      if (withCap) es.push(edge('e2', 'main', 'cap1'))
      return es
    }

    const without = computeHarmonics(makeNodes(false), makeEdges(false), null)
    const withCap = computeHarmonics(makeNodes(true), makeEdges(true), null)
    expect(withCap.buses['main'].thdv_percent).not.toBeCloseTo(without.buses['main'].thdv_percent, 6)
  })
})

describe('computeHarmonics — 3권선 변압기', () => {
  it('회귀: 3권선 변압기 건너편 모선은 고립되지 않고 물리적으로 타당한 왜곡률을 낸다', () => {
    // 예전 버그: buildBranches가 2권선 변압기만 처리해서, 3권선 변압기를 통해서만
    // 도달 가능한 모선은 특이행렬 방지용 아주 작은 누설 어드미턴스(1e-4pu)
    // 하나만 가진 채 나머지 회로와 사실상 단절돼 있었다. 임피던스가
        // 극단적으로 커서(약 10,000pu) 아주 작은 고조파 전류만 주입돼도
    // 전압왜곡이 물리적으로 말이 안 되는 수천~수만 %까지 치솟는다.
    const nodes = [
      bus('hv', 'HV', 22.9, 'Slack'),
      { id: 'tr3w', type: 'transformer3w', position: { x: 0, y: 0 },
        data: { equipment: defaultEquipment('transformer3w', 'tr3w') } } as RFNode<NodeData>,
      bus('mv', 'MV', 6.6),
      bus('lv', 'LV', 0.38),
      { id: 'm1', type: 'motor', position: { x: 0, y: 0 },
        data: { equipment: { ...(defaultEquipment('motor', 'm1') as Motor), vn_kv: 6.6, rated_kw: 500, harmonic: VFD_HARMONIC } } } as RFNode<NodeData>,
    ]
    const edges = [
      edge('e1', 'hv', 'tr3w'),
      edge('e2', 'tr3w', 'mv'),
      edge('e3', 'tr3w', 'lv'),
      edge('e4', 'mv', 'm1'),
    ]

    const result = computeHarmonics(nodes, edges, null)
    // 물리적으로 타당한 상한(100%) 이내 — 격리됐다면 수천 % 이상으로 치솟는다.
    expect(result.buses['mv'].thdv_percent).toBeGreaterThan(0)
    expect(result.buses['mv'].thdv_percent).toBeLessThan(100)
    expect(result.buses['hv'].thdv_percent).toBeGreaterThan(0)
    expect(result.buses['hv'].thdv_percent).toBeLessThan(100)
  })
})
