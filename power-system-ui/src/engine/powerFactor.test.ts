/**
 * powerFactor.ts 단위 테스트.
 *
 * 콘덴서 용량 공식(Qc = P·(tanφ_before − tanφ_target))은 표준식이라 재도출
 * 하지 않는다. 대신 이 엔진이 직접 판단하는 부분 — 진상(leading)/지상(lagging)
 * 구분, 보상이 필요 없을 때 최소규격을 억지로 추천하지 않는지 — 를 검증한다.
 */
import { describe, it, expect } from 'vitest'
import type { LoadflowResults } from '../types'
import { computePowerFactorCorrection } from './powerFactor'

function lf(p_mw: number, q_mvar: number): LoadflowResults {
  return {
    converged: true, buses: { b1: { nodeId: 'b1', vm_pu: 1, va_degree: 0, p_mw, q_mvar } },
    lines: {}, generators: {}, motors: {}, transformers: {},
  } as unknown as LoadflowResults
}
const nameMap = new Map([['b1', { name: 'B1', vn_kv: 22.9 }]])

describe('computePowerFactorCorrection', () => {
  it('지상(lagging, Q>0)이고 목표 역률 미달이면 콘덴서 용량을 정상적으로 추천한다', () => {
    const result = computePowerFactorCorrection(lf(1.0, 0.6), nameMap, 0.95)
    const b = result.buses[0]
    // 독립 계산: pf=1/√1.36≈0.8575, tan(acos(0.8575))=0.6, tan(acos(0.95))≈0.3286
    // Qc_req = 1.0*(0.6-0.3286) ≈ 0.2714 MVAR
    expect(b.qc_required).toBeCloseTo(0.2714, 3)
    expect(b.qc_standard).toBeGreaterThan(0)
  })

  it('회귀: 이미 진상(leading, Q<0)인 모선에는 콘덴서를 더 추천하지 않는다', () => {
    // 예전 버그: pf_current를 Q의 부호와 무관하게 크기로만 계산해서, 이미
    // 과보상된(진상) 모선도 지상과 똑같이 취급해 콘덴서를 "더" 추천했다.
    // 진상 모선에 콘덴서를 더 넣으면 Q가 더 음의 방향으로 커져 상황이
    // 악화된다 — 진상 모선은 추가 보상이 필요 없다.
    const result = computePowerFactorCorrection(lf(1.0, -0.6), nameMap, 0.95)
    const b = result.buses[0]
    expect(b.qc_required).toBe(0)
    expect(b.qc_standard).toBe(0)
    // 손대지 않았으니 보정 후 역률도 원래 값(진상 상태 그대로)이어야 한다 —
    // 예전엔 q_after가 Math.max(0,...)에 걸려 0으로 클램프되면서 "완벽한
    // 역률 1.0"이라는 거짓 결과가 나왔다.
    expect(b.pf_after).toBeCloseTo(b.pf_current, 6)
  })

  it('회귀: 필요한 보상이 0이면 최소 표준규격(50kvar)도 추천하지 않는다', () => {
    // 이미 목표 역률(0.95)보다 좋은 지상 모선 — 보상이 전혀 필요 없다.
    const result = computePowerFactorCorrection(lf(1.0, 0.1), nameMap, 0.95)
    const b = result.buses[0]
    expect(b.qc_required).toBe(0)
    expect(b.qc_standard).toBe(0)   // roundUpStandard(0)이 예전엔 50을 반환했다
    expect(b.qc_kvar).toBe(0)
  })
})
