import { useState, useMemo, useEffect } from 'react'
import type { Bus, Motor, ContingencyResult, ArcFlashResult, CableSizingResult, MotorStartResult } from '../types'
import { useAnalysisStore, type CalcType } from '../store/useAnalysisStore'
import { useCalcLogStore } from '../store/useCalcLogStore'
import { useEquipmentStore } from '../store/useEquipmentStore'
import { useStudyCaseStore } from '../store/useStudyCaseStore'
import { useProjectStore } from '../store/useProjectStore'
import { computeProtectionItems } from '../utils/computeProtection'
import { computeRelayResults, computeDifferentialRelayResults } from '../engine/protectionCoordination'
import { buildTCCData } from '../engine/tcc'
import { computePowerFactorCorrection } from '../engine/powerFactor'

import {
  type RowData,
  BUS_LF_COLS, BUS_SC_COLS, COORDINATION_COLS, CURVE_LABELS, ARC_FLASH_COLS,
  CONTINGENCY_COLS, HARMONIC_BUS_COLS, CABLE_SIZING_COLS, PROTECTION_COLS, MOTOR_START_COLS,
  TabGroupLabel, TabGroupDivider, PanelTab, SummaryCard,
  exportCSV, startStatusLabel,
} from './results/shared'
import {
  ProtectionSummaryCard, CoordinationSummaryCard, MotorStartSummaryCard,
  ArcFlashSummaryCard, ContingencySummaryCard, HarmonicsSummaryCard, CableSizingSummaryCard,
} from './results/summaryCards'
import BusVoltageChart from './results/BusVoltageChart'
import LoadFlowTab from './results/tabs/LoadFlowTab'
import ShortCircuitTab from './results/tabs/ShortCircuitTab'
import AsymFaultTab from './results/tabs/AsymFaultTab'
import ProtectionTab from './results/tabs/ProtectionTab'
import CoordinationTab from './results/tabs/CoordinationTab'
import MotorStartTab from './results/tabs/MotorStartTab'
import ArcFlashTab from './results/tabs/ArcFlashTab'
import ContingencyTab from './results/tabs/ContingencyTab'
import TCCTab from './results/tabs/TCCTab'
import Relay87tTab from './results/tabs/Relay87tTab'
import HarmonicsTab from './results/tabs/HarmonicsTab'
import CableSizingTab from './results/tabs/CableSizingTab'
import PfcTab from './results/tabs/PfcTab'
import StudyCaseTab from './results/tabs/StudyCaseTab'
import CalcLogTab from './results/tabs/CalcLogTab'

// ── Types ────────────────────────────────────────────────────────────────────
type TabId = 'lf' | 'sc' | 'asymFault' | 'protection' | 'motorStart' | 'coordination' | 'arcFlash' | 'contingency' | 'tcc' | 'harmonics' | 'cableSizing' | 'voltageChart' | 'pfc' | 'relay87t' | 'studyCase' | 'calcLog'

// ── Main component ────────────────────────────────────────────────────────────
interface ResultsPanelProps {
  height?: number
  onResizeStart?: (e: React.MouseEvent) => void
}

