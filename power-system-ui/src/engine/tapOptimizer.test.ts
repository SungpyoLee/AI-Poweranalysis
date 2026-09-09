/**
 * tapOptimizer.ts 단위 테스트.
 *
 * ybus.ts(및 loadflow.ts)가 실제로 세우는 물리적 관계 — HV측 OLTC에서
 * tap_pos를 올리면 LV 전압은 내려간다(loadflow.test.ts 참조, pandapower로도
 * 실측 확인) — 와 이 파일의 "탭을 얼마나 조정해야 하는가" 추천 로직이
 * 서로 반대 방향을 가리키면 안 된다.
 */
import { describe, it, expect } from 'vitest'
import type { Node as RFNode, Edge as RFEdge } from 'reactflow'
import type { NodeData, EdgeData, Bus, Transformer, LoadflowResults } from '../types'
import { defaultEquipment, defaultCable } from '../types'
import { optimizeTaps } from './tapOptimizer'

function bus(id: string, name: string, opts: Partial<Bus> = {}): RFNode<NodeData> {
  return { id, type: 'bus', position: { x: 0, y: 0 }, data: { equipment: { ...(defaultEquipment('bus', id) as Bus), name, ...opts } } }
}
function transformer(id: string, opts: Partial<Transformer> = {}): RFNode<NodeData> {
  return { id, type: 'transformer', position: { x: 0, y: 0 }, data: { equipment: { ...(defaultEquipment('transformer', id) as Transformer), ...opts } } }
}
function edge(id: string, source: string, target: string): RFEdge<EdgeData> {
  return { id, source, target, type: 'cable', data: { cable: defaultCable(id) } }
}

function network() {
  const nodes = [
    bus('hv', 'HV', { busType: 'Slack', vn_kv: 22.9 }),
    transformer('tr1', {
      name: 'TR1', vn_hv_kv: 22.9, vn_lv_kv: 0.4, sn_mva: 1.0, vk_percent: 6, vkr_percent: 1,
      tap_pos: 0, tap_neutral: 0, tap_min: -4, tap_max: 4, tap_step_percent: 2.5,
    }),
    bus('lv', 'LV', { vn_kv: 0.4 }),
  ]
  const edges = [edge('e1', 'hv', 'tr1'), edge('e2', 'tr1', 'lv')]
  return { nodes, edges }
}

function lf(vm_pu: number): LoadflowResults {
  return {
    converged: true,
    buses: { lv: { nodeId: 'lv', vm_pu, va_degree: 0, p_mw: -0.1, q_mvar: -0.03 } },
    lines: {}, generators: {}, motors: {}, transformers: {},
  } as unknown as LoadflowResults
}

describe('optimizeTaps — HV측 OLTC 탭 추천 방향', () => {
  it('회귀: LV 전압이 낮으면 탭을 내리라고 추천해야 한다 (HV측 OLTC: 탭↓ = V_lv↑)', () => {
    // 예전 버그: tapDelta = round(-delta/step)라서, 전압이 낮을 때(delta<0)
    // 탭을 "올리라"고 추천했다 — 그런데 ybus.ts의 실제 물리 모델(및 pandapower
    // 실측)로는 탭을 올리면 LV 전압이 더 낮아지므로, 문제를 고치기는커녕
    // 악화시키는 정반대 방향의 추천이었다.
    const { nodes, edges } = network()
    const result = optimizeTaps(nodes, edges, lf(0.94))   // LV 전압 낮음
    const rec = result.recommendations[0]

    expect(rec.changed).toBe(true)
    expect(rec.recommendedTap).toBeLessThan(rec.currentTap)   // 탭을 내려야 함
    expect(rec.vLvAfter_pu).toBeGreaterThan(rec.vLv_pu)       // 조정 후 전압은 올라가야 함
  })

  it('회귀: LV 전압이 높으면 탭을 올리라고 추천해야 한다', () => {
    const { nodes, edges } = network()
    const result = optimizeTaps(nodes, edges, lf(1.06))   // LV 전압 높음
    const rec = result.recommendations[0]

    expect(rec.changed).toBe(true)
    expect(rec.recommendedTap).toBeGreaterThan(rec.currentTap)   // 탭을 올려야 함
    expect(rec.vLvAfter_pu).toBeLessThan(rec.vLv_pu)             // 조정 후 전압은 내려가야 함
  })
})
