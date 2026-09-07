/**
 * loadScheduleParser 단위 테스트: 순수 파싱(parseLoadScheduleRows)과
 * 장비유형 판별(detectType)을 검증한다.
 */
import { describe, it, expect } from 'vitest'
import { parseLoadScheduleRows, detectType } from './loadScheduleParser'

describe('detectType', () => {
  it('키워드로 motor/generator/load를 구분한다', () => {
    expect(detectType('MOTOR', 'M-1')).toBe('motor')
    expect(detectType('PUMP', 'P-1')).toBe('motor')
    expect(detectType('DIESEL GENERATOR', 'DG-1')).toBe('generator')
    expect(detectType('LIGHTING PANEL', 'LP-1')).toBe('load')
  })

  it('회귀 테스트: 문자 g/m을 포함하기만 해도 오분류되던 버그가 재발하지 않아야 한다', () => {
    // 예전 버그: GEN_KEYWORDS/MOTOR_KEYWORDS에 있던 단일 문자 'g'/'m' substring
    // 매칭 때문에 "SWITCHGEAR", "LIGHTING" 등 g가 들어간 모든 일반 부하가
    // 전부 '발전기'로 잘못 분류되고 있었다.
    expect(detectType('SWITCHGEAR', 'SWG-1')).toBe('load')
    expect(detectType('LIGHTING PANEL', 'LP-1')).toBe('load')
    expect(detectType('LOAD', 'L-1')).toBe('load')
    // 펌프(모터)인데 태그에 우연히 'g'가 들어간 경우 — 발전기로 새치기당하면 안 됨
    expect(detectType('PUMP', 'PG-101')).toBe('motor')
  })

  it('태그가 G-<숫자>/M-<숫자> 형태면 설명이 없어도 유형을 추정한다', () => {
    expect(detectType('', 'G-1')).toBe('generator')
    expect(detectType('', 'M-101')).toBe('motor')
    expect(detectType('', 'DP-1')).toBe('load')   // 부하 패널은 그대로 load
  })
})

describe('parseLoadScheduleRows', () => {
  it('컬럼을 인식해 모선(Bus)별로 그룹화한다', () => {
    const raw = [
      ['Tag', 'Type', 'kW', 'PF', 'Voltage', 'Bus'],
      ['P-101', 'Pump', 75, 0.85, 380, 'BUS-A'],
      ['DG-1', 'Diesel Generator', 500, 0.8, 380, 'BUS-A'],
      ['L-1', 'Lighting', 10, 0.9, 220, 'BUS-B'],
    ]
    const result = parseLoadScheduleRows(raw)

    expect(result.totalRows).toBe(3)
    expect(result.busGroups.get('BUS-A')?.length).toBe(2)
    expect(result.busGroups.get('BUS-B')?.length).toBe(1)

    const pump = result.rows.find(r => r.tag === 'P-101')!
    const gen  = result.rows.find(r => r.tag === 'DG-1')!
    const load = result.rows.find(r => r.tag === 'L-1')!
    expect(pump.equipType).toBe('motor')
    expect(gen.equipType).toBe('generator')
    expect(load.equipType).toBe('load')
  })

  it('kW 헤더에 HP가 포함되면 kW로 환산한다', () => {
    const raw = [
      ['Tag', 'Type', 'Power (HP)', 'PF', 'Voltage', 'Bus'],
      ['M-1', 'Motor', 100, 0.85, 380, 'BUS-A'],
    ]
    const result = parseLoadScheduleRows(raw)
    expect(result.rows[0].kw).toBeCloseTo(74.57, 1)
  })

  it('전압이 20 미만이면 kV로 해석한다', () => {
    const raw = [
      ['Tag', 'Type', 'kW', 'PF', 'Voltage', 'Bus'],
      ['M-1', 'Motor', 500, 0.85, 6.6, 'BUS-A'],
    ]
    const result = parseLoadScheduleRows(raw)
    expect(result.rows[0].voltage_v).toBe(6600)
  })

  it('kW가 0 이하인 행은 건너뛴다', () => {
    const raw = [
      ['Tag', 'Type', 'kW', 'PF', 'Voltage', 'Bus'],
      ['M-1', 'Motor', 0, 0.85, 380, 'BUS-A'],
    ]
    const result = parseLoadScheduleRows(raw)
    expect(result.totalRows).toBe(0)
    expect(result.skippedRows).toBe(1)
  })

  it('Bus 컬럼이 없으면 전체를 BUS-1로 묶고 경고를 남긴다', () => {
    const raw = [
      ['Tag', 'Type', 'kW', 'PF', 'Voltage'],
      ['M-1', 'Motor', 75, 0.85, 380],
    ]
    const result = parseLoadScheduleRows(raw)
    expect(result.busGroups.has('BUS-1')).toBe(true)
    expect(result.warnings.some(w => w.includes('Bus'))).toBe(true)
  })

  it('데이터가 없으면 빈 결과를 반환한다', () => {
    const result = parseLoadScheduleRows([])
    expect(result.totalRows).toBe(0)
    expect(result.warnings.length).toBeGreaterThan(0)
  })
})
