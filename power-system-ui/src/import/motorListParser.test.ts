/**
 * motorListParser의 순수 로직(parseMotorListRows) 단위 테스트.
 * XLSX.utils.sheet_to_json(ws, {header:1, defval:'', blankrows:false})가
 * 반환하는 형태(헤더 행 + 데이터 행의 2차원 배열)를 그대로 픽스처로 사용한다.
 */
import { describe, it, expect } from 'vitest'
import { parseMotorListRows } from './motorListParser'

describe('parseMotorListRows', () => {
  it('영문 헤더를 인식하고 MCC별로 그룹화한다', () => {
    const raw = [
      ['Tag', 'kW', 'PF', 'Voltage', 'MCC'],
      ['P-101A', 75, 0.85, 380, 'MCC-1'],
      ['P-101B', 75, 0.85, 380, 'MCC-1'],
      ['F-201', 22, 0.82, 380, 'MCC-2'],
    ]
    const result = parseMotorListRows(raw)

    expect(result.totalRows).toBe(3)
    expect(result.skippedRows).toBe(0)
    expect(result.mccGroups.get('MCC-1')?.length).toBe(2)
    expect(result.mccGroups.get('MCC-2')?.length).toBe(1)
    expect(result.detectedColumns.tag).toBe('Tag')
    expect(result.detectedColumns.kw).toBe('kW')
  })

  it('한글 헤더도 별칭 사전으로 인식한다', () => {
    const raw = [
      ['태그', '정격출력', '역률', '전압', '배전반'],
      ['M-1', 55, 0.88, 380, 'MCC-A'],
    ]
    const result = parseMotorListRows(raw)

    expect(result.detectedColumns.tag).toBe('태그')
    expect(result.detectedColumns.kw).toBe('정격출력')
    expect(result.rows[0].mcc).toBe('MCC-A')
  })

  it('kW 헤더에 HP가 포함되면 kW로 환산한다 (1HP=0.7457kW)', () => {
    const raw = [
      ['Tag', 'Power (HP)', 'PF', 'Voltage', 'MCC'],
      ['P-1', 100, 0.85, 380, 'MCC-1'],
    ]
    const result = parseMotorListRows(raw)
    expect(result.rows[0].kw).toBeCloseTo(74.57, 1)
  })

  it('전압이 20 미만이면 kV로 해석해 V로 변환한다', () => {
    const raw = [
      ['Tag', 'kW', 'PF', 'Voltage', 'MCC'],
      ['M-1', 500, 0.85, 6.6, 'MCC-1'],   // 6.6 → 6.6kV → 6600V
      ['M-2', 500, 0.85, 380, 'MCC-1'],   // 380 → 그대로 380V
    ]
    const result = parseMotorListRows(raw)
    expect(result.rows[0].voltage_v).toBe(6600)
    expect(result.rows[1].voltage_v).toBe(380)
  })

  it('역률이 1을 초과(퍼센트로 입력)하면 100으로 나눈다', () => {
    const raw = [
      ['Tag', 'kW', 'PF', 'Voltage', 'MCC'],
      ['M-1', 75, 85, 380, 'MCC-1'],   // PF=85 → 0.85로 정규화
    ]
    const result = parseMotorListRows(raw)
    expect(result.rows[0].pf).toBeCloseTo(0.85)
  })

  it('역률이 범위를 벗어나면 기본값 0.85를 사용한다', () => {
    const raw = [
      ['Tag', 'kW', 'PF', 'Voltage', 'MCC'],
      ['M-1', 75, -1, 380, 'MCC-1'],
      ['M-2', 75, 150, 380, 'MCC-1'],   // 150/100=1.5도 여전히 범위 밖
    ]
    const result = parseMotorListRows(raw)
    expect(result.rows[0].pf).toBe(0.85)
    expect(result.rows[1].pf).toBe(0.85)
  })

  it('kW가 0 이하인 행은 건너뛰고 skippedRows에 반영한다', () => {
    const raw = [
      ['Tag', 'kW', 'PF', 'Voltage', 'MCC'],
      ['M-1', 75, 0.85, 380, 'MCC-1'],
      ['M-2', 0, 0.85, 380, 'MCC-1'],
      ['M-3', -5, 0.85, 380, 'MCC-1'],
    ]
    const result = parseMotorListRows(raw)
    expect(result.totalRows).toBe(1)
    expect(result.skippedRows).toBe(2)
  })

  it('MCC 컬럼이 없으면 전체를 MCC-1로 묶고 경고를 남긴다', () => {
    const raw = [
      ['Tag', 'kW', 'PF', 'Voltage'],
      ['M-1', 75, 0.85, 380],
      ['M-2', 55, 0.85, 380],
    ]
    const result = parseMotorListRows(raw)
    expect(result.mccGroups.size).toBe(1)
    expect(result.mccGroups.has('MCC-1')).toBe(true)
    expect(result.warnings.some(w => w.includes('MCC'))).toBe(true)
  })

  it('TAG 컬럼이 없으면 행 번호 기반 태그를 붙인다', () => {
    const raw = [
      ['kW', 'PF', 'Voltage', 'MCC'],
      [75, 0.85, 380, 'MCC-1'],
    ]
    const result = parseMotorListRows(raw)
    expect(result.rows[0].tag).toMatch(/^M-\d+$/)
  })

  it('데이터 행이 없으면(헤더만 있거나 빈 시트) 빈 결과와 경고를 반환한다', () => {
    expect(parseMotorListRows([]).warnings.length).toBeGreaterThan(0)
    expect(parseMotorListRows([['Tag', 'kW']]).totalRows).toBe(0)
  })

  it('10행 이내에서 가장 많이 채워진 행을 헤더로 탐지한다 (제목/설명 행 스킵)', () => {
    const raw = [
      ['MCC Motor List — Project XYZ'],      // 제목 행 (컬럼 1개만 채워짐)
      [],
      ['Tag', 'kW', 'PF', 'Voltage', 'MCC'], // 실제 헤더 (5개 채워짐)
      ['M-1', 75, 0.85, 380, 'MCC-1'],
    ]
    const result = parseMotorListRows(raw)
    expect(result.detectedColumns.tag).toBe('Tag')
    expect(result.totalRows).toBe(1)
  })
})
