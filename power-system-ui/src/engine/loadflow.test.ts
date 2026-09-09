/**
 * loadflow.ts / ybus.ts 2권선 변압기 탭(OLTC) 방향 회귀 테스트.
 *
 * Newton-Raphson 자체는 newtonRaphson.ts가 책임지므로 재검증하지 않는다.
 * 여기서는 ybus.ts가 세우는 오프노미널 탭 변압기 π-모델의 "방향"만 검증한다.
 *
 * 표준 오프노미널 변압기 모델(이상변압기 비율 a:1 + 직렬 임피던스를 직접 풀면):
 *   I_hv = (Ys/a²)·V_hv − (Ys/a)·V_lv
 *   I_lv = −(Ys/a)·V_hv + Ys·V_lv
 * 즉 tap측(HV) 자기 어드미턴스·상호항은 a로 "나눠야" 한다. 예전엔 곱해서
 * (Y_HH=Ys×a², Y_HL=-Ys×a) tap 방향이 정반대였다 — a=1+(tap_pos-tap_neutral)×
 * step/100이 커질(tap_pos↑) 때 LV 전압이 실제로는 낮아져야 하는데, 예전 코드는
 * 반대로 높아진다고 계산했다. pandapower로 동일한 회로를 직접 조류계산해
 * (services/solver.py 쪽 회귀 테스트) tap_pos를 올릴수록 LV 전압이 낮아지는
 * 것을 실측 확인했다 — 이 테스트는 그 방향을 프론트엔드 로컬 엔진에서도
 * 재현하는지 확인한다.
 */
import { describe, it, expect } from 'vitest'
import type { Node as RFNode, Edge as RFEdge } from 'reactflow'
import type { NodeData, EdgeData, Bus, Transformer, Load } from '../types'
import { defaultEquipment, defaultCable } from '../types'
import { runLocalLoadflow } from './loadflow'

function bus(id: string, name: string, opts: Partial<Bus> = {}): RFNode<NodeData> {
  return { id, type: 'bus', position: { x: 0, y: 0 }, data: { equipment: { ...(defaultEquipment('bus', id) as Bus), name, ...opts } } }
}
function transformer(id: string, opts: Partial<Transformer> = {}): RFNode<NodeData> {
  return { id, type: 'transformer', position: { x: 0, y: 0 }, data: { equipment: { ...(defaultEquipment('transformer', id) as Transformer), ...opts } } }
}
function load(id: string, opts: Partial<Load> = {}): RFNode<NodeData> {
  return { id, type: 'load', position: { x: 0, y: 0 }, data: { equipment: { ...(defaultEquipment('load', id) as Load), ...opts } } }
}
function edge(id: string, source: string, target: string): RFEdge<EdgeData> {
  return { id, source, target, type: 'cable', data: { cable: defaultCable(id) } }
}

// HV(Slack) — TR1(가변 tap) — LV — L1
function tappedTransformerNetwork(tap_pos: number) {
  const nodes = [
    bus('hv', 'HV', { busType: 'Slack', vn_kv: 22.9 }),
    transformer('tr1', {
      vn_hv_kv: 22.9, vn_lv_kv: 0.4, sn_mva: 1.0, vk_percent: 6, vkr_percent: 1,
      tap_pos, tap_neutral: 0, tap_min: -4, tap_max: 4, tap_step_percent: 2.5,
    }),
    bus('lv', 'LV', { vn_kv: 0.4 }),
    load('l1', { p_kw: 100, q_kvar: 30, vn_kv: 0.4 }),
  ]
  const edges = [
    edge('e1', 'hv', 'tr1'),
    edge('e2', 'tr1', 'lv'),
    edge('e3', 'lv', 'l1'),
  ]
  return { nodes, edges }
}

describe('runLocalLoadflow — 2권선 변압기 HV측 탭(OLTC) 방향', () => {
  it('회귀: 탭 위치를 올리면(tap_pos↑) LV 전압은 내려가야 한다 (반대 아님)', () => {
    const vAt = (tap_pos: number) => {
      const { nodes, edges } = tappedTransformerNetwork(tap_pos)
      const result = runLocalLoadflow(nodes, edges)
      expect(result.converged).toBe(true)
      return result.buses['lv'].vm_pu
    }

    const vMinus2 = vAt(-2)
    const vZero   = vAt(0)
    const vPlus2  = vAt(2)

    expect(vMinus2).toBeGreaterThan(vZero)
    expect(vZero).toBeGreaterThan(vPlus2)
  })
})
