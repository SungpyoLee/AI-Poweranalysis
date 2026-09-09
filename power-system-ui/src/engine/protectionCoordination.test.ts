/**
 * protectionCoordination.ts 단위 테스트.
 *
 * IEC 60255 반한시 곡선 공식 자체는 검증된 표준식이므로 재도출하지 않는다.
 * 대신 이 엔진이 직접 구현한 "배선"을 검증한다 — 어느 모선이 이 차단기의
 * 하류(protected bus)인지 고르는 로직, 상류(backup) 차단기를 그래프에서
 * 찾는 BFS, 그리고 상류·하류 동작시간 차이(협조 마진) 계산. 기대값은
 * 표준식을 독립적으로(구현과 별개로) 손 계산해 검증한다.
 */
import { describe, it, expect } from 'vitest'
import type { Node as RFNode, Edge as RFEdge } from 'reactflow'
import type { NodeData, EdgeData, Bus, Breaker, RelaySettings, ShortCircuitResults } from '../types'
import { defaultEquipment, defaultCable } from '../types'
import { computeRelayResults, computeDifferentialRelayResults } from './protectionCoordination'

function bus(id: string, name: string, vn_kv = 22.9, busType: Bus['busType'] = 'PQ'): RFNode<NodeData> {
  return {
    id, type: 'bus', position: { x: 0, y: 0 },
    data: { equipment: { ...(defaultEquipment('bus', id) as Bus), name, vn_kv, busType } },
  }
}

