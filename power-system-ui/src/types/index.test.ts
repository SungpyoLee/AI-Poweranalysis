/**
 * types/index.ts의 defaultEquipment() 기본값들이 서로 모순되지 않는지 검증한다.
 * (예: 버스 기본 작업거리가 버스 기본 인클로저 타입의 IEEE 1584 기준거리와 일치하는지)
 */
import { describe, it, expect } from 'vitest'
import { defaultEquipment, type Bus } from './index'
import { DEFAULT_DISTANCE_MM } from '../engine/arcFlash'

describe('defaultEquipment(bus) — 아크플래시 기본값 일관성', () => {
  it('회귀: 기본 작업거리(working_distance_mm)는 기본 인클로저 타입(enclosure_type)의 IEEE 1584 기준거리와 같아야 한다', () => {
    // 예전 버그: 여기서 working_distance_mm이 항상 455mm(LV/MCC용)로 고정돼 있었는데
    // 기본 enclosure_type은 'MV_SWITCHGEAR'(IEEE 1584 기준 910mm)였다. 그래서
    // 사용자가 팔레트에서 새 버스를 만들 때마다(가장 흔한 실사용 경로) 아크플래시
    // 계산이 실제보다 가까운 거리(455mm)를 가정해 입사에너지를 과대평가했다 —
    // 같은 화면(예제 프로젝트)이 아니라 새로 만든 버스에서만 나타나는 버그였다.
    const bus = defaultEquipment('bus', 'b1') as Bus
    expect(bus.enclosure_type).toBeDefined()
    expect(bus.working_distance_mm).toBe(DEFAULT_DISTANCE_MM[bus.enclosure_type!])
  })
})
