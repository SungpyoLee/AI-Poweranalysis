/**
 * ImportReviewDialog.tsx의 patchNodeType() 단위 테스트.
 *
 * SLD 이미지 가져오기 검토 화면에서 사용자가 자동 감지된 장비의 타입을
 * 고칠 수 있는데(예: 잘못 인식된 "전동기"를 "발전기"로 수정), 그 결과
 * 만들어지는 노드가 실제로 새 타입에 맞는 equipment 모양을 갖는지 검증한다.
 */
import { describe, it, expect } from 'vitest'
import type { Node as RFNode } from 'reactflow'
import type { NodeData, Motor, Generator } from '../types'
import { defaultEquipment } from '../types'
import { patchNodeType } from './ImportReviewDialog'
import type { DetectedSymbol } from '../import/symbolDetector'

function motorNode(id: string): RFNode<NodeData> {
  return {
    id, type: 'motor', position: { x: 0, y: 0 },
    data: { equipment: { ...(defaultEquipment('motor', id) as Motor), rated_kw: 500 } },
  }
}

describe('patchNodeType', () => {
  it('타입이 그대로면 노드를 바꾸지 않는다', () => {
    const n = motorNode('m1')
    const result = patchNodeType(n, 'motor', undefined)
    expect(result).toBe(n)
  })

  it('회귀: 타입을 motor→generator로 바꾸면 equipment도 Generator 모양으로 다시 만들어야 한다', () => {
    // 예전 버그: node.type만 바꾸고 data.equipment는 그대로 둬서, 엔진이
    // `as Generator`로 캐스팅할 때 실제로는 Motor 필드(rated_kw 등)만 있는
    // 객체를 받았다 — Generator가 실제로 쓰는 p_mw/vm_pu는 undefined였고,
    // 그 undefined가 조류계산 전체에 NaN으로 조용히 전파됐다.
    const n = motorNode('m1')
    const result = patchNodeType(n, 'generator', undefined)

    expect(result.type).toBe('generator')
    const eq = result.data.equipment as Generator
    expect(eq.equipmentType).toBe('generator')
    expect(typeof eq.p_mw).toBe('number')
    expect(Number.isNaN(eq.p_mw)).toBe(false)
    // 예전 Motor 전용 필드가 새 equipment에 남아있지 않아야 한다
    expect((eq as unknown as Motor).rated_kw).toBeUndefined()
  })

  it('타입 변경 시 감지된 라벨과 자동추출 파라미터를 새 equipment에 반영한다', () => {
    const n = motorNode('m1')
    const sym: DetectedSymbol = {
      id: 'm1', type: 'generator', label: 'DG-1 1500kW',
      bbox: { x: 0, y: 0, w: 10, h: 10 }, confidence: 0.9,
      params: { p_mw: 1.5 }, words: [],
    }
    const result = patchNodeType(n, 'generator', sym)
    const eq = result.data.equipment as Generator
    expect(eq.name).toBe('DG-1 1500kW')
    expect(eq.p_mw).toBe(1.5)
  })
})
