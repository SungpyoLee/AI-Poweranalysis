/**
 * tcc.ts (buildTCCData) 단위 테스트.
 *
 * IEC 60255 / ANSI C37.112 반한시 곡선 공식 자체는 protectionCoordination.test.ts에서
 * 이미 독립 검증했으므로 여기서는 재검증하지 않는다. 대신 이 모듈이 직접 하는 일 —
 * relayResults/nodes/edges로부터 그래프 좌표 범위(x/y min/max)를 정하고, 계전기별
 * 곡선·순시 수직선·고장전류 라인·협조마진 주석을 "걸러서 배열에 담는" 로직, 그리고
 * 케이블 허용전류-시간 곡선과 변압기 관통고장 손상곡선을 만드는 로직을 검증한다.
 */
import { describe, it, expect } from 'vitest'
import type { Node as RFNode, Edge as RFEdge } from 'reactflow'
import type { NodeData, EdgeData, Breaker, RelaySettings, RelayResult, Cable, Transformer } from '../types'
import { defaultEquipment, defaultCable } from '../types'
import { buildTCCData } from './tcc'

function bus(id: string, name: string): RFNode<NodeData> {
  return {
    id, type: 'bus', position: { x: 0, y: 0 },
    data: { equipment: { ...defaultEquipment('bus', id), name } },
  }
}

function breaker(id: string, name: string, relay: Partial<RelaySettings> | null): RFNode<NodeData> {
  const base = defaultEquipment('breaker', id) as Breaker
  return {
    id, type: 'breaker', position: { x: 0, y: 0 },
    data: { equipment: { ...base, name, relay: relay ? { ...base.relay!, ...relay } : undefined } },
  }
}

function transformer(id: string, opts: Partial<Transformer> = {}): RFNode<NodeData> {
  const base = defaultEquipment('transformer', id) as Transformer
  return {
    id, type: 'transformer', position: { x: 0, y: 0 },
    data: { equipment: { ...base, ...opts } },
  }
}

function cableEdge(id: string, source: string, target: string, cableOpts: Partial<Cable> = {}): RFEdge<EdgeData> {
  return { id, source, target, type: 'cable', data: { cable: { ...defaultCable(id), ...cableOpts } } }
}

function relayResult(overrides: Partial<RelayResult> & { breakerId: string }): RelayResult {
  return {
    breakerName: 'CB', busName: 'BUS',
    fault_current_ka: 5, curve_type: 'IEC_NORMAL_INVERSE',
    pickup_current_a: 200, time_dial: 0.1,
    relay_operating_time_s: 0.5, inst_trip: false,
    coordination_margin_s: 0.4, pass: true,
    ...overrides,
  }
}

// pickup=200(default relay), fault=5kA인 기본 케이스의 x/y 범위:
// xMin = 10^floor(log10(200*0.5))=10^floor(log10(100))=100
// xMax = 10^ceil(log10(5*1000*3))=10^ceil(log10(15000))=100000
const XMIN = 100
const XMAX = 100000

describe('buildTCCData — 입력 가드', () => {
  it('relayResults가 비어 있으면 빈 기본값을 반환한다', () => {
    const data = buildTCCData([], [])
    expect(data.curves).toEqual([])
    expect(data.faultLines).toEqual([])
    expect(data.margins).toEqual([])
    expect(data.cableWithstands).toEqual([])
    expect(data.transformerDamages).toEqual([])
  })

  it('relayResults는 있지만 대응하는 차단기에 relay(50/51) 설정이 하나도 없으면 빈 기본값을 반환한다', () => {
    // 51N 전용 breaker처럼 .relay가 undefined인 경우 — TCC는 상간(50/51) 곡선만 그린다.
    const nodes = [bus('main', 'MAIN'), breaker('cb', 'CB', null), bus('load', 'LOAD')]
    const results = [relayResult({ breakerId: 'cb' })]
    const data = buildTCCData(results, nodes)
    expect(data.curves).toEqual([])
    expect(data.xMin).toBe(100)   // 기본값 그대로
  })
})

