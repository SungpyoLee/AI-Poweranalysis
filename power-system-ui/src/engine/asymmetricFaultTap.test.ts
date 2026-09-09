/**
 * asymmetricFault.ts(buildY1) 2권선 변압기 HV측 탭(OLTC) 방향 회귀 테스트.
 * shortcircuit.test.ts와 동일한 유도(Zth_LV = Zs + Zg/a², a↑ ⇒ Zth_LV↓
 * ⇒ 단락전류↑)가 buildY1(양상 어드미턴스, 3상 단락 ik3_ka의 근거)에도
 * 그대로 적용된다. 예전엔 곱셈이라 방향이 반대였다.
 */
import { describe, it, expect } from 'vitest'
import type { Node as RFNode, Edge as RFEdge } from 'reactflow'
import type { NodeData, EdgeData, Bus, Transformer } from '../types'
import { defaultEquipment, defaultCable } from '../types'
import { runAsymmetricFault } from './asymmetricFault'

function bus(id: string, name: string, opts: Partial<Bus> = {}): RFNode<NodeData> {
  return { id, type: 'bus', position: { x: 0, y: 0 }, data: { equipment: { ...(defaultEquipment('bus', id) as Bus), name, ...opts } } }
}
function transformer(id: string, opts: Partial<Transformer> = {}): RFNode<NodeData> {
  return { id, type: 'transformer', position: { x: 0, y: 0 }, data: { equipment: { ...(defaultEquipment('transformer', id) as Transformer), ...opts } } }
}
function edge(id: string, source: string, target: string): RFEdge<EdgeData> {
  return { id, source, target, type: 'cable', data: { cable: defaultCable(id) } }
}

function tappedTransformerNetwork(tap_pos: number) {
  const nodes = [
    bus('hv', 'HV', { busType: 'Slack', vn_kv: 22.9, sc_mva: 500, xr_ratio: 10 }),
    transformer('tr1', {
      vn_hv_kv: 22.9, vn_lv_kv: 0.4, sn_mva: 1.0, vk_percent: 6, vkr_percent: 1,
      tap_pos, tap_neutral: 0, tap_min: -4, tap_max: 4, tap_step_percent: 2.5,
    }),
    bus('lv', 'LV', { vn_kv: 0.4 }),
  ]
  const edges = [edge('e1', 'hv', 'tr1'), edge('e2', 'tr1', 'lv')]
  return { nodes, edges }
}

describe('runAsymmetricFault — 2권선 변압기 HV측 탭(OLTC) 방향', () => {
  it('회귀: 탭 위치를 올리면(tap_pos↑) LV측 3상 단락전류(ik3_ka)는 늘어야 한다', () => {
    const ik3At = (tap_pos: number) => {
      const { nodes, edges } = tappedTransformerNetwork(tap_pos)
      const result = runAsymmetricFault(nodes, edges)
      return result.buses['lv'].ik3_ka
    }

    const iMinus2 = ik3At(-2)
    const iZero   = ik3At(0)
    const iPlus2  = ik3At(2)

    expect(iPlus2).toBeGreaterThan(iZero)
    expect(iZero).toBeGreaterThan(iMinus2)
  })
})
