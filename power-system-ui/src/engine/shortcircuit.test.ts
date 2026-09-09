/**
 * shortcircuit.ts 2권선 변압기 HV측 탭(OLTC) 방향 회귀 테스트.
 *
 * loadflow.test.ts와 동일한 근거(ybus.ts 참조 — 표준 오프노미널 변압기
 * π-모델은 tap측(HV) 자기 어드미턴스·상호항을 a로 "나눠야" 한다)가
 * 단락계산 전용 Y-행렬(buildY, shortcircuit.ts)에도 그대로 적용된다.
 * 예전엔 곱셈이라 방향이 반대였다.
 */
import { describe, it, expect } from 'vitest'
import type { Node as RFNode, Edge as RFEdge } from 'reactflow'
import type { NodeData, EdgeData, Bus, Transformer } from '../types'
import { defaultEquipment, defaultCable } from '../types'
import { runLocalShortcircuit } from './shortcircuit'

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

describe('runLocalShortcircuit — 2권선 변압기 HV측 탭(OLTC) 방향', () => {
  it('회귀: 탭 위치를 올리면(tap_pos↑) LV측에서 바라본 배후 계통 임피던스가 작아져 단락전류는 늘어야 한다', () => {
    // 독립 유도: 2모선(HV-그리드, LV) 등가회로에서 Y11=Yg+Ys/a², Y12=Y21=-Ys/a,
    // Y22=Ys일 때 det(Y)=Yg·Ys(항상 a와 무관하게 상쇄됨)이므로
    // Zth_LV = Y11/det(Y) = Zs + Zg/a². a(=tap 배수)가 커질수록 Zg/a²가
    // 작아져 Zth_LV가 작아지고, 따라서 LV측 단락전류는 "커져야" 한다 —
    // 예전(곱셈) 모델에서는 Zth_LV = Zs + Zg·a²로 반대 방향이었다.
    const ikssAt = (tap_pos: number) => {
      const { nodes, edges } = tappedTransformerNetwork(tap_pos)
      const result = runLocalShortcircuit(nodes, edges)
      return result.buses['lv'].ikss_ka
    }

    const iMinus2 = ikssAt(-2)
    const iZero   = ikssAt(0)
    const iPlus2  = ikssAt(2)

    expect(iPlus2).toBeGreaterThan(iZero)
    expect(iZero).toBeGreaterThan(iMinus2)
  })
})