describe('buildTCCData — 좌표 범위(x/y min/max)', () => {
  it('픽업의 0.5배(하한)·고장전류의 3배(상한)를 10의 거듭제곱으로 반올림한다', () => {
    const nodes = [bus('main', 'MAIN'), breaker('cb', 'CB', { pickup_current_a: 200 })]
    const results = [relayResult({ breakerId: 'cb', fault_current_ka: 5 })]
    const data = buildTCCData(results, nodes)
    expect(data.xMin).toBe(XMIN)
    expect(data.xMax).toBe(XMAX)
    expect(data.yMin).toBe(0.01)
    expect(data.yMax).toBe(100)
  })

  it('relay가 없는 결과는 범위 계산에서 제외된다(있는 것만 반영)', () => {
    const nodes = [
      bus('main', 'MAIN'),
      breaker('cbNoRelay', 'CB-NONE', null),
      breaker('cbRelay', 'CB-OK', { pickup_current_a: 200 }),
    ]
    const results = [
      relayResult({ breakerId: 'cbNoRelay', fault_current_ka: 999 }), // relay 없음 → 무시돼야 함
      relayResult({ breakerId: 'cbRelay', fault_current_ka: 5 }),
    ]
    const data = buildTCCData(results, nodes)
    // 999kA짜리가 반영됐다면 xMax가 훨씬 커야 하는데, 무시되므로 5kA 기준값 그대로
    expect(data.xMax).toBe(XMAX)
    expect(data.curves).toHaveLength(1)
  })
})

describe('buildTCCData — 계전기 곡선(curves)', () => {
  const nodes = [
    bus('main', 'MAIN'),
    breaker('cb', 'CB-A', { pickup_current_a: 200, time_dial: 0.1, inst_enabled: true, inst_pickup_a: 2000 }),
  ]

  it('픽업·순시·고장전류·동작시간·순시트립 여부를 결과에 그대로 반영한다', () => {
    const results = [relayResult({
      breakerId: 'cb', breakerName: 'CB-A', busName: 'MAIN',
      fault_current_ka: 5, relay_operating_time_s: 0.734, inst_trip: false,
    })]
    const data = buildTCCData(results, nodes)
    expect(data.curves).toHaveLength(1)
    const c = data.curves[0]
    expect(c.breakerId).toBe('cb')
    expect(c.breakerName).toBe('CB-A')
    expect(c.busName).toBe('MAIN')
    expect(c.pickup_a).toBe(200)
    expect(c.inst_a).toBe(2000)
    expect(c.faultCurrent_a).toBe(5000)      // ka → a
    expect(c.operatingTime_s).toBe(0.734)
    expect(c.instTrip).toBe(false)
    expect(c.points.length).toBeGreaterThan(1)
  })

  it('순시가 꺼져 있으면 inst_a는 null이고 순시 수직선(instSegment)도 없다', () => {
    const offNodes = [bus('main', 'MAIN'), breaker('cb', 'CB-A', { pickup_current_a: 200, inst_enabled: false })]
    const results = [relayResult({ breakerId: 'cb' })]
    const data = buildTCCData(results, offNodes)
    expect(data.curves[0].inst_a).toBeNull()
    expect(data.curves[0].instSegment).toBeNull()
  })

  it('순시 픽업이 x축 범위 안에 있으면 순시 수직선을 그린다(하단 y=0.02, 상단은 그 지점 곡선값)', () => {
    const results = [relayResult({ breakerId: 'cb', fault_current_ka: 5 })]
    const data = buildTCCData(results, nodes)
    const seg = data.curves[0].instSegment
    expect(seg).not.toBeNull()
    expect(seg![0].x).toBe(2000)
    expect(seg![1]).toEqual({ x: 2000, y: 0.02 })
    // 독립 계산: t = 0.14*0.1 / ((2000/200*0.999)^0.02 - 1) ≈ 0.297
    expect(seg![0].y).toBeCloseTo(0.2971919907438081, 6)
  })

  it('OCR 곡선 위의 모든 점은 IEC 반한시 공식을 만족한다(x=M·pickup, t=iecTime(M))', () => {
    const results = [relayResult({ breakerId: 'cb', fault_current_ka: 5 })]
    const data = buildTCCData(results, nodes)
    const { pickup_a } = data.curves[0]
    for (const p of data.curves[0].points) {
      const M = p.x / pickup_a
      const expectedT = (0.14 * 0.1) / (Math.pow(M, 0.02) - 1)
      expect(p.y).toBeCloseTo(expectedT, 6)
      expect(p.y).toBeGreaterThanOrEqual(0.01)
      expect(p.y).toBeLessThanOrEqual(100)
    }
  })
})