function breaker(
  id: string, name: string,
  relay: Partial<RelaySettings> | null,
  opts: Partial<Breaker> = {},
): RFNode<NodeData> {
  const base = defaultEquipment('breaker', id) as Breaker
  return {
    id, type: 'breaker', position: { x: 0, y: 0 },
    data: {
      equipment: {
        ...base, name,
        relay: relay ? { ...base.relay!, ...relay } : undefined,
        ...opts,
      },
    },
  }
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

const NI = { curve_type: 'IEC_NORMAL_INVERSE' as const, inst_enabled: false, inst_pickup_a: 999_999 }

/**
 * 방사형 보호 체계: MAIN — CB_UP(상류, 릴레이) — MID — CB_DOWN(하류, 릴레이) — LOAD
 * 고장전류는 하류로 갈수록 작아진다(임피던스 누적) — solver.py 테스트에서 쓴 것과 같은 물리적 전제.
 */
function radialChain(upRelay: Partial<RelaySettings>, downRelay: Partial<RelaySettings>) {
  const nodes = [
    bus('main', 'MAIN', 22.9, 'Slack'),
    breaker('cbUp', 'CB-UP', { ...NI, ...upRelay }),
    bus('mid', 'MID'),
    breaker('cbDown', 'CB-DOWN', { ...NI, ...downRelay }),
    bus('load', 'LOAD'),
  ]
  const edges = [
    edge('e1', 'main', 'cbUp'),
    edge('e2', 'cbUp', 'mid'),
    edge('e3', 'mid', 'cbDown'),
    edge('e4', 'cbDown', 'load'),
  ]
  const scResult = sc({ main: 10, mid: 8, load: 5 })
  return { nodes, edges, scResult }
}

describe('computeRelayResults — 방사형 보호협조', () => {
  it('하류 차단기는 인접 모선 중 Ik"가 더 작은 쪽(하류)을 보호 대상으로 고른다', () => {
    const { nodes, edges, scResult } = radialChain(
      { pickup_current_a: 1000, time_dial: 0.35 },
      { pickup_current_a: 500, time_dial: 0.3 },
    )
    const results = computeRelayResults(scResult, nodes, edges)
    const down = results.find(r => r.breakerId === 'cbDown')!
    const up   = results.find(r => r.breakerId === 'cbUp')!

    expect(down.busName).toBe('LOAD')   // mid(8) vs load(5) 중 더 작은 load
    expect(up.busName).toBe('MID')      // main(10) vs mid(8) 중 더 작은 mid
  })

  it('적절히 정정된 상류·하류는 IEC 표준식대로 동작시간 차(협조 마진)를 계산하고 pass=true', () => {
    const { nodes, edges, scResult } = radialChain(
      { pickup_current_a: 1000, time_dial: 0.35 },
      { pickup_current_a: 500, time_dial: 0.3 },
    )
    const results = computeRelayResults(scResult, nodes, edges, 0.3)
    const down = results.find(r => r.breakerId === 'cbDown')!

    // 독립 계산: M=5000/500=10, t=0.14*0.3/(10^0.02-1)
    expect(down.relay_operating_time_s).toBeCloseTo(0.89118, 4)
    // 상류는 같은 고장전류(5000A, 하류가 보는 그 고장)에서 자신이라면 얼마나 걸릴지로 평가
    // M=5000/1000=5, t=0.14*0.35/(5^0.02-1)
    expect(down.coordination_margin_s).toBeCloseTo(1.49790 - 0.89118, 3)
    expect(down.pass).toBe(true)
  })

  it('상류·하류 정정값이 같으면(오정정) 협조 마진이 0 근처 → 기준(0.3s) 미달로 pass=false', () => {
    const { nodes, edges, scResult } = radialChain(
      { pickup_current_a: 500, time_dial: 0.3 },   // 상류를 하류와 똑같이 정정 — 실무 오류
      { pickup_current_a: 500, time_dial: 0.3 },
    )
    const results = computeRelayResults(scResult, nodes, edges, 0.3)
    const down = results.find(r => r.breakerId === 'cbDown')!

    expect(down.coordination_margin_s).toBeCloseTo(0, 6)
    expect(down.pass).toBe(false)
  })

  it('고장전류가 픽업 미만(M≤1)인 릴레이는 동작하지 않으므로 결과에서 제외된다', () => {
    const { nodes, edges, scResult } = radialChain(
      { pickup_current_a: 1000, time_dial: 0.35 },
      { pickup_current_a: 50_000, time_dial: 0.3 },   // 고장전류(5000A)보다 픽업이 훨씬 큼
    )
    const results = computeRelayResults(scResult, nodes, edges)
    expect(results.find(r => r.breakerId === 'cbDown')).toBeUndefined()
  })

  it('순시(inst_pickup_a) 이상의 고장전류는 즉시(0초) 동작한다', () => {
    const { nodes, edges, scResult } = radialChain(
      { pickup_current_a: 1000, time_dial: 0.35 },
      { pickup_current_a: 500, time_dial: 0.3, inst_enabled: true, inst_pickup_a: 3000 },
    )
    const results = computeRelayResults(scResult, nodes, edges)
    const down = results.find(r => r.breakerId === 'cbDown')!
    expect(down.inst_trip).toBe(true)
    expect(down.relay_operating_time_s).toBe(0)
  })

  it('상류에 릴레이 있는 차단기가 없으면 마진은 Infinity, pass는 true(위반 아님)로 처리한다', () => {
    const nodes = [
      bus('main', 'MAIN', 22.9, 'Slack'),
      breaker('cbOnly', 'CB-ONLY', { ...NI, pickup_current_a: 500, time_dial: 0.3 }),
      bus('load', 'LOAD'),
    ]
    const edges = [edge('e1', 'main', 'cbOnly'), edge('e2', 'cbOnly', 'load')]
    const results = computeRelayResults(sc({ main: 10, load: 5 }), nodes, edges)
    const r = results.find(r => r.breakerId === 'cbOnly')!
    expect(r.coordination_margin_s).toBe(Infinity)
    expect(r.pass).toBe(true)
  })

  it('상류 차단기가 열려 있으면(is_closed=false) 그 지점에서 탐색이 막혀 상류를 찾지 못한다', () => {
    const { nodes, edges, scResult } = radialChain(
      { pickup_current_a: 1000, time_dial: 0.35 },
      { pickup_current_a: 500, time_dial: 0.3 },
    )
    const opened = nodes.map(n =>
      n.id === 'cbUp' ? { ...n, data: { equipment: { ...(n.data.equipment as Breaker), is_closed: false } } } : n,
    )
    const results = computeRelayResults(scResult, opened, edges)
    const down = results.find(r => r.breakerId === 'cbDown')!
    expect(down.coordination_margin_s).toBe(Infinity)
    expect(down.pass).toBe(true)
  })

  it('protectedBusId를 명시하면 자동(최소 Ik") 선택 대신 그 모선을 우선한다', () => {
    const nodes = [
      bus('main', 'MAIN', 22.9, 'Slack'),
      breaker('cb', 'CB', { ...NI, pickup_current_a: 500, time_dial: 0.3 }, { protectedBusId: 'main' }),
      bus('load', 'LOAD'),
    ]
    const edges = [edge('e1', 'main', 'cb'), edge('e2', 'cb', 'load')]
    // main(10)이 load(5)보다 Ik"가 크지만 protectedBusId로 명시했으므로 main이 선택돼야 함
    const results = computeRelayResults(sc({ main: 10, load: 5 }), nodes, edges)
    expect(results[0].busName).toBe('MAIN')
    expect(results[0].fault_current_ka).toBe(10)
  })
})

describe('computeRelayResults — 변압기로 직접 연결된 차단기 (버스가 아닌 하류)', () => {
  // 실제 예제 프로젝트(exampleNetwork.ts)에서 발견된 버그의 최소 재현:
  // MAIN(Slack) — CB_A(계전기) — TR_A(변압기) — LV_A(버스) — CB_A2(계전기) — MOTOR_A
  // CB_A/CB_A2 둘 다 "버스가 아닌" 장비(변압기/전동기)로 직접 이어진다 — 이 앱의
  // 실제 배치에서 가장 흔한 패턴이며, 예전엔 이 패턴에서 getDownstreamBus가 잘못된
  // "보호 모선"을 골라 findUpstreamBreaker가 변압기를 그냥 지나가는 노드로 취급해
  // 반대편(진짜 하류)까지 넘어가버렸다 — CB-103의 "상류"가 실제로는 하류인
  // CB-201로 잘못 잡히던 것과 동일한 구조.
  function transformerBoundaryNetwork() {
    const nodes = [
      bus('main', 'MAIN', 22.9, 'Slack'),
      breaker('cbA', 'CB-A', { ...NI, pickup_current_a: 100, time_dial: 0.2 }),
      { id: 'trA', type: 'transformer', position: { x: 0, y: 0 },
        data: { equipment: { ...defaultEquipment('transformer', 'trA'), vn_hv_kv: 22.9, vn_lv_kv: 0.38, sn_mva: 1 } },
      } as RFNode<NodeData>,
      bus('lvA', 'LV_A', 0.38),
      breaker('cbA2', 'CB-A2', { ...NI, pickup_current_a: 50, time_dial: 0.1 }),
      { id: 'motorA', type: 'motor', position: { x: 0, y: 0 },
        data: { equipment: defaultEquipment('motor', 'motorA') },
      } as RFNode<NodeData>,
    ]
    const edges = [
      edge('e1', 'main', 'cbA'),
      edge('e2', 'cbA', 'trA'),
      edge('e3', 'trA', 'lvA'),
      edge('e4', 'lvA', 'cbA2'),
      edge('e5', 'cbA2', 'motorA'),
    ]
    const scResult = sc({ main: 10, lvA: 25 })
    return { nodes, edges, scResult }
  }

  it('변압기 1차측 차단기(CB-A)는 하류가 변압기라 경계에서 막히고, 자기 쪽(MAIN) 고장전류로 평가된다', () => {
    const { nodes, edges, scResult } = transformerBoundaryNetwork()
    const results = computeRelayResults(scResult, nodes, edges)
    const a = results.find(r => r.breakerId === 'cbA')!
    expect(a.busName).toBe('MAIN')
    expect(a.fault_current_ka).toBe(10)
  })

  it('변압기 2차측 차단기(CB-A2)는 하류가 전동기(버스 아님)라 자기 쪽(LV_A) 고장전류로 평가된다', () => {
    const { nodes, edges, scResult } = transformerBoundaryNetwork()
    const results = computeRelayResults(scResult, nodes, edges)
    const a2 = results.find(r => r.breakerId === 'cbA2')!
    expect(a2.busName).toBe('LV_A')
    expect(a2.fault_current_ka).toBe(25)
  })

  it('회귀: CB-A2(LV측)는 변압기 건너편의 CB-A(MV측)를 상류로 착각하지 않는다', () => {
    // 예전 버그라면 findUpstreamBreaker가 변압기를 그냥 통과해 CB-A를 "상류"로
    // 찾아내고, CB-A2의 25kA(LV 기준)를 CB-A의 100A 픽업(MV 기준)에 그대로
    // 대입해 변압비를 무시한 채 마진을 계산했을 것이다.
    const { nodes, edges, scResult } = transformerBoundaryNetwork()
    const results = computeRelayResults(scResult, nodes, edges)
    const a2 = results.find(r => r.breakerId === 'cbA2')!
    expect(a2.coordination_margin_s).toBe(Infinity)
    expect(a2.pass).toBe(true)
  })

  it('회귀(반대 방향): CB-A(MV측)도 변압기 건너편의 CB-A2(LV측)를 상류/하류로 착각하지 않는다', () => {
    const { nodes, edges, scResult } = transformerBoundaryNetwork()
    const results = computeRelayResults(scResult, nodes, edges)
    const a = results.find(r => r.breakerId === 'cbA')!
    expect(a.coordination_margin_s).toBe(Infinity)
    expect(a.pass).toBe(true)
  })
})

describe('computeRelayResults — 51N 지락 계전기', () => {
  it('고체 접지 계통은 Ik"의 0.87배를 지락고장전류로 근사한다', () => {
    const base = breaker('cb51n', 'CB-51N', null, {
      grounding: 'SOLID',
      relay_51n: { pickup_current_a: 100, time_dial: 0.2, curve_type: 'IEC_NORMAL_INVERSE', inst_enabled: false, inst_pickup_a: 999_999 },
    })
    const nodes = [bus('main', 'MAIN', 22.9, 'Slack'), base, bus('load', 'LOAD')]
    const edges = [edge('e1', 'main', 'cb51n'), edge('e2', 'cb51n', 'load')]
    const results = computeRelayResults(sc({ main: 10, load: 5 }), nodes, edges)
    const r = results.find(r => r.breakerId === 'cb51n_51N')!
    expect(r.fault_current_ka).toBeCloseTo(5 * 0.87, 6)
  })

  it('중성점 비접지(ISOLATED) 계통은 지락계전기를 아예 평가하지 않는다', () => {
    const base = breaker('cb51n', 'CB-51N', null, {
      grounding: 'ISOLATED',
      relay_51n: { pickup_current_a: 100, time_dial: 0.2, curve_type: 'IEC_NORMAL_INVERSE', inst_enabled: false, inst_pickup_a: 999_999 },
    })
    const nodes = [bus('main', 'MAIN', 22.9, 'Slack'), base, bus('load', 'LOAD')]
    const edges = [edge('e1', 'main', 'cb51n'), edge('e2', 'cb51n', 'load')]
    const results = computeRelayResults(sc({ main: 10, load: 5 }), nodes, edges)
    expect(results.find(r => r.breakerId === 'cb51n_51N')).toBeUndefined()
  })

  it('회귀: 51N 지락 계전기만 있고 50/51 상간 계전기가 하나도 없어도 결과가 비지 않는다', () => {
    // 예전 버그: computeRelayResults가 "relay(50/51)가 있는 차단기가 하나도 없으면"
    // 바로 빈 배열을 반환해서, 51N 전용 구성에서는 51N 결과까지 통째로 사라졌다.
    const cbNode = breaker('cb51n-only', 'CB-51N-ONLY', null, {
      grounding: 'SOLID',
      relay_51n: {
        pickup_current_a: 100, time_dial: 0.2, curve_type: 'IEC_NORMAL_INVERSE',
        inst_enabled: false, inst_pickup_a: 999_999,
      },
    })
    const nodes = [bus('main', 'MAIN', 22.9, 'Slack'), cbNode, bus('load', 'LOAD')]
    const edges = [edge('e1', 'main', 'cb51n-only'), edge('e2', 'cb51n-only', 'load')]

    const results = computeRelayResults(sc({ main: 10, load: 5 }), nodes, edges)
    expect(results).toHaveLength(1)
    expect(results[0].breakerId).toBe('cb51n-only_51N')
  })
})

describe('computeDifferentialRelayResults — 87T', () => {
  it('평형 부하(HV=LV 유효전력 동일)에서는 차동전류가 0에 가까워 오동작하지 않는다', () => {
    const trNode = {
      id: 'tr', type: 'transformer', position: { x: 0, y: 0 },
      data: { equipment: { ...defaultEquipment('transformer', 'tr'), sn_mva: 10, vn_hv_kv: 22.9, vn_lv_kv: 6.6 } },
    } as RFNode<NodeData>
    const cbNode = breaker('cb87t', 'CB-87T', null, {
      relay_87t: { pickup_pct: 20, slope1_pct: 25, slope2_pct: 50, harmonic_restraint: true, harmonic_pct: 15 },
    })
    const nodes = [trNode, cbNode]
    const edges = [edge('e1', 'tr', 'cb87t')]
    const loadflow = {
      converged: true, buses: {}, lines: {}, generators: {}, motors: {},
      transformers: { tr: { nodeId: 'tr', loading_percent: 50, p_hv_mw: 5, q_hv_mvar: 1, p_lv_mw: 5, q_lv_mvar: 1 } },
    } as any

    const results = computeDifferentialRelayResults(nodes, edges, loadflow)
    expect(results[0].trips).toBe(false)
    expect(results[0].pass).toBe(true)
  })

  it('HV·LV 유효전력이 크게 어긋나면(내부 고장을 흉내낸 큰 불평형) 트립한다', () => {
    // HV/LV 전압을 같게 두면 회전비 영향이 없어져 픽업 임계값을 손 계산하기 쉽다.
    const trNode = {
      id: 'tr', type: 'transformer', position: { x: 0, y: 0 },
      data: { equipment: { ...defaultEquipment('transformer', 'tr'), sn_mva: 10, vn_hv_kv: 10, vn_lv_kv: 10 } },
    } as RFNode<NodeData>
    const cbNode = breaker('cb87t', 'CB-87T', null, {
      relay_87t: { pickup_pct: 20, slope1_pct: 25, slope2_pct: 50, harmonic_restraint: true, harmonic_pct: 15 },
    })
    const nodes = [trNode, cbNode]
    const edges = [edge('e1', 'tr', 'cb87t')]
    const loadflow = {
      converged: true, buses: {}, lines: {}, generators: {}, motors: {},
      // HV는 8MW 유입, LV는 거의 0 — 내부 고장을 흉내낸 큰 불평형
      transformers: { tr: { nodeId: 'tr', loading_percent: 80, p_hv_mw: 8, q_hv_mvar: 1, p_lv_mw: 0, q_lv_mvar: 0 } },
    } as any

    const results = computeDifferentialRelayResults(nodes, edges, loadflow)
    expect(results[0].diff_current_pct).toBeGreaterThan(80)   // 독립 계산: ≈80.6%
    expect(results[0].trips).toBe(true)
    expect(results[0].pass).toBe(false)
  })

  it('억제전류는 변압기 정격이 아니라 실제 부하수준을 따라간다(4배 부하 → 억제전류도 약 4배)', () => {
    // 회귀: 예전엔 restrain_current_a가 (I_rated_hv+I_rated_lv)/2로 고정돼 있어서
    // 실제 부하가 얼마든 항상 같은 값이 나왔다(=경부하에서도 중부하와 똑같이
    // 둔감/민감했다는 뜻). 지금은 양쪽의 "실제" 전류(부하조류 P,Q 기반)를 정격
    // 전류로 정규화한 뒤 평균한 값이므로, 같은 비율의 불평형이라도 부하수준이
    // 오르면 억제전류도 같이 올라가야 한다 — 실제 87T 계전기의 동작 원리대로.
    const makeNode = (p_hv: number, p_lv: number) => {
      const trNode = {
        id: 'tr', type: 'transformer', position: { x: 0, y: 0 },
        data: { equipment: { ...defaultEquipment('transformer', 'tr'), sn_mva: 10, vn_hv_kv: 22.9, vn_lv_kv: 6.6 } },
      } as RFNode<NodeData>
      const cbNode = breaker('cb87t', 'CB-87T', null, {
        relay_87t: { pickup_pct: 20, slope1_pct: 25, slope2_pct: 50, harmonic_restraint: true, harmonic_pct: 15 },
      })
      const nodes = [trNode, cbNode]
      const edges = [edge('e1', 'tr', 'cb87t')]
      const loadflow = {
        converged: true, buses: {}, lines: {}, generators: {}, motors: {},
        transformers: { tr: { nodeId: 'tr', loading_percent: 0, p_hv_mw: p_hv, q_hv_mvar: 0, p_lv_mw: p_lv, q_lv_mvar: 0 } },
      } as any
      return computeDifferentialRelayResults(nodes, edges, loadflow)[0]
    }

    // 두 시나리오 모두 HV 대비 LV가 10% 적은(=같은 비율의) 불평형이지만, 절대
    // 부하수준은 4배 차이난다.
    const light = makeNode(2, 1.8)
    const heavy = makeNode(8, 7.2)

    // 독립 계산: I_hv_actual = p_hv*1000/(√3·22.9), I_lv_actual = p_lv*1000/(√3·6.6)
    // light: restrain ≈ (50.43+157.5)/2 ≈ 103.96A, heavy: ≈ (201.7+629.9)/2 ≈ 415.85A
    expect(heavy.restrain_current_a).toBeCloseTo(4 * light.restrain_current_a, -1)
  })
})