export default function ResultsPanel({ height = 320, onResizeStart }: ResultsPanelProps = {}) {
  const [tab, setTab] = useState<TabId>('lf')

  const loadflow     = useAnalysisStore(s => s.loadflow)
  const shortcircuit = useAnalysisStore(s => s.shortcircuit)
  const asymFault    = useAnalysisStore(s => s.asymFault)
  const arcFlash     = useAnalysisStore(s => s.arcFlash)
  const contingency  = useAnalysisStore(s => s.contingency)
  const harmonics    = useAnalysisStore(s => s.harmonics)
  const cableSizing  = useAnalysisStore(s => s.cableSizing)

  const studyCases   = useStudyCaseStore(s => s.cases)
  const baseline     = useStudyCaseStore(s => s.getBaseline())
  const setBaseline  = useStudyCaseStore(s => s.setBaseline)
  const saveCase     = useStudyCaseStore(s => s.saveCase)
  const deleteCase   = useStudyCaseStore(s => s.deleteCase)
  const nodes          = useEquipmentStore(s => s.nodes)
  const edges          = useEquipmentStore(s => s.edges)
  const selectNode     = useEquipmentStore(s => s.selectNode)
  const selectEdge     = useEquipmentStore(s => s.selectEdge)
  const focusResultNode = useEquipmentStore(s => s.focusResultNode)
  const selectedNodeId = useEquipmentStore(s => s.selectedNodeId)
  const selectedEdgeId = useEquipmentStore(s => s.selectedEdgeId)

  // 결과 행 클릭 → 캔버스 노드 포커스 (노드이면 selectNode, 아니면 focusResultNode 사용)
  const handleResultRowClick = (id: string) => {
    const isNode = nodes.some(n => n.id === id)
    const isEdge = edges.some(e => e.id === id)
    if (isNode)  { focusResultNode(id) }
    else if (isEdge) { selectEdge(id) }
  }
  const coordMarginS   = useProjectStore(s => s.meta.coordination_margin_s ?? 0.3)
  const lastCalcType   = useAnalysisStore(s => s.lastCalcType)
  const calcLogEntries = useCalcLogStore(s => s.entries)

  // 계산 완료 시 해당 결과 탭으로 자동 전환
  useEffect(() => {
    if (!lastCalcType) return
    const tabMap: Partial<Record<CalcType, TabId>> = {
      sc:          'sc',
      asymFault:   'asymFault',
      contingency: 'contingency',
      harmonics:   'harmonics',
      cableSizing: 'cableSizing',
    }
    const next = tabMap[lastCalcType]
    if (next) setTab(next)
  }, [lastCalcType])

  // ── Protection check — must be before early return (hook ordering) ────────
  const protectionItems = useMemo(
    () => computeProtectionItems(shortcircuit, nodes, edges),
    [shortcircuit, nodes, edges],
  )

  const relayResults = useMemo(
    () => computeRelayResults(shortcircuit, nodes, edges, coordMarginS),
    [shortcircuit, nodes, edges, coordMarginS],
  )

  const tccData = useMemo(
    () => buildTCCData(relayResults, nodes, edges),
    [relayResults, nodes, edges],
  )

  // 87T 차동계전기 결과
  const relay87tResults = useMemo(
    () => computeDifferentialRelayResults(nodes, edges, loadflow),
    [nodes, edges, loadflow],
  )

  // 역률 보상 계산
  const pfcResult = useMemo(() => {
    if (!loadflow) return null
    const nameMap = new Map(nodes.map(n => [n.id, {
      name: n.data.equipment.name,
      vn_kv: (n.data.equipment as Bus).vn_kv ?? 0,
    }]))
    return computePowerFactorCorrection(loadflow, nameMap)
  }, [loadflow, nodes])

  // ── breakerCapMap — early return 이전에 호출해야 React hooks 규칙 준수 ───────
  const breakerCapMap = useMemo(() => {
    const m = new Map<string, { breaking_capacity_ka: number; making_capacity_ka: number }>()
    nodes.forEach(n => {
      if (n.type !== 'breaker') return
      const br = n.data.equipment as import('../types').Breaker
      m.set(n.id, {
        breaking_capacity_ka: br.breaking_capacity_ka,
        making_capacity_ka:   br.making_capacity_ka,
      })
    })
    return m
  }, [nodes])

  if (!loadflow && !shortcircuit && !asymFault && !contingency && !harmonics && !cableSizing && studyCases.length === 0 && calcLogEntries.length === 0) return null

  // ── Ordered rows (follow nodes/edges array order) ─────────────────────────
  const busLFRows: RowData[] = nodes
    .filter(n => n.type === 'bus')
    .map(n => {
      const busEq = n.data.equipment as Bus
      const lf    = loadflow?.buses[n.id]
      const sc    = shortcircuit?.buses[n.id]
      return {
        id:         n.id,
        name:       busEq.name,
        vn_kv:      busEq.vn_kv,
        vm_pu:      lf?.vm_pu,
        va_degree:  lf?.va_degree,
        p_mw:       lf?.p_mw,
        q_mvar:     lf?.q_mvar,
        ikss_ka:    (sc && sc.ikss_ka > 0) ? sc.ikss_ka : undefined,
      }
    })

  const busSCRows: RowData[] = nodes
    .filter(n => n.type === 'bus')
    .map(n => {
      const busEq = n.data.equipment as Bus
      const sc    = shortcircuit?.buses[n.id]
      return {
        id:           n.id,
        name:         busEq.name,
        vn_kv:        busEq.vn_kv,
        ikss_ka:      (sc && sc.ikss_ka > 0)     ? sc.ikss_ka      : undefined,
        ip_ka:        (sc && sc.ip_ka  > 0)       ? sc.ip_ka        : undefined,
        ib_ka:        (sc && sc.ib_ka  > 0)       ? sc.ib_ka        : undefined,
        ith_ka:       (sc && (sc.ith_ka ?? 0) > 0) ? sc.ith_ka      : undefined,
        ikss_ka_min:  (sc && (sc.ikss_ka_min ?? 0) > 0) ? sc.ikss_ka_min : undefined,
        skss_mva:     (sc && sc.skss_mva > 0)     ? sc.skss_mva     : undefined,
      }
    })

  const trLFRows: RowData[] = nodes
    .filter(n => n.type === 'transformer')
    .map(n => {
      const lf = loadflow?.transformers[n.id]
      return {
        id:               n.id,
        name:             n.data.equipment.name,
        loading_percent:  lf?.loading_percent,
        pl_kw:            lf !== undefined ? lf.pl_mw * 1000 : undefined,
      }
    })

  const cableLFRows: RowData[] = edges
    .filter(e => !!e.data?.cable)
    .map(e => {
      const lf = loadflow?.lines[e.id]
      return {
        id:               e.id,
        name:             e.data!.cable.name,
        i_a:              lf !== undefined ? lf.i_ka * 1000 : undefined,
        loading_percent:  lf?.loading_percent,
        vdrop_percent:    lf?.vdrop_percent,
      }
    })

  const motorLFRows: RowData[] = nodes
    .filter(n => n.type === 'motor')
    .map(n => {
      const mEq = n.data.equipment as Motor
      const lf  = loadflow?.motors[n.id]
      return {
        id:                n.id,
        name:              mEq.name,
        rated_kw:          mEq.rated_kw,
        p_mw:              lf?.p_mw,
        q_mvar:            lf?.q_mvar,
        running_current_a: lf?.running_current_a,
        starting_current_a:lf?.starting_current_a,
        starting_method:   mEq.starting_method,
      }
    })

  const motorStartRows: RowData[] = nodes
    .filter(n => n.type === 'motor')
    .map(n => {
      const mEq = n.data.equipment as Motor
      const sr  = loadflow?.motorStarts?.[n.id]
      return {
        id:                   n.id,
        name:                 mEq.name,
        starting_method:      mEq.starting_method,
        running_current_a:    sr?.running_current_a,
        start_current_a:      sr?.start_current_a,
        start_mva:            sr?.start_mva,
        terminal_voltage_pu:  sr?.terminal_voltage_pu,
        voltage_drop_percent: sr?.voltage_drop_percent,
        status: sr ? startStatusLabel(sr.terminal_voltage_pu) : undefined,
      }
    })

  const motorStartItems: MotorStartResult[] =
    Object.values(loadflow?.motorStarts ?? {})

  const coordinationRows: RowData[] = relayResults.map(r => {
    const realBreakerId = r.breakerId.replace('_51N', '')
    const cap = breakerCapMap.get(realBreakerId)
    const brk_cap = cap?.breaking_capacity_ka ?? 0
    const cap_margin = brk_cap > 0
      ? ((brk_cap - r.fault_current_ka) / brk_cap) * 100
      : undefined
    return {
      id:                     r.breakerId,
      breakerName:            r.breakerName,
      busName:                r.busName,
      fault_current_ka:       r.fault_current_ka,
      breaking_capacity_ka:   brk_cap > 0 ? brk_cap : undefined,
      cap_margin_percent:     cap_margin,
      curve_label:            CURVE_LABELS[r.curve_type] ?? r.curve_type,
      pickup_current_a:       r.pickup_current_a,
      time_dial:              r.time_dial,
      relay_operating_time_s: r.relay_operating_time_s,
      inst_label:             r.inst_trip ? '⚡ Yes' : 'No',
      margin_label:           isFinite(r.coordination_margin_s)
                                ? r.coordination_margin_s.toFixed(3)
                                : '—',
      status:                 r.pass && (cap_margin === undefined || cap_margin >= 0) ? 'PASS' : 'FAIL',
      _pass:                  r.pass,
      _cap_ok:                cap_margin === undefined || cap_margin >= 0,
      _cap_margin:            cap_margin,
    }
  })

  const contingencyCases: ContingencyResult[] = contingency?.cases ?? []
  const contingencyRows: RowData[] = contingencyCases.map(r => ({
    id:            r.equipmentId,
    equipmentName: r.equipmentName,
    equipmentType: r.equipmentType,
    severity:      r.severity,
    minV:          isNaN(r.minVoltagePu)      ? undefined : r.minVoltagePu,
    maxLoading:    isNaN(r.maxLoadingPercent) ? undefined : r.maxLoadingPercent,
    islandCount:   r.islandedBuses.length,
    uvCount:       r.undervoltageBuses.length,
    overloadCount: r.overloadedTransformers.length + r.overloadedLines.length,
    _severity:     r.severity,
  }))

  const protectionRows: RowData[] = protectionItems.map(item => ({
    ...item,
    id:     item.breakerId,
    status: item.pass ? 'PASS' : 'FAIL',
  }))

  const harmonicBusRows: RowData[] = Object.values(harmonics?.buses ?? {}).map(b => ({
    id:                     b.busId,
    busName:                b.busName,
    vn_kv:                  b.vn_kv,
    thdv_percent:           b.thdv_percent,
    h5:                     b.distortion[5]  ?? 0,
    h7:                     b.distortion[7]  ?? 0,
    h11:                    b.distortion[11] ?? 0,
    h13:                    b.distortion[13] ?? 0,
    h23:                    b.distortion[23] ?? 0,
    h25:                    b.distortion[25] ?? 0,
    max_order:              b.max_order,
    max_distortion_percent: b.max_distortion_percent,
    ieee519_limit:          b.ieee519_limit,
    status:                 b.ieee519_pass ? 'PASS' : 'FAIL',
    _pass:                  b.ieee519_pass,
    _thdv:                  b.thdv_percent,
    _limit:                 b.ieee519_limit,
  }))

  const cableSizingItems: CableSizingResult[] = Object.values(cableSizing?.cables ?? {})
  const cableSizingRows: RowData[] = cableSizingItems.map(r => ({
    id:                  r.cableId,
    cableName:           r.cableName,
    route:               `${r.fromBus} → ${r.toBus}`,
    vn_kv:               r.vn_kv,
    loadCurrentA:        r.loadCurrentA,
    ampacityA:           r.ampacityA,
    voltageDropPercent:  r.voltageDropPercent,
    shortCircuitKA:      r.shortCircuitKA > 0 ? r.shortCircuitKA : undefined,
    existingMM2:         r.existingMM2,
    recommendedModel:    r.recommendedModel,
    status:              r.severity,
    _severity:           r.severity,
    _dvLimit:            r.vdropLimit,
    _passAmp:            r.passAmpacity,
    _passDv:             r.passVoltageDrop,
    _passSc:             r.passShortCircuit,
    _dv:                 r.voltageDropPercent,
  }))

  const arcFlashItems: ArcFlashResult[] = Object.values(arcFlash?.items ?? {})
  const arcFlashRows: RowData[] = arcFlashItems.map(r => ({
    id:                    r.busId,
    busName:               r.busName,
    vn_kv:                r.vn_kv,
    ikss_ka:              r.ikss_ka,
    iarc_ka:              r.iarc_ka,
    clearing_time_s:      r.clearing_time_s,
    working_distance_mm:  r.working_distance_mm,
    incident_energy_cal:  r.incident_energy_cal,
    arc_flash_boundary_m: r.arc_flash_boundary_m,
    ppe_label:            r.ppe_category === 5 ? 'Cat 4+' : `Cat ${r.ppe_category}`,
    risk_level:           r.risk_level,
    _risk:                r.risk_level,
  }))

  // ── CSV export ────────────────────────────────────────────────────────────
  function handleExport() {
    if      (tab === 'lf')           exportCSV(BUS_LF_COLS,      busLFRows,         'bus_loadflow.csv')
    else if (tab === 'sc')           exportCSV(BUS_SC_COLS,      busSCRows,         'bus_shortcircuit.csv')
    else if (tab === 'protection')   exportCSV(PROTECTION_COLS,  protectionRows,    'protection_check.csv')
    else if (tab === 'motorStart')   exportCSV(MOTOR_START_COLS, motorStartRows,    'motor_starting.csv')
    else if (tab === 'coordination') exportCSV(COORDINATION_COLS,coordinationRows,  'coordination.csv')
    else if (tab === 'arcFlash')     exportCSV(ARC_FLASH_COLS,    arcFlashRows,     'arc_flash.csv')
    else if (tab === 'contingency')  exportCSV(CONTINGENCY_COLS, contingencyRows,   'contingency.csv')
    else if (tab === 'tcc')          exportCSV(COORDINATION_COLS, coordinationRows,  'tcc_coordination.csv')
    else if (tab === 'harmonics')    exportCSV(HARMONIC_BUS_COLS,   harmonicBusRows,    'harmonics_ieee519.csv')
    else if (tab === 'cableSizing')  exportCSV(CABLE_SIZING_COLS,  cableSizingRows,    'cable_sizing_iec60364.csv')
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div style={{
      gridColumn:    '1 / -1',
      height,
      display:       'flex',
      flexDirection: 'column',
      background:    '#f4f6f8',
      borderTop:     '2px solid #8a9aaa',
      overflow:      'hidden',
    }}>
      {/* #5 리사이즈 핸들 */}
      <div
        onMouseDown={onResizeStart}
        style={{
          height: 5, cursor: 'ns-resize', flexShrink: 0,
          background: 'linear-gradient(to bottom, #8a9aaa, #c8d4dc)',
          borderTop: '1px solid #6a7a8a',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}
        title="드래그하여 패널 높이 조절"
      >
        <div style={{ width: 32, height: 2, background: '#a8b4c0', borderRadius: 2 }} />
      </div>

      {/* ── Panel header: tabs + summary + export ── */}
      <div style={{
        display:      'flex',
        alignItems:   'stretch',
        height:       33,
        flexShrink:   0,
        background:   'linear-gradient(to bottom, #dce2e8 0%, #d0d8e0 100%)',
        borderBottom: '2px solid #bcc6d0',
      }}>
        {/* Label */}
        <div style={{
          display: 'flex', alignItems: 'center',
          padding: '0 10px',
          borderRight: '2px solid #a8b4c0',
          fontSize: 8.5, fontWeight: 700, color: '#4a5a6a',
          letterSpacing: '0.1em', textTransform: 'uppercase',
          whiteSpace: 'nowrap', flexShrink: 0,
          background: 'linear-gradient(to bottom, #d0d8e2, #c4ccd6)',
        }}>
          RESULTS
        </div>

        {/* Tabs — 가로 스크롤 컨테이너 (C-3) */}
        <div style={{
          display: 'flex', alignItems: 'stretch',
          overflowX: 'auto', overflowY: 'hidden',
          flex: 1, minWidth: 0,
          scrollbarWidth: 'thin',
          scrollbarColor: '#a8b4c0 transparent',
        }}>
          {/* ── 그룹 1: 기본 해석 ─────────────────────────────────────────── */}
          <TabGroupLabel label="해석" />
          <PanelTab label="Load Flow"     active={tab === 'lf'}         disabled={!loadflow}                        onClick={() => setTab('lf')} />
          <PanelTab label="Short Circuit" active={tab === 'sc'}         disabled={!shortcircuit}                    onClick={() => setTab('sc')} />
          <PanelTab label="Asym. Fault"  active={tab === 'asymFault'}  disabled={!asymFault}                       onClick={() => setTab('asymFault')} />
          <PanelTab label="Motor Start"  active={tab === 'motorStart'}  disabled={motorStartItems.length === 0}     onClick={() => setTab('motorStart')} />
          <PanelTab label="N-1"          active={tab === 'contingency'} disabled={contingencyCases.length === 0}    onClick={() => setTab('contingency')} />

          {/* ── 그룹 2: 보호 협조 ─────────────────────────────────────────── */}
          <TabGroupDivider />
          <TabGroupLabel label="보호" />
          <PanelTab label="Protection"   active={tab === 'protection'}  disabled={!shortcircuit}                    onClick={() => setTab('protection')} />
          <PanelTab label="Coordination" active={tab === 'coordination'} disabled={relayResults.length === 0}       onClick={() => setTab('coordination')} />
          <PanelTab label="TCC"          active={tab === 'tcc'}          disabled={relayResults.length === 0}       onClick={() => setTab('tcc')} />
          <PanelTab label="87T Diff."    active={tab === 'relay87t'}     disabled={relay87tResults.length === 0}    onClick={() => setTab('relay87t')} />
          <PanelTab label="Arc Flash"    active={tab === 'arcFlash'}     disabled={arcFlashItems.length === 0}      onClick={() => setTab('arcFlash')} />

          {/* ── 그룹 3: 전력 품질 ─────────────────────────────────────────── */}
          <TabGroupDivider />
          <TabGroupLabel label="품질" />
          <PanelTab label="Harmonics"    active={tab === 'harmonics'}   disabled={Object.keys(harmonics?.buses ?? {}).length === 0} onClick={() => setTab('harmonics')} />
          <PanelTab label="Cable Sizing" active={tab === 'cableSizing'}  disabled={cableSizingItems.length === 0}   onClick={() => setTab('cableSizing')} />
          <PanelTab label="V Profile"    active={tab === 'voltageChart'} disabled={!loadflow}                       onClick={() => setTab('voltageChart')} />
          <PanelTab label="PFC"          active={tab === 'pfc'}          disabled={!loadflow}                       onClick={() => setTab('pfc')} />

          {/* ── 그룹 4: 프로젝트 ─────────────────────────────────────────── */}
          <TabGroupDivider />
          <TabGroupLabel label="기록" />
          <PanelTab label="Study Case"   active={tab === 'studyCase'}   disabled={false}                            onClick={() => setTab('studyCase')} />
          <PanelTab label="계산 이력"     active={tab === 'calcLog'}     disabled={calcLogEntries.length === 0}      onClick={() => setTab('calcLog')} />
        </div>

        <div style={{ width: 1, background: '#b4bec8', margin: '6px 8px', flexShrink: 0 }} />

        {/* Summary card */}
        <div style={{ display: 'flex', alignItems: 'center', flex: 1, minWidth: 0, overflow: 'hidden' }}>
          {tab === 'lf' && loadflow && (
            <SummaryCard converged={loadflow.converged} meta={loadflow.meta} />
          )}
          {tab === 'sc' && shortcircuit && (
            <span style={{ fontSize: 9, color: '#5a6a7a', fontFamily: 'Consolas, monospace', whiteSpace: 'nowrap' }}>
              IEC 60909 · 3-phase balanced · c = 1.1
            </span>
          )}
          {tab === 'protection' && shortcircuit && (
            <ProtectionSummaryCard items={protectionItems} />
          )}
          {tab === 'motorStart' && loadflow && (
            <MotorStartSummaryCard items={motorStartItems} />
          )}
          {tab === 'coordination' && shortcircuit && (
            <CoordinationSummaryCard items={relayResults} />
          )}
          {tab === 'arcFlash' && arcFlash && (
            <>
              <div style={{
                margin: '4px 8px 0', padding: '4px 10px',
                background: '#fff8e8', border: '1px solid #e0a000',
                borderRadius: 2, display: 'flex', gap: 8, alignItems: 'center',
                fontFamily: "'Segoe UI','Malgun Gothic',Arial,sans-serif",
                flexShrink: 0,
              }}>
                <span style={{ fontSize: 11, color: '#8a5000', fontWeight: 700, flexShrink: 0 }}>⚠</span>
                <span style={{ fontSize: 8.5, color: '#5a3800', lineHeight: 1.5 }}>
                  <strong>
                    {arcFlash.method === 'IEEE_1584_2018_enhanced'
                      ? 'IEEE 1584-2018 Enhanced Model 적용.'
                      : 'IEEE 1584-2002 간략식 적용.'}
                  </strong>
                  &nbsp;대표 경험 상수 사용 — 최종 PPE 선정 전 공인 엔지니어의 검증 필수.
                </span>
              </div>
              <ArcFlashSummaryCard items={arcFlashItems} />
            </>
          )}
          {tab === 'contingency' && (
            <ContingencySummaryCard items={contingencyCases} />
          )}
          {tab === 'tcc' && shortcircuit && (
            <CoordinationSummaryCard items={relayResults} />
          )}
          {tab === 'harmonics' && harmonics && (
            <HarmonicsSummaryCard
              buses={Object.values(harmonics.buses)}
              sources={harmonics.sources}
            />
          )}
          {tab === 'harmonics' && !harmonics && (
            <span style={{ fontSize: 9, color: '#8a9aaa', fontFamily: 'Consolas, monospace', whiteSpace: 'nowrap' }}>
              IEEE 519 · Harmonics 계산을 먼저 실행하세요
            </span>
          )}
          {tab === 'cableSizing' && (
            <CableSizingSummaryCard items={cableSizingItems} />
          )}
        </div>

        {/* CSV Export */}
        <div style={{ display: 'flex', alignItems: 'center', padding: '0 10px', flexShrink: 0 }}>
          <button
            onClick={handleExport}
            style={{
              padding: '2px 10px',
              fontSize: 9, fontWeight: 600,
              fontFamily: "'Segoe UI', sans-serif",
              background: '#e8ecf0',
              border: '1px solid #a0b0c0',
              borderRadius: 2,
              cursor: 'pointer', color: '#1a3a5a',
            }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = '#d4dce6' }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = '#e8ecf0' }}
          >
            ↓ CSV
          </button>
        </div>
      </div>

      {/* ── Table area (탭별 컴포넌트) ── */}
      {tab === 'lf' && (
        <LoadFlowTab
          busRows={busLFRows} trRows={trLFRows} cableRows={cableLFRows} motorRows={motorLFRows}
          selectedNodeId={selectedNodeId} selectedEdgeId={selectedEdgeId} onRowClick={handleResultRowClick}
        />
      )}

      {tab === 'sc' && (
        <ShortCircuitTab rows={busSCRows} selectedNodeId={selectedNodeId} onRowClick={handleResultRowClick} />
      )}

      {tab === 'asymFault' && asymFault && (
        <AsymFaultTab nodes={nodes} asymFault={asymFault} />
      )}

      {tab === 'pfc' && pfcResult && (
        <PfcTab pfcResult={pfcResult} />
      )}

      {tab === 'studyCase' && (
        <StudyCaseTab
          studyCases={studyCases} baseline={baseline} setBaseline={setBaseline}
          saveCase={saveCase} deleteCase={deleteCase}
          loadflow={loadflow} shortcircuit={shortcircuit} nodes={nodes}
        />
      )}

      {tab === 'calcLog' && (
        <CalcLogTab calcLogEntries={calcLogEntries} />
      )}

      {tab === 'protection' && (
        <ProtectionTab rows={protectionRows} selectedNodeId={selectedNodeId} onRowClick={handleResultRowClick} />
      )}

      {tab === 'coordination' && (
        <CoordinationTab rows={coordinationRows} selectedNodeId={selectedNodeId} onRowClick={handleResultRowClick} />
      )}

      {tab === 'motorStart' && (
        <MotorStartTab rows={motorStartRows} selectedNodeId={selectedNodeId} onRowClick={handleResultRowClick} />
      )}

      {tab === 'arcFlash' && (
        <ArcFlashTab arcFlash={arcFlash} rows={arcFlashRows} selectedNodeId={selectedNodeId} onRowClick={handleResultRowClick} />
      )}

      {tab === 'contingency' && (
        <ContingencyTab rows={contingencyRows} selectedNodeId={selectedNodeId} onRowClick={handleResultRowClick} />
      )}

      {tab === 'tcc' && (
        <TCCTab relayResults={relayResults} tccData={tccData} />
      )}

      {tab === 'relay87t' && (
        <Relay87tTab relay87tResults={relay87tResults} selectedNodeId={selectedNodeId} onRowClick={handleResultRowClick} />
      )}

      {tab === 'harmonics' && (
        <HarmonicsTab rows={harmonicBusRows} selectedNodeId={selectedNodeId} onRowClick={handleResultRowClick} harmonics={harmonics} />
      )}

      {tab === 'cableSizing' && (
        <CableSizingTab rows={cableSizingRows} selectedEdgeId={selectedEdgeId} onRowClick={handleResultRowClick} />
      )}

      {tab === 'voltageChart' && (
        <div style={{ flex: 1, overflow: 'hidden' }}>
          <BusVoltageChart rows={busLFRows} />
        </div>
      )}
    </div>
  )
}
