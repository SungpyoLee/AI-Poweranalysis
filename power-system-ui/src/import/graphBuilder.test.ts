/**
 * graphBuilder 단위 테스트.
 * buildGraph는 HTMLCanvasElement를 인자로 받지만 실제로 쓰는 표면은
 * width/height/getContext('2d').getImageData(...)뿐이라, jsdom 없이도
 * 그 세 가지만 흉내낸 가짜 캔버스 객체로 충분히 테스트할 수 있다.
 */
import { describe, it, expect } from 'vitest'
import { buildGraph, mergeResults, type BuildResult } from './graphBuilder'
import type { DetectedSymbol } from './symbolDetector'
import { defaultEquipment, defaultCable } from '../types'

function sym(
  id: string, type: DetectedSymbol['type'],
  x: number, y: number, w = 40, h = 30,
): DetectedSymbol {
  return { id, type, label: id, bbox: { x, y, w, h }, confidence: 0.9, params: {}, words: [] }
}

/** getContext를 호출하지 않아도 되는(gap<4) 배치용 최소 캔버스. */
function bareCanvas(width: number, height: number) {
  return { width, height, getContext: () => { throw new Error('getContext should not be called') } } as unknown as HTMLCanvasElement
}

/** 지정한 밝기(0=암흑, 255=순백)로 모든 픽셀을 채우는 가짜 캔버스. */
function fakeCanvas(width: number, height: number, brightness: number) {
  const ctx = {
    getImageData: (_x: number, _y: number, w: number, h: number) => {
      const data = new Uint8ClampedArray(w * h * 4)
      for (let i = 0; i < data.length; i += 4) {
        data[i] = data[i + 1] = data[i + 2] = brightness
        data[i + 3] = 255
      }
      return { data } as unknown as ImageData
    },
  }
  return { width, height, getContext: () => ctx } as unknown as HTMLCanvasElement
}

describe('buildGraph', () => {
  it('심볼이 없으면 빈 결과를 반환한다', () => {
    const result = buildGraph(bareCanvas(1000, 1000), [])
    expect(result.nodes).toHaveLength(0)
    expect(result.edges).toHaveLength(0)
  })

  it('같은 열(X 근접)의 심볼을 위→아래 순서로 인접 연결한다 (간격<4px는 픽셀 검사 없이 연결)', () => {
    const symbols = [
      sym('bus-1', 'bus', 100, 50, 200, 10),
      sym('tr-1', 'transformer', 150, 62, 40, 30),    // bus 바로 아래, gap = 62-60 = 2px
      sym('motor-1', 'motor', 150, 96, 40, 30),        // tr 바로 아래, gap = 96-92 = 4px → 픽셀검사 필요하지만 fakeCanvas 없이 bareCanvas 사용하면 예외
    ]
    // gap<4로 유지되도록 세 번째 심볼도 인접시킴
    symbols[2].bbox.y = 95   // gap = 95-92 = 3px

    const result = buildGraph(bareCanvas(1000, 1000), symbols)

    expect(result.nodes).toHaveLength(3)
    expect(result.edges).toHaveLength(2)
    const pairs = result.edges.map(e => `${e.source}->${e.target}`).sort()
    expect(pairs).toEqual(['bus-1->tr-1', 'tr-1->motor-1'])
  })

  it('멀리 떨어진(다른 열) 심볼끼리는 연결하지 않는다', () => {
    const symbols = [
      sym('bus-1', 'bus', 50, 50, 40, 30),
      sym('bus-2', 'bus', 900, 50, 40, 30),   // X가 이미지 폭의 7% 이상 떨어짐
    ]
    const result = buildGraph(bareCanvas(1000, 1000), symbols)
    expect(result.edges).toHaveLength(0)
  })

  it('간격이 4px 이상이면 픽셀 라인 검사를 거친다 — 실선이 있으면 연결', () => {
    const symbols = [
      sym('a', 'bus', 100, 50, 40, 30),      // bottom = 80
      sym('b', 'motor', 100, 100, 40, 30),   // top = 100, gap = 20px
    ]
    const result = buildGraph(fakeCanvas(1000, 1000, 0), symbols)   // 전부 암흑 = 실선 있음
    expect(result.edges).toHaveLength(1)
  })

  it('간격이 4px 이상인데 실선이 없으면 연결하지 않는다', () => {
    const symbols = [
      sym('a', 'bus', 100, 50, 40, 30),
      sym('b', 'motor', 100, 100, 40, 30),
    ]
    const result = buildGraph(fakeCanvas(1000, 1000, 255), symbols)   // 전부 순백 = 실선 없음
    expect(result.edges).toHaveLength(0)
  })

  it('이미지 좌표를 1400×900 캔버스로 스케일링하고 20px 그리드에 스냅한다', () => {
    const symbols = [sym('a', 'bus', 500, 500, 100, 100)]   // 원본 1000×1000 이미지, 중심(550,550)
    const result = buildGraph(bareCanvas(1000, 1000), symbols)
    // 중심(550,550) → 1400×900 스케일 → (770, 495) → 20px 그리드 스냅 → (780, 500)
    expect(result.nodes[0].position).toEqual({ x: 780, y: 500 })
  })

  it('감지된 라벨을 노드 이름으로 사용한다', () => {
    const symbols = [{ ...sym('m1', 'motor', 0, 0), label: 'P-101A 75kW' }]
    const result = buildGraph(bareCanvas(1000, 1000), symbols)
    expect(result.nodes[0].data.equipment.name).toBe('P-101A 75kW')
  })
})

describe('mergeResults', () => {
  function makeResult(ids: string[], ys: number[]): BuildResult {
    return {
      nodes: ids.map((id, i) => ({
        id, type: 'bus', position: { x: 0, y: ys[i] },
        data: { equipment: defaultEquipment('bus', id) },
      })),
      edges: ids.slice(1).map((id, i) => ({
        id: `e-${i}`, source: ids[i], target: id, type: 'cable',
        data: { cable: defaultCable(`e-${i}`) },
      })),
    }
  }

  it('두 번째 결과의 노드를 첫 번째 아래로 이동시키고 id를 접두사로 구분한다', () => {
    const a = makeResult(['a1', 'a2'], [0, 100])
    const b = makeResult(['b1', 'b2'], [0, 50])

    const merged = mergeResults(a, b, 120)

    expect(merged.nodes).toHaveLength(4)
    const shifted = merged.nodes.filter(n => n.id.startsWith('p2-'))
    expect(shifted).toHaveLength(2)
    // a의 최대 y=100, b의 최소 y=0 → shift = 100-0+120 = 220
    expect(shifted.find(n => n.id === 'p2-b1')!.position.y).toBe(220)
    expect(shifted.find(n => n.id === 'p2-b2')!.position.y).toBe(270)
  })

  it('두 번째 결과의 엣지 source/target도 새 id로 갱신한다', () => {
    const a = makeResult(['a1'], [0])
    const b = makeResult(['b1', 'b2'], [0, 50])

    const merged = mergeResults(a, b)

    const bEdge = merged.edges.find(e => e.id === 'p2-e-0')!
    expect(bEdge.source).toBe('p2-b1')
    expect(bEdge.target).toBe('p2-b2')
  })
})
