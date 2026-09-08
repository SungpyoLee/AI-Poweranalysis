/**
 * cableSizing.ts 단위 테스트.
 *
 * IEC 60287/60364 공식들은 표준식이므로 재도출하지 않고, 기대값은 구현과
 * 별개로 손 계산/독립 스크립트로 검증했다. 온도 보정계수(tempCorrectionFactor)는
 * PropertyPanel의 케이블 속성 패널이 같은 물리량을 별도로(미리보기용) 계산하고
 * 있어서, 두 계산이 같은 입력에서 일치하는지도 함께 확인한다.
 */
import { describe, it, expect } from 'vitest'
import {
  tempCorrectionFactor, cableDeratingFactor, computeVdrop, scWithstand, estimateMM2,
} from './cableSizing'
import { defaultCable } from '../types'

describe('tempCorrectionFactor', () => {
  it('정상 범위(주위온도 < 케이블 정격온도)에서는 표준식대로 계산한다', () => {
    // 독립 계산: √((70-40)/(70-30)) = √0.75 ≈ 0.86603
    expect(tempCorrectionFactor(40, 70)).toBeCloseTo(0.8660254037844386, 10)
  })

  it('회귀: 주위온도가 케이블 정격(최대) 온도 이상이면 보정계수는 0이어야 한다(1.0이 아니라)', () => {
    // 예전 버그: Tmax <= Ta일 때 "sqrt of negative 방지"를 이유로 1.0(=보정 없음,
    // 즉 "정격전류 그대로 안전")을 반환했다. 하지만 물리적으로 주위온도가 케이블이
    // 버틸 수 있는 최대 온도 이상이면 전류를 전혀 흘릴 수 없어야 하므로(=0), 이
    // 결과는 정반대로 위험한 상태를 "이상 없음"으로 보고하는 버그였다.
    expect(tempCorrectionFactor(80, 70)).toBe(0)   // 주위온도 80°C > PVC 정격 70°C
    expect(tempCorrectionFactor(70, 70)).toBe(0)   // 경계값(같음)도 0이어야 함
  })

  it('회귀: 케이블 정격온도가 기준 주위온도(30°C) 이하인 기형적 입력도 0을 반환한다(나눗셈 분모 0/음수 방지)', () => {
    expect(tempCorrectionFactor(20, 30)).toBe(0)
    expect(tempCorrectionFactor(20, 25)).toBe(0)
  })

  it('PropertyPanel의 케이블 속성 미리보기가 계산하는 것과 동일한 값을 낸다', () => {
    // PropertyPanel.tsx의 인라인 미리보기 계산: Math.sqrt(Math.max((Tmax-Ta)/(Tmax-30), 0))
    const previewWidget = (Ta: number, Tmax: number) =>
      Math.sqrt(Math.max((Tmax - Ta) / (Tmax - 30), 0))

    for (const [Ta, Tmax] of [[40, 70], [80, 70], [25, 90], [90, 90], [-10, 70]] as const) {
      expect(tempCorrectionFactor(Ta, Tmax)).toBeCloseTo(previewWidget(Ta, Tmax), 10)
    }
  })
})

describe('cableDeratingFactor', () => {
  it('온도·포설방법·그룹계수를 곱한 합성 보정계수를 낸다', () => {
    const cable = { ...defaultCable('c1'), ambient_temp_c: 40, ref_temp_c: 70, installation_method: 'TRAY_TOUCHING' as const, grouping_factor: 0.8 }
    // 독립 계산: Ct=√((70-40)/(70-30))≈0.86603, Cm(TRAY_TOUCHING)=0.80, Cg=0.8
    const expected = 0.8660254037844386 * 0.80 * 0.8
    expect(cableDeratingFactor(cable)).toBeCloseTo(expected, 10)
  })

  it('위험한 주위온도 조건에서는 합성 보정계수도 0이 되어 허용전류가 0이 된다', () => {
    const cable = { ...defaultCable('c1'), ambient_temp_c: 85, ref_temp_c: 70 }
    expect(cableDeratingFactor(cable)).toBe(0)
  })
})

describe('computeVdrop', () => {
  it('IEC 3상 전압강하 공식대로 계산한다', () => {
    // 독립 계산: √3·100A·0.5km·(0.164·0.9+0.1·√(1-0.9²))·100/(0.4kV·1000) ≈ 4.13936%
    expect(computeVdrop(100, 0.5, 0.164, 0.1, 0.4, 0.9)).toBeCloseTo(4.139363044373423, 9)
  })

  it('길이가 0 이하이거나 전압이 0 이하이면 0을 반환한다', () => {
    expect(computeVdrop(100, 0, 0.164, 0.1, 0.4)).toBe(0)
    expect(computeVdrop(100, 0.5, 0.164, 0.1, 0)).toBe(0)
  })
})

describe('scWithstand', () => {
  it('IEC 60364-5-54 단시간 허용전류 공식(I=k·S/√t)대로 kA 단위로 계산한다', () => {
    // 독립 계산: 143·95/(√0.5·1000) ≈ 19.21209 kA
    expect(scWithstand(95, 143, 0.5)).toBeCloseTo(19.212091244838497, 9)
  })

  it('시간이나 단면적이 0 이하이면 0을 반환한다', () => {
    expect(scWithstand(95, 143, 0)).toBe(0)
    expect(scWithstand(0, 143, 0.5)).toBe(0)
  })
})

describe('estimateMM2', () => {
  it('저항으로부터 역산한 값에 가장 가까운 표준 단면적을 고른다', () => {
    // 독립 계산: 20.63/0.164 ≈ 125.79 → 120(차이 5.79) vs 150(차이 24.2) 중 120이 더 가까움
    expect(estimateMM2(0.164)).toBe(120)
  })

  it('저항이 0 이하이면 0을 반환한다', () => {
    expect(estimateMM2(0)).toBe(0)
    expect(estimateMM2(-1)).toBe(0)
  })
})
