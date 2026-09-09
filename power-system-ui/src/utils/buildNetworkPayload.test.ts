/**
 * buildNetworkPayload.ts 단위 테스트.
 *
 * 이 함수가 만드는 JSON은 실제로 백엔드(power-system-api)의 REST API
 * (/loadflow/run, /shortcircuit/run)로 그대로 전송된다. 그런데 백엔드
 * Pydantic 모델(models/network.py)은 각 항목을 `bus_id`/`from_bus_id`/
 * `hv_bus_id`(정수, 필수)와 `p_mw`/`q_mvar`(MW/MVAr 단위)로 요구하는데,
 * 이 파일은 예전에 `bus`/`from_bus`/`hv_bus`와 `p_kw`/`q_kvar`(kW/kvar)를
 * 보내고 있었다. FastAPI는 요청 바디를 그 Pydantic 모델로 곧바로
 * 검증하므로, 필수 필드 이름이 다르면 매번 422 Unprocessable Entity로
 * 실패한다 — 즉 "API(서버)" 백엔드로 조류/단락계산을 실행하는 기능은
 * 실제로 한 번도 성공한 적이 없었다(Toolbar의 LOCAL/API 토글 중 API
 * 쪽). 여기서는 각 배열 항목의 필드 이름과 단위가 백엔드 계약과
 * 정확히 일치하는지 검증한다.
 */
import { describe, it, expect } from 'vitest'
import type { Node as RFNode, Edge as RFEdge } from 'reactflow'
import type { NodeData, EdgeData, Bus, Load, Motor, Generator, Transformer } from '../types'
import { defaultEquipment, defaultCable } from '../types'
import { buildNetworkPayload } from './buildNetworkPayload'

function node<T>(id: string, type: string, patch: Partial<T> = {}): RFNode<NodeData> {
  return {
    id, type, position: { x: 0, y: 0 },
    data: { equipment: { ...(defaultEquipment(type as any, id) as any), ...patch } },
  }
}
function edge(id: string, source: string, target: string): RFEdge<EdgeData> {
  return { id, source, target, type: 'cable', data: { cable: defaultCable(id) } }
}

describe('buildNetworkPayload — 백엔드 NetworkInput 계약과의 필드명/단위 일치', () => {
  const nodes: RFNode<NodeData>[] = [
    node<Bus>('src', 'bus', { vn_kv: 22.9, busType: 'Slack' } as Partial<Bus>),
    node<Bus>('hv', 'bus', { vn_kv: 22.9 } as Partial<Bus>),
    node<Bus>('lv', 'bus', { vn_kv: 0.4 } as Partial<Bus>),
    node<Transformer>('tr1', 'transformer', { vn_hv_kv: 22.9, vn_lv_kv: 0.4 } as Partial<Transformer>),
    node<Load>('ld1', 'load', { p_kw: 120, q_kvar: 60 } as Partial<Load>),
    node<Motor>('mo1', 'motor', {
      rated_kw: 500, power_factor: 0.85, efficiency: 92, vn_kv: 0.4, starting_current_multiple: 6.5,
    } as Partial<Motor>),
    node<Generator>('gen1', 'generator', { p_mw: 5 } as Partial<Generator>),
  ]
  const edges: RFEdge<EdgeData>[] = [
    edge('e-src-hv', 'src', 'hv'),
    edge('e-tr1-hv', 'hv', 'tr1'),
    edge('e-tr1-lv', 'tr1', 'lv'),
    edge('e-lv-ld1', 'lv', 'ld1'),
    edge('e-lv-mo1', 'lv', 'mo1'),
    edge('e-hv-gen1', 'hv', 'gen1'),
  ]

  const { payload } = buildNetworkPayload(nodes, edges)
  const p = payload as any

  it('bus는 정수 id 필드를 갖는다 (백엔드 Bus.id는 필수)', () => {
    expect(p.buses.length).toBe(3)
    for (const b of p.buses) expect(typeof b.id).toBe('number')
  })

  it('external_grids는 bus_id를 쓴다 (bus 아님)', () => {
    expect(p.external_grids).toHaveLength(1)
    expect(p.external_grids[0].bus).toBeUndefined()
    expect(typeof p.external_grids[0].bus_id).toBe('number')
  })

  it('회귀: load는 bus_id + p_mw/q_mvar(MW/MVAr)를 쓴다 — 예전엔 bus + p_kw/q_kvar였다', () => {
    const load = p.loads[0]
    expect(load.bus).toBeUndefined()
    expect(load.p_kw).toBeUndefined()
    expect(load.q_kvar).toBeUndefined()
    expect(typeof load.bus_id).toBe('number')
    expect(load.p_mw).toBeCloseTo(0.12, 6)   // 120kW → 0.12MW
    expect(load.q_mvar).toBeCloseTo(0.06, 6) // 60kvar → 0.06MVAr
  })

  it('회귀: motor는 백엔드 Motor 모델 필드명(pn_mech_mw/cos_phi/efficiency_percent/lrc_pu)을 쓴다', () => {
    const motor = p.motors[0]
    expect(motor.bus).toBeUndefined()
    expect(typeof motor.bus_id).toBe('number')
    expect(motor.pn_mech_mw).toBeCloseTo(0.5, 6)   // 500kW → 0.5MW (기계 축출력, 전기입력 아님)
    expect(motor.cos_phi).toBeCloseTo(0.85, 6)
    expect(motor.efficiency_percent).toBeCloseTo(92, 6)
    expect(motor.lrc_pu).toBeCloseTo(6.5, 6)
  })

  it('회귀: generator는 bus_id를 쓴다 (bus 아님)', () => {
    expect(p.generators[0].bus).toBeUndefined()
    expect(typeof p.generators[0].bus_id).toBe('number')
  })

  it('회귀: line은 from_bus_id/to_bus_id를 쓴다 (from_bus/to_bus 아님)', () => {
    expect(p.lines).toHaveLength(1)   // src—hv만 Bus-to-Bus 직결 (나머지는 Transformer/Load/Motor/Gen 경유)
    const line = p.lines[0]
    expect(line.from_bus).toBeUndefined()
    expect(line.to_bus).toBeUndefined()
    expect(typeof line.from_bus_id).toBe('number')
    expect(typeof line.to_bus_id).toBe('number')
  })

  it('회귀: transformer는 hv_bus_id/lv_bus_id를 쓴다 (hv_bus/lv_bus 아님)', () => {
    const tr = p.transformers[0]
    expect(tr.hv_bus).toBeUndefined()
    expect(tr.lv_bus).toBeUndefined()
    expect(typeof tr.hv_bus_id).toBe('number')
    expect(typeof tr.lv_bus_id).toBe('number')
  })
})