describe('buildTCCData — 고장전류 라인(faultLines) 중복 제거', () => {
  it('같은 고장전류를 가진 여러 계전기는 하나의 라인으로 합쳐지고, 처음 등장한 모선 이름을 쓴다', () => {
    const nodes = [
      bus('main', 'MAIN'),
      breaker('cb1', 'CB-1', { pickup_current_a: 200 }),
      breaker('cb2', 'CB-2', { pickup_current_a: 300 }),
    ]
    const results = [
      relayResult({ breakerId: 'cb1', busName: 'BUS-FIRST', fault_current_ka: 5 }),
      relayResult({ breakerId: 'cb2', busName: 'BUS-SECOND', fault_current_ka: 5 }), // 동일 고장전류
    ]
    const data = buildTCCData(results, nodes)
    expect(data.faultLines).toHaveLength(1)
    expect(data.faultLines[0]).toEqual({ current_a: 5000, label: 'BUS-FIRST' })
  })

  it('고장전류가 다르면 별도 라인으로 남는다', () => {
    const nodes = [
      bus('main', 'MAIN'),
      breaker('cb1', 'CB-1', { pickup_current_a: 200 }),
      breaker('cb2', 'CB-2', { pickup_current_a: 200 }),
    ]
    const results = [
      relayResult({ breakerId: 'cb1', busName: 'A', fault_current_ka: 5 }),
      relayResult({ breakerId: 'cb2', busName: 'B', fault_current_ka: 3 }),
    ]
    const data = buildTCCData(results, nodes)
    expect(data.faultLines).toHaveLength(2)
  })
})

describe('buildTCCData — 협조마진 주석(margins)', () => {
  const nodes = [bus('main', 'MAIN'), breaker('cb', 'CB-A', { pickup_current_a: 200 })]

  it('상류가 있고(margin 유한) 동작시간이 0보다 크면 margin을 기록한다', () => {
    const results = [relayResult({
      breakerId: 'cb', fault_current_ka: 5,
      relay_operating_time_s: 0.6, coordination_margin_s: 0.3, pass: true,
    })]
    const data = buildTCCData(results, nodes)
    expect(data.margins).toHaveLength(1)
    const m = data.margins[0]
    expect(m.current_a).toBe(5000)
    expect(m.time_low_s).toBe(0.6)
    expect(m.time_high_s).toBeCloseTo(0.9, 10)
    expect(m.margin_s).toBe(0.3)
    expect(m.pass).toBe(true)
  })

  it('상류가 없어 margin이 Infinity면 주석에서 제외한다', () => {
    const results = [relayResult({
      breakerId: 'cb', fault_current_ka: 5,
      relay_operating_time_s: 0.6, coordination_margin_s: Infinity, pass: true,
    })]
    const data = buildTCCData(results, nodes)
    expect(data.margins).toHaveLength(0)
  })

  it('순시트립(동작시간 0)은 주석에서 제외한다', () => {
    const results = [relayResult({
      breakerId: 'cb', fault_current_ka: 5,
      relay_operating_time_s: 0, coordination_margin_s: 0.3, pass: true,
    })]
    const data = buildTCCData(results, nodes)
    expect(data.margins).toHaveLength(0)
  })

  it('상단(time_high_s)이 y축 상한(100초)을 넘으면 주석에서 제외한다', () => {
    const results = [relayResult({
      breakerId: 'cb', fault_current_ka: 5,
      relay_operating_time_s: 60, coordination_margin_s: 50, pass: true,
    })]
    const data = buildTCCData(results, nodes)
    expect(data.margins).toHaveLength(0)
  })
})

