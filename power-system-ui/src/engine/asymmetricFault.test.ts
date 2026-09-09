/**
 * asymmetricFault.ts 단위 테스트.
 *
 * IEC 60909 대칭좌표법 공식(1LG/LL/2LG) 자체는 표준식이므로 재도출하지 않는다.
 * 대신 이 엔진이 직접 하는 일 — 변압기 벡터그룹 표기(예: 'YNd11')로부터
 * HV/LV 권선이 접지인지 델타인지를 올바르게 읽어내는지 — 를 검증한다.
 * IEC 60076-1에 정의된 12개 표준 벡터그룹 전부를 손으로 분류해 대조한다.
 */
import { describe, it, expect } from 'vitest'
import type { TransformerVectorGroup } from '../types'
import { classifyVectorGroup } from './asymmetricFault'

describe('classifyVectorGroup', () => {
  // [벡터그룹, HV접지, HV델타, LV접지(Y 또는 지그재그), LV델타] — IEC 60076-1 표기 규칙
  // ([HV][LV][시계방향 숫자] 순서: HV='D'|'Y'|'YN', LV='d'|'yn'|'y'|'zn') 기준 손 분류.
  const cases: Array<[TransformerVectorGroup, boolean, boolean, boolean, boolean]> = [
    ['Dyn11',  false, true,  true,  false],
    ['Dyn1',   false, true,  true,  false],
    ['YNyn0',  true,  false, true,  false],
    ['YNyn11', true,  false, true,  false],
    ['YNd11',  true,  false, false, true],
    ['YNd1',   true,  false, false, true],
    ['Yyn0',   false, false, true,  false],
    ['Yyn11',  false, false, true,  false],
    ['Dd0',    false, true,  false, true],
    ['Dz0',    false, true,  false, false],
    ['Yzn11',  false, false, true,  false],
    ['Yzn1',   false, false, true,  false],
  ]

  it.each(cases)('%s → hvGrounded=%s hvDelta=%s lvGrounded=%s lvDelta=%s', (vg, hvGrounded, hvDelta, lvGrounded, lvDelta) => {
    expect(classifyVectorGroup(vg)).toEqual({ hvGrounded, hvDelta, lvGrounded, lvDelta })
  })

  it('회귀: YNd(HV 접지·LV 델타)는 lvDelta=true를 반환해야 한다 — 예전엔 이 타입 값 12개 전부에서 항상 false였다', () => {
    // 예전 버그: lvDelta를 vg.endsWith('d')로 판정했는데, 벡터그룹 표기는
    // 항상 시계방향 숫자로 끝나서(예: 'YNd11') 이 조건이 절대 참이 될 수
    // 없었다. 그 결과 YNd 변압기는 "HV shunt" 분기를 영영 타지 못하고
    // 영상분 임피던스 스탬프가 통째로 빠져서, 그 변압기를 낀 지락고장(1LG,
    // 2LG) 계산이 조용히 틀렸다.
    expect(classifyVectorGroup('YNd11').lvDelta).toBe(true)
    expect(classifyVectorGroup('YNd1').lvDelta).toBe(true)
  })

  it('회귀: Yzn(지그재그 접지)는 lvGrounded=true를 반환해야 한다 — 예전엔 "yn" 부분문자열만 찾아서 "zn"을 놓쳤다', () => {
    expect(classifyVectorGroup('Yzn11').lvGrounded).toBe(true)
    expect(classifyVectorGroup('Yzn1').lvGrounded).toBe(true)
  })
})
