/**
 * classifyText 단위 테스트 — OCR로 읽은 라벨 텍스트를 어떤 장비 유형으로
 * 분류할지 결정하는 패턴 매칭 로직. 유형별 패턴 목록 중 가장 앞쪽(=신뢰도
 * 높은) 패턴에 매치될수록 점수가 높고, 모든 유형을 통틀어 최고 점수를
 * 채택하므로 dict 순서 자체는 결과에 영향을 주지 않아야 한다.
 */
import { describe, it, expect } from 'vitest'
import { classifyText } from './symbolDetector'

describe('classifyText', () => {
  it('표준 태그 접두사로 장비 유형을 식별한다', () => {
    expect(classifyText('TR-1').type).toBe('transformer')
    expect(classifyText('CB-101').type).toBe('breaker')
    expect(classifyText('M-1').type).toBe('motor')
    expect(classifyText('G-1').type).toBe('generator')
    expect(classifyText('BUS-1').type).toBe('bus')
    expect(classifyText('MCC-1').type).toBe('load')
    expect(classifyText('CAP-1').type).toBe('capacitor')
    expect(classifyText('REACT-1').type).toBe('reactor')
  })

  it('한글 라벨도 인식한다', () => {
    expect(classifyText('변압기').type).toBe('transformer')
    expect(classifyText('차단기').type).toBe('breaker')
    expect(classifyText('전동기').type).toBe('motor')
    expect(classifyText('발전기').type).toBe('generator')
  })

  it('전압 표기 패턴으로 모선(BUS)을 인식한다', () => {
    expect(classifyText('22.9kV').type).toBe('bus')
    expect(classifyText('6.6kV BUS').type).toBe('bus')
  })

  it('변압기 용량(MVA) 표기로 변압기를 인식한다', () => {
    expect(classifyText('30 MVA').type).toBe('transformer')
  })

  it('설비 키워드(PUMP/FAN 등)로 전동기를 인식한다', () => {
    expect(classifyText('PUMP P-101').type).toBe('motor')
    expect(classifyText('COOLING FAN').type).toBe('motor')
  })

  it('아무 패턴에도 매치되지 않으면 type이 null이다', () => {
    const { type, score } = classifyText('아무 의미 없는 텍스트 123')
    expect(type).toBeNull()
    expect(score).toBe(0)
  })

  it('가장 구체적인(목록 앞쪽) 패턴일수록 점수가 더 높다', () => {
    // transformer 패턴 목록: index0 '^TR[-_]?\\d+' (가장 구체적) > index3 '변압기' 키워드
    const specific = classifyText('TR-1')
    const generic  = classifyText('이것은 변압기입니다')
    expect(specific.type).toBe('transformer')
    expect(generic.type).toBe('transformer')
    expect(specific.score).toBeGreaterThan(generic.score)
  })

  it('점수는 항상 0~1 사이로 클램프된다', () => {
    const { score } = classifyText('TR-1')
    expect(score).toBeGreaterThan(0)
    expect(score).toBeLessThanOrEqual(1)
  })
})