describe('buildTCCData — 케이블 허용전류-시간 곡선(cableWithstands)', () => {
  const nodes = [bus('main', 'MAIN'), breaker('cb', 'CB-A', { pickup_current_a: 200 })]
  const results = [relayResult({ breakerId: 'cb', fault_current_ka: 5 })]  // xMin=100, xMax=100000 고정

  it('r_ohm_per_km으로부터 단면적(mm2)을 역산하고, t=(k·S/I)² 공식을 만족하는 점들을 만든다', () => {
    const edges = [cableEdge('e1', 'main', 'cb', { r_ohm_per_km: 0.2063 })]  // → mm2 = round(20.63/0.2063) = 100
    const data = buildTCCData(results, nodes, edges)
    expect(data.cableWithstands).toHaveLength(1)
    const w = data.cableWithstands[0]
    expect(w.mm2).toBe(100)
    expect(w.k).toBe(143)
    expect(w.points.length).toBeGreaterThan(1)
    for (const p of w.points) {
      const expectedT = Math.pow((143 * 100) / p.x, 2)
      expect(p.y).toBeCloseTo(expectedT, 6)
      expect(p.y).toBeGreaterThanOrEqual(0.01)
      expect(p.y).toBeLessThanOrEqual(100)
    }
  })

  it('운전 정지(in_service=false) 케이블은 제외한다', () => {
    const edges = [cableEdge('e1', 'main', 'cb', { r_ohm_per_km: 0.2063, in_service: false })]
    const data = buildTCCData(results, nodes, edges)
    expect(data.cableWithstands).toHaveLength(0)
  })

  it('저항이 0 이하인 케이블은 제외한다', () => {
    const edges = [cableEdge('e1', 'main', 'cb', { r_ohm_per_km: 0 })]
    const data = buildTCCData(results, nodes, edges)
    expect(data.cableWithstands).toHaveLength(0)
  })

  it('역산한 단면적이 비정상(0 이하 또는 1000mm² 초과)이면 제외한다', () => {
    const tooThin = cableEdge('e1', 'main', 'cb', { r_ohm_per_km: 0.001 })  // mm2 ≈ 20630 → 초과
    const tooThick = cableEdge('e2', 'main', 'cb', { r_ohm_per_km: 1000 }) // mm2 ≈ 0
    const data = buildTCCData(results, nodes, [tooThin, tooThick])
    expect(data.cableWithstands).toHaveLength(0)
  })
})

describe('buildTCCData — 변압기 관통고장 손상곡선(transformerDamages)', () => {
  const nodes5MVA = [
    bus('main', 'MAIN'), breaker('cb', 'CB-A', { pickup_current_a: 200 }),
    transformer('tr', { sn_mva: 10, vn_lv_kv: 6.6 }),
  ]
  const results = [relayResult({ breakerId: 'cb', fault_current_ka: 5 })]  // xMin=100, xMax=100000 고정

  it('5MVA 이상은 자주 발생(freq)·드묾(rare) 두 곡선 모두 I_pu 기반 공식을 만족한다', () => {
    const data = buildTCCData(results, nodes5MVA)
    expect(data.transformerDamages).toHaveLength(1)
    const d = data.transformerDamages[0]
    expect(d.sn_mva).toBe(10)
    expect(d.freqFaultPoints.length).toBeGreaterThan(1)
    expect(d.rareFaultPoints.length).toBeGreaterThan(1)

    const I_base_lv = (10 * 1000) / (Math.sqrt(3) * 6.6)
    for (const p of d.freqFaultPoints) {
      const I_pu = p.x / I_base_lv
      expect(p.y).toBeCloseTo(1250 / (I_pu * I_pu), 6)
    }
    for (const p of d.rareFaultPoints) {
      const I_pu = p.x / I_base_lv
      expect(p.y).toBeCloseTo(50 / (I_pu * I_pu), 6)
    }
  })

  it('5MVA 미만은 드묾(rare) 곡선이 자주(freq) 곡선과 같다(별도 하한이 없음)', () => {
    const smallNodes = [
      bus('main', 'MAIN'), breaker('cb', 'CB-A', { pickup_current_a: 200 }),
      transformer('tr', { sn_mva: 3, vn_lv_kv: 6.6 }),
    ]
    const data = buildTCCData(results, smallNodes)
    const d = data.transformerDamages[0]
    expect(d.rareFaultPoints).toEqual(d.freqFaultPoints)
  })

  it('운전 정지 변압기나 정격용량 0인 변압기는 제외한다', () => {
    const outOfService = transformer('tr1', { sn_mva: 10, vn_lv_kv: 6.6, in_service: false })
    const zeroCapacity = transformer('tr2', { sn_mva: 0, vn_lv_kv: 6.6 })
    const nodes = [bus('main', 'MAIN'), breaker('cb', 'CB-A', { pickup_current_a: 200 }), outOfService, zeroCapacity]
    const data = buildTCCData(results, nodes)
    expect(data.transformerDamages).toHaveLength(0)
  })
})
