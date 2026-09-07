/**
 * buildMotorNetwork 단위 테스트.
 * ParsedMotorList → ReactFlow 노드/엣지 토폴로지 + 요약 통계를 검증한다.
 * 내부 uid()는 모듈 전역 카운터라 정확한 ID 문자열은 검증하지 않고,
 * 반환된 nodes/edges의 id를 그대로 따라가며 구조를 검증한다.
 */
import { describe, it, expect } from 'vitest'
import { buildMotorNetwork } from './motorNetworkBuilder'
import type { ParsedMotorList, MotorRow } from './motorListParser'
import type { Bus, Transformer, Motor } from '../types'

function motor(tag: string, kw: number, pf: number, mcc: string, voltage_v = 380): MotorRow {
  return { tag, kw, pf, voltage_v, mcc }
}

function toParsed(rows: MotorRow[]): ParsedMotorList {
  const mccGroups = new Map<string, MotorRow[]>()
  for (const r of rows) {
    if (!mccGroups.has(r.mcc)) mccGroups.set(r.mcc, [])
    mccGroups.get(r.mcc)!.push(r)
  }
  return {
    rows, mccGroups,
    detectedColumns: { tag: 'Tag', kw: 'kW', pf: 'PF', voltage: 'Voltage', mcc: 'MCC' },
    warnings: [], totalRows: rows.length, skippedRows: 0,
  }
}

describe('buildMotorNetwork', () => {
  it('빈 입력이면 빈 토폴로지를 반환한다', () => {
    const result = buildMotorNetwork(toParsed([]))
    expect(result.nodes).toHaveLength(0)
    expect(result.edges).toHaveLength(0)
    expect(result.summary.motorCount).toBe(0)
  })

  it('MCC 1개·전동기 2대 → MAIN BUS + 변압기 + MCC BUS + 전동기 2개 토폴로지를 만든다', () => {
    const parsed = toParsed([
      motor('P-101A', 75, 0.85, 'MCC-1'),
      motor('P-101B', 55, 0.85, 'MCC-1'),
    ])
    const result = buildMotorNetwork(parsed)

    const buses        = result.nodes.filter(n => n.type === 'bus')
    const transformers  = result.nodes.filter(n => n.type === 'transformer')
    const motorNodes    = result.nodes.filter(n => n.type === 'motor')

    expect(buses).toHaveLength(2)          // MAIN BUS + MCC BUS
    expect(transformers).toHaveLength(1)
    expect(motorNodes).toHaveLength(2)
    expect(result.edges).toHaveLength(4)   // MAIN→TR(1) + TR→MCC(1) + MCC→Motor×2(2)

    const mainBus = buses.find(n => (n.data.equipment as Bus).name === 'MAIN BUS')!
    expect((mainBus.data.equipment as Bus).busType).toBe('Slack')

    const motorTags = motorNodes.map(n => (n.data.equipment as Motor).name).sort()
    expect(motorTags).toEqual(['P-101A', 'P-101B'])
  })

  it('MCC 그룹 수만큼 변압기와 MCC BUS를 생성한다', () => {
    const parsed = toParsed([
      motor('P-1', 75, 0.85, 'MCC-1'),
      motor('P-2', 55, 0.85, 'MCC-2'),
      motor('P-3', 30, 0.85, 'MCC-3'),
    ])
    const result = buildMotorNetwork(parsed)

    expect(result.nodes.filter(n => n.type === 'transformer')).toHaveLength(3)
    expect(result.nodes.filter(n => n.type === 'bus')).toHaveLength(4)   // MAIN + 3×MCC
    expect(result.summary.mccCount).toBe(3)
  })

  it('그룹 총 kW에 안전율(1.25)과 역률(0.9)을 적용해 변압기 용량을 산정한다', () => {
    // 그룹 총 150kW → sn_mva = 150/1000/0.9*1.25 = 0.2083... → 반올림(0.1 단위) = 0.2
    const parsed = toParsed([
      motor('P-1', 100, 0.85, 'MCC-1'),
      motor('P-2', 50, 0.85, 'MCC-1'),
    ])
    const result = buildMotorNetwork(parsed)
    const tr = result.nodes.find(n => n.type === 'transformer')!
    expect((tr.data.equipment as Transformer).sn_mva).toBeCloseTo(0.2, 5)
  })

  it('전동기 전압(V)을 kV로 변환해 변압기 LV·MCC BUS 전압에 반영한다', () => {
    const parsed = toParsed([motor('M-1', 500, 0.85, 'MCC-1', 6600)])
    const result = buildMotorNetwork(parsed)

    const tr     = result.nodes.find(n => n.type === 'transformer')!
    const mccBus = result.nodes.find(n => n.type === 'bus' && (n.data.equipment as Bus).name === 'MCC-1')!

    expect((tr.data.equipment as Transformer).vn_lv_kv).toBeCloseTo(6.6, 3)
    expect((mccBus.data.equipment as Bus).vn_kv).toBeCloseTo(6.6, 3)
  })

  it('모든 엣지가 실제 존재하는 노드 id만 참조한다 (끊어진 연결이 없어야 함)', () => {
    const parsed = toParsed([
      motor('P-1', 75, 0.85, 'MCC-1'),
      motor('P-2', 55, 0.85, 'MCC-2'),
    ])
    const result = buildMotorNetwork(parsed)
    const nodeIds = new Set(result.nodes.map(n => n.id))

    for (const edge of result.edges) {
      expect(nodeIds.has(edge.source)).toBe(true)
      expect(nodeIds.has(edge.target)).toBe(true)
    }
  })

  it('요약 통계(총 kW·평균 PF·최대 kW)를 올바르게 계산한다', () => {
    const parsed = toParsed([
      motor('P-1', 100, 0.8, 'MCC-1'),
      motor('P-2', 50, 0.9, 'MCC-1'),
    ])
    const result = buildMotorNetwork(parsed)

    expect(result.summary.totalKW).toBeCloseTo(150, 1)
    expect(result.summary.avgPF).toBeCloseTo(0.85, 3)
    expect(result.summary.largestKW).toBe(100)
    expect(result.summary.motorCount).toBe(2)
  })

  it('모든 노드 좌표는 20px 그리드에 스냅되어 있어야 한다', () => {
    const parsed = toParsed([
      motor('P-1', 75, 0.85, 'MCC-1'),
      motor('P-2', 55, 0.85, 'MCC-2'),
    ])
    const result = buildMotorNetwork(parsed)
    for (const node of result.nodes) {
      expect(node.position.x % 20).toBe(0)
      expect(node.position.y % 20).toBe(0)
    }
  })
})
