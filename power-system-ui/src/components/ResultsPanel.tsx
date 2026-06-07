import { useState, useMemo, useEffect } from 'react'
import type { Bus, Motor, ProtectionItem, MotorStartResult, RelayResult, ArcFlashResult, ArcFlashRiskLevel, ContingencyResult, HarmonicBusResult, HarmonicSourceResult, CableSizingResult, DifferentialRelayResult } from '../types'
import { useAnalysisStore, type CalcType } from '../store/useAnalysisStore'
import { useCalcLogStore } from '../store/useCalcLogStore'
import { useEquipmentStore } from '../store/useEquipmentStore'
import { useStudyCaseStore } from '../store/useStudyCaseStore'
import { useProjectStore } from '../store/useProjectStore'
import { computeProtectionItems } from '../utils/computeProtection'
import { computeRelayResults, computeDifferentialRelayResults } from '../engine/protectionCoordination'
import { buildTCCData } from '../engine/tcc'
import { computePowerFactorCorrection } from '../engine/powerFactor'
import TCCChart from './TCCChart'
import HarmonicChart from './HarmonicChart'

// ── Types ────────────────────────────────────────────────────────────────────
type TabId = 'lf' | 'sc' | 'asymFault' | 'protection' | 'motorStart' | 'coordination' | 'arcFlash' | 'contingency' | 'tcc' | 'harmonics' | 'cableSizing' | 'voltageChart' | 'pfc' | 'relay87t' | 'studyCase' | 'calcLog'
type RowData = Record<string, unknown> & { id: string }

interface ColDef {
  key:    string
  header: string
  right?: boolean
  toStr?: (v: unknown) => string   // display formatter; CSV uses raw value
}

// ── Column definitions ───────────────────────────────────────────────────────
const f = (decimals: number) => (v: unknown) =>
  v === undefined || v === null ? '—' : (v as number).toFixed(decimals)

const BUS_LF_COLS: ColDef[] = [
  { key: 'name',       header: 'Bus' },
  { key: 'vn_kv',     header: 'kV',        right: true },
  { key: 'vm_pu',     header: 'V (pu)',     right: true, toStr: f(4) },
  { key: 'va_degree', header: 'Angle (°)',  right: true, toStr: f(3) },
  { key: 'p_mw',      header: 'P (MW)',     right: true, toStr: f(3) },
  { key: 'q_mvar',    header: 'Q (Mvar)',   right: true, toStr: f(3) },
  { key: 'ikss_ka',   header: 'Ik" (kA)',   right: true, toStr: f(3) },
]

const BUS_SC_COLS: ColDef[] = [
  { key: 'name',         header: 'Bus' },
  { key: 'vn_kv',       header: 'kV',            right: true },
  { key: 'ikss_ka',     header: 'Ik" (kA)',      right: true, toStr: f(3) },
  { key: 'ip_ka',       header: 'Ip (kA)',       right: true, toStr: f(3) },
  { key: 'ib_ka',       header: 'Ib (kA)',       right: true, toStr: f(3) },
  { key: 'ith_ka',      header: 'Ith (kA)',      right: true, toStr: f(3) },
  { key: 'ikss_ka_min', header: 'Ik"_min (kA)', right: true, toStr: f(3) },
  { key: 'skss_mva',    header: 'Sk" (MVA)',     right: true, toStr: f(1) },
]

const TR_LF_COLS: ColDef[] = [
  { key: 'name',            header: 'Transformer' },
  { key: 'loading_percent', header: 'Loading (%)', right: true, toStr: f(1) },
  { key: 'pl_kw',          header: 'Loss (kW)',   right: true, toStr: f(2) },
]

const CABLE_LF_COLS: ColDef[] = [
  { key: 'name',            header: 'Cable' },
  { key: 'i_a',             header: 'I (A)',       right: true, toStr: f(1) },
  { key: 'loading_percent', header: 'Loading (%)', right: true, toStr: f(1) },
  { key: 'vdrop_percent',   header: 'ΔV (%)',      right: true, toStr: f(3) },
]

const COORDINATION_COLS: ColDef[] = [
  { key: 'breakerName',            header: 'Breaker' },
  { key: 'busName',                header: 'Bus' },
  { key: 'fault_current_ka',       header: 'Ik" (kA)',      right: true, toStr: f(3) },
  { key: 'breaking_capacity_ka',   header: 'Brk Cap (kA)',  right: true, toStr: f(1) },
  { key: 'cap_margin_percent',     header: 'Cap Margin (%)',right: true, toStr: f(1) },
  { key: 'curve_label',            header: 'Curve' },
  { key: 'pickup_current_a',       header: 'Pickup (A)',    right: true },
  { key: 'time_dial',              header: 'TMS',           right: true, toStr: f(2) },
  { key: 'relay_operating_time_s', header: 'Trip (s)',      right: true, toStr: (v) => v === 0 ? 'INST' : (v as number).toFixed(3) },
  { key: 'inst_label',             header: 'Inst' },
  { key: 'margin_label',           header: 'Coord (s)',     right: true },
  { key: 'status',                 header: 'Status' },
]

const CURVE_LABELS: Record<string, string> = {
  IEC_NORMAL_INVERSE:    'Normal',
  IEC_VERY_INVERSE:      'Very',
  IEC_EXTREMELY_INVERSE: 'Extr.',
}

const MOTOR_START_COLS: ColDef[] = [
  { key: 'name',                header: 'Motor' },
  { key: 'starting_method',     header: 'Method' },
  { key: 'running_current_a',   header: 'Irated (A)',    right: true, toStr: f(1) },
  { key: 'start_current_a',     header: 'Istart (A)',    right: true, toStr: f(1) },
  { key: 'start_mva',           header: 'Start MVA',     right: true, toStr: f(3) },
  { key: 'terminal_voltage_pu', header: 'Voltage (pu)',  right: true, toStr: f(4) },
  { key: 'voltage_drop_percent',header: 'Drop (%)',      right: true, toStr: f(2) },
  { key: 'status',              header: 'Status' },
]

const MOTOR_LF_COLS: ColDef[] = [
  { key: 'name',               header: 'Motor' },
  { key: 'rated_kw',          header: 'Rated (kW)',  right: true },
  { key: 'p_mw',              header: 'P in (MW)',   right: true, toStr: f(4) },
  { key: 'q_mvar',            header: 'Q (Mvar)',    right: true, toStr: f(4) },
  { key: 'running_current_a', header: 'Ir (A)',      right: true, toStr: f(1) },
  { key: 'starting_current_a',header: 'Is (A)',      right: true, toStr: f(1) },
  { key: 'starting_method',   header: 'Method' },
]

const ARC_FLASH_COLS: ColDef[] = [
  { key: 'busName',               header: 'Bus' },
  { key: 'vn_kv',                header: 'kV',          right: true },
  { key: 'ikss_ka',              header: 'Ik" (kA)',    right: true, toStr: f(3) },
  { key: 'iarc_ka',              header: 'Iarc (kA)',   right: true, toStr: f(3) },
  { key: 'clearing_time_s',      header: 't_clear (s)', right: true, toStr: f(3) },
  { key: 'working_distance_mm',  header: 'd (mm)',      right: true },
  { key: 'incident_energy_cal',  header: 'IE (cal/cm²)',right: true, toStr: f(2) },
  { key: 'arc_flash_boundary_m', header: 'AFB (m)',     right: true, toStr: f(3) },
  { key: 'ppe_label',            header: 'PPE Cat' },
  { key: 'risk_level',           header: 'Risk' },
]

const CONTINGENCY_COLS: ColDef[] = [
  { key: 'equipmentName',    header: 'Equipment' },
  { key: 'equipmentType',    header: 'Type' },
  { key: 'severity',         header: 'Status' },
  { key: 'minV',             header: 'Min V (pu)',     right: true, toStr: f(4) },
  { key: 'maxLoading',       header: 'Max Load (%)',   right: true, toStr: f(1) },
  { key: 'islandCount',      header: 'Islands',        right: true },
  { key: 'uvCount',          header: 'U/V Buses',      right: true },
  { key: 'overloadCount',    header: 'Overloads',      right: true },
]

const HARMONIC_BUS_COLS: ColDef[] = [
  { key: 'busName',                  header: 'Bus' },
  { key: 'vn_kv',                   header: 'kV',           right: true },
  { key: 'thdv_percent',            header: 'THDv (%)',     right: true, toStr: f(2) },
  { key: 'h5',                      header: 'h5 (%)',       right: true, toStr: f(2) },
  { key: 'h7',                      header: 'h7 (%)',       right: true, toStr: f(2) },
  { key: 'h11',                     header: 'h11 (%)',      right: true, toStr: f(2) },
  { key: 'h13',                     header: 'h13 (%)',      right: true, toStr: f(2) },
  { key: 'h23',                     header: 'h23 (%)',      right: true, toStr: f(2) },
  { key: 'h25',                     header: 'h25 (%)',      right: true, toStr: f(2) },
  { key: 'max_order',               header: 'Max Order',    right: true },
  { key: 'max_distortion_percent',  header: 'Worst D (%)',  right: true, toStr: f(2) },
  { key: 'ieee519_limit',           header: 'Limit (%)',    right: true },
  { key: 'status',                  header: 'Status' },
]

const HARMONIC_SRC_COLS: ColDef[] = [
  { key: 'sourceName',   header: 'Source' },
  { key: 'sourceType',   header: 'Type' },
  { key: 'busName',      header: 'Bus' },
  { key: 'i_fund_a',     header: 'I_fund (A)',   right: true, toStr: f(1) },
  { key: 'thdi_percent', header: 'THDi (%)',     right: true, toStr: f(1) },
  { key: 'h5_a',         header: 'h5 (A)',       right: true, toStr: f(2) },
  { key: 'h7_a',         header: 'h7 (A)',       right: true, toStr: f(2) },
  { key: 'h11_a',        header: 'h11 (A)',      right: true, toStr: f(2) },
]

const CABLE_SIZING_COLS: ColDef[] = [
  { key: 'cableName',          header: 'Cable' },
  { key: 'route',              header: 'Route' },
  { key: 'vn_kv',             header: 'kV',           right: true },
  { key: 'loadCurrentA',       header: 'I_load (A)',   right: true, toStr: f(1) },
  { key: 'ampacityA',          header: 'Ampacity (A)', right: true, toStr: f(0) },
  { key: 'voltageDropPercent', header: 'ΔV (%)',       right: true, toStr: f(2) },
  { key: 'shortCircuitKA',     header: 'Ik″ (kA)',     right: true, toStr: f(3) },
  { key: 'existingMM2',        header: 'Exist (mm²)',  right: true },
  { key: 'recommendedModel',   header: 'Recommended' },
  { key: 'status',             header: 'Status' },
]

const RELAY_87T_COLS: ColDef[] = [
  { key: 'breakerName',        header: 'Relay (Breaker)' },
  { key: 'transformerName',    header: 'Transformer' },
  { key: 'rated_current_hv_a', header: 'In_HV (A)',   right: true },
  { key: 'rated_current_lv_a', header: 'In_LV (A)',   right: true },
  { key: 'diff_current_pct',   header: 'Idiff (%In)', right: true, toStr: f(2) },
  { key: 'restrain_current_a', header: 'Ires (A)',    right: true },
  { key: 'inrush_label',       header: '2nd Harm.' },
  { key: 'status',             header: 'Status' },
]

const PROTECTION_COLS: ColDef[] = [
  { key: 'breakerName',              header: 'Device' },
  { key: 'busName',                  header: 'Bus' },
  { key: 'busVn_kv',                header: 'kV',             right: true },
  { key: 'ikss_ka',                 header: 'Ik" (kA)',       right: true, toStr: f(3) },
  { key: 'ip_ka',                   header: 'Ip (kA)',        right: true, toStr: f(3) },
  { key: 'breaking_capacity_ka',    header: 'Breaking (kA)',  right: true, toStr: f(1) },
  { key: 'making_capacity_ka',      header: 'Making (kA)',    right: true, toStr: f(1) },
  { key: 'breaking_margin_percent', header: 'Brk Margin (%)', right: true, toStr: f(1) },
  { key: 'making_margin_percent',   header: 'Mk Margin (%)',  right: true, toStr: f(1) },
  { key: 'status',                  header: 'Status' },
]

// ── Color helpers ────────────────────────────────────────────────────────────
function vmColor(vm_pu: number): string {
  if (vm_pu < 0.95)  return '#b02000'
  if (vm_pu < 0.98)  return '#8a5a00'
  if (vm_pu <= 1.05) return '#006020'
  return '#a04a00'
}

function marginColor(margin_percent: number): string {
  if (margin_percent > 20)  return '#006020'  // green
  if (margin_percent >= 0)  return '#8a5a00'  // amber
  return '#b02000'                             // red
}

function startStatusColor(v: number): string {
  if (v >= 0.85) return '#006020'  // green — PASS
  if (v >= 0.80) return '#8a5a00'  // amber — WARNING
  return '#b02000'                  // red   — FAIL
}

function startStatusLabel(v: number): 'PASS' | 'WARNING' | 'FAIL' {
  if (v >= 0.85) return 'PASS'
  if (v >= 0.80) return 'WARNING'
  return 'FAIL'
}

function arcRiskColor(risk: ArcFlashRiskLevel): string {
  switch (risk) {
    case 'LOW':     return '#006020'
    case 'MEDIUM':  return '#8a5a00'
    case 'HIGH':    return '#b04000'
    case 'EXTREME': return '#b02000'
  }
}

function arcRiskBg(risk: ArcFlashRiskLevel): string {
  switch (risk) {
    case 'LOW':     return '#e6f4ec'
    case 'MEDIUM':  return '#fff5dc'
    case 'HIGH':    return '#fff0e0'
    case 'EXTREME': return '#fde8e8'
  }
}

// ── CSV export ───────────────────────────────────────────────────────────────
function exportCSV(cols: ColDef[], rows: RowData[], filename: string) {
  const header = cols.map(c => c.header).join(',')
  const body   = rows.map(r =>
    cols.map(c => {
      const v = r[c.key]
      if (v === undefined || v === null) return ''
      const s = String(v)
      return s.includes(',') ? `"${s}"` : s
    }).join(',')
  )
  const blob = new Blob([[header, ...body].join('\n')], { type: 'text/csv;charset=utf-8;' })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  a.href = url; a.download = filename; a.click()
  URL.revokeObjectURL(url)
}

// ── Sub-components ───────────────────────────────────────────────────────────
function TabGroupLabel({ label }: { label: string }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center',
      padding: '0 6px',
      fontSize: 7.5, fontWeight: 700,
      color: '#8a9aaa',
      letterSpacing: '0.08em', textTransform: 'uppercase',
      whiteSpace: 'nowrap', flexShrink: 0,
      borderRight: '1px solid #ccd4dc',
    }}>
      {label}
    </div>
  )
}

function TabGroupDivider() {
  return (
    <div style={{
      width: 1, background: '#a8b4c0',
      margin: '6px 4px', flexShrink: 0,
    }} />
  )
}

function PanelTab({ label, active, disabled, onClick }: {
  label: string; active: boolean; disabled?: boolean; onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        padding: '0 14px',
        height: '100%',
        background: active ? '#f4f6f8' : 'transparent',
        border: 'none',
        borderRight: '1px solid #b4bec8',
        marginBottom: active ? -2 : 0,
        borderBottom: active ? '2px solid #f4f6f8' : 'none',
        fontSize: 10,
        fontWeight: active ? 700 : 400,
        color: disabled ? '#b0bcc8' : (active ? '#0a1828' : '#4a5a6a'),
        cursor: disabled ? 'default' : 'pointer',
        fontFamily: "'Segoe UI', 'Malgun Gothic', sans-serif",
        letterSpacing: '0.02em',
        flexShrink: 0,
      }}
    >
      {label}
    </button>
  )
}

function SummaryCard({ converged, meta }: {
  converged: boolean
  meta?: { iterationCount: number; maxMismatch: number; elapsedMs: number } | null
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <span style={{
        fontSize: 9.5, fontWeight: 700,
        padding: '1px 8px',
        background: converged ? '#e6f4ec' : '#fde8e8',
        color:      converged ? '#005a20' : '#8a0000',
        border:     `1px solid ${converged ? '#80b090' : '#e08080'}`,
        borderRadius: 2, whiteSpace: 'nowrap',
      }}>
        {converged ? '✓ Converged' : '✗ Not Converged'}
      </span>
      {meta && (
        <>
          <MetaChip label="Iter"  val={String(meta.iterationCount)} />
          <MetaChip label="ΔMax"  val={meta.maxMismatch.toExponential(2) + ' pu'} />
          <MetaChip label="Time"  val={meta.elapsedMs.toFixed(1) + ' ms'} />
        </>
      )}
    </div>
  )
}

function MetaChip({ label, val }: { label: string; val: string }) {
  return (
    <span style={{ fontSize: 9, fontFamily: 'Consolas, monospace', color: '#3a4a5a', whiteSpace: 'nowrap' }}>
      <span style={{ color: '#8a9aaa', marginRight: 2 }}>{label}:</span>
      <span style={{ fontWeight: 600 }}>{val}</span>
    </span>
  )
}

function ProtectionSummaryCard({ items }: { items: ProtectionItem[] }) {
  if (items.length === 0) {
    return (
      <span style={{ fontSize: 9, color: '#8a9aaa', fontFamily: 'Consolas, monospace', whiteSpace: 'nowrap' }}>
        IEC 62271 · SC 결과와 연결된 차단기 없음
      </span>
    )
  }
  const total  = items.length
  const passed = items.filter(i => i.pass).length
  const failed = total - passed
  const worstMargin = Math.min(
    ...items.map(i => Math.min(i.breaking_margin_percent, i.making_margin_percent))
  )

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <MetaChip label="Total" val={String(total)} />
      {failed === 0 ? (
        <span style={{
          fontSize: 9.5, fontWeight: 700, padding: '1px 7px',
          background: '#e6f4ec', color: '#005a20',
          border: '1px solid #80b090', borderRadius: 2, whiteSpace: 'nowrap',
        }}>
          ✓ {total} PASS
        </span>
      ) : (
        <>
          <span style={{
            fontSize: 9.5, fontWeight: 700, padding: '1px 7px',
            background: '#e6f4ec', color: '#005a20',
            border: '1px solid #80b090', borderRadius: 2, whiteSpace: 'nowrap',
          }}>
            ✓ {passed} PASS
          </span>
          <span style={{
            fontSize: 9.5, fontWeight: 700, padding: '1px 7px',
            background: '#fde8e8', color: '#8a0000',
            border: '1px solid #e08080', borderRadius: 2, whiteSpace: 'nowrap',
          }}>
            ✗ {failed} FAIL
          </span>
        </>
      )}
      <MetaChip label="Worst Margin" val={`${worstMargin.toFixed(1)}%`} />
    </div>
  )
}

function CoordinationSummaryCard({ items }: { items: RelayResult[] }) {
  if (items.length === 0) {
    return (
      <span style={{ fontSize: 9, color: '#8a9aaa', fontFamily: 'Consolas, monospace', whiteSpace: 'nowrap' }}>
        IEC 60255 · SC 결과와 연결된 계전기 없음
      </span>
    )
  }
  const passed = items.filter(i => i.pass).length
  const failed = items.length - passed
  const worstMargin = items
    .filter(i => isFinite(i.coordination_margin_s))
    .reduce((m, i) => Math.min(m, i.coordination_margin_s), Infinity)
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <MetaChip label="Total" val={String(items.length)} />
      {failed === 0 ? (
        <span style={{
          fontSize: 9.5, fontWeight: 700, padding: '1px 7px',
          background: '#e6f4ec', color: '#005a20',
          border: '1px solid #80b090', borderRadius: 2, whiteSpace: 'nowrap',
        }}>✓ {passed} PASS</span>
      ) : (
        <>
          <span style={{
            fontSize: 9.5, fontWeight: 700, padding: '1px 7px',
            background: '#e6f4ec', color: '#005a20',
            border: '1px solid #80b090', borderRadius: 2, whiteSpace: 'nowrap',
          }}>✓ {passed} PASS</span>
          <span style={{
            fontSize: 9.5, fontWeight: 700, padding: '1px 7px',
            background: '#fde8e8', color: '#8a0000',
            border: '1px solid #e08080', borderRadius: 2, whiteSpace: 'nowrap',
          }}>✗ {failed} FAIL</span>
        </>
      )}
      {isFinite(worstMargin) && (
        <MetaChip label="Worst Margin" val={`${worstMargin.toFixed(3)} s`} />
      )}
    </div>
  )
}

function MotorStartSummaryCard({ items }: { items: MotorStartResult[] }) {
  if (items.length === 0) {
    return (
      <span style={{ fontSize: 9, color: '#8a9aaa', fontFamily: 'Consolas, monospace', whiteSpace: 'nowrap' }}>
        No motors in network
      </span>
    )
  }
  const pass    = items.filter(i => i.terminal_voltage_pu >= 0.85).length
  const warning = items.filter(i => i.terminal_voltage_pu >= 0.80 && i.terminal_voltage_pu < 0.85).length
  const fail    = items.filter(i => i.terminal_voltage_pu < 0.80).length
  const worstV  = Math.min(...items.map(i => i.terminal_voltage_pu))
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <MetaChip label="Total" val={String(items.length)} />
      {pass > 0 && (
        <span style={{
          fontSize: 9.5, fontWeight: 700, padding: '1px 7px',
          background: '#e6f4ec', color: '#005a20',
          border: '1px solid #80b090', borderRadius: 2, whiteSpace: 'nowrap',
        }}>✓ {pass} PASS</span>
      )}
      {warning > 0 && (
        <span style={{
          fontSize: 9.5, fontWeight: 700, padding: '1px 7px',
          background: '#fff5dc', color: '#8a5a00',
          border: '1px solid #c8a040', borderRadius: 2, whiteSpace: 'nowrap',
        }}>⚠ {warning} WARN</span>
      )}
      {fail > 0 && (
        <span style={{
          fontSize: 9.5, fontWeight: 700, padding: '1px 7px',
          background: '#fde8e8', color: '#8a0000',
          border: '1px solid #e08080', borderRadius: 2, whiteSpace: 'nowrap',
        }}>✗ {fail} FAIL</span>
      )}
      <MetaChip label="Worst V" val={`${worstV.toFixed(4)} pu`} />
    </div>
  )
}

function ArcFlashSummaryCard({ items }: { items: ArcFlashResult[] }) {
  if (items.length === 0) {
    return (
      <span style={{ fontSize: 9, color: '#8a9aaa', fontFamily: 'Consolas, monospace', whiteSpace: 'nowrap' }}>
        IEEE 1584 · SC 결과 없음
      </span>
    )
  }
  const extreme = items.filter(i => i.risk_level === 'EXTREME').length
  const high    = items.filter(i => i.risk_level === 'HIGH').length
  const medium  = items.filter(i => i.risk_level === 'MEDIUM').length
  const low     = items.filter(i => i.risk_level === 'LOW').length
  const maxIE   = Math.max(...items.map(i => i.incident_energy_cal))
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <MetaChip label="Buses" val={String(items.length)} />
      {low > 0 && (
        <span style={{ fontSize: 9.5, fontWeight: 700, padding: '1px 7px',
          background: '#e6f4ec', color: '#005a20', border: '1px solid #80b090', borderRadius: 2, whiteSpace: 'nowrap' }}>
          LOW {low}
        </span>
      )}
      {medium > 0 && (
        <span style={{ fontSize: 9.5, fontWeight: 700, padding: '1px 7px',
          background: '#fff5dc', color: '#8a5a00', border: '1px solid #c8a040', borderRadius: 2, whiteSpace: 'nowrap' }}>
          MED {medium}
        </span>
      )}
      {high > 0 && (
        <span style={{ fontSize: 9.5, fontWeight: 700, padding: '1px 7px',
          background: '#fff0e0', color: '#b04000', border: '1px solid #d08040', borderRadius: 2, whiteSpace: 'nowrap' }}>
          HIGH {high}
        </span>
      )}
      {extreme > 0 && (
        <span style={{ fontSize: 9.5, fontWeight: 700, padding: '1px 7px',
          background: '#fde8e8', color: '#8a0000', border: '1px solid #e08080', borderRadius: 2, whiteSpace: 'nowrap' }}>
          ⚠ EXTREME {extreme}
        </span>
      )}
      <MetaChip label="Max IE" val={`${maxIE.toFixed(1)} cal`} />
    </div>
  )
}

function ContingencySummaryCard({ items }: { items: ContingencyResult[] }) {
  if (items.length === 0) {
    return (
      <span style={{ fontSize: 9, color: '#8a9aaa', fontFamily: 'Consolas, monospace', whiteSpace: 'nowrap' }}>
        N-1 · 분석 대상 없음
      </span>
    )
  }
  const pass    = items.filter(i => i.severity === 'PASS').length
  const warning = items.filter(i => i.severity === 'WARNING').length
  const fail    = items.filter(i => i.severity === 'FAIL').length

  const voltages = items.map(i => i.minVoltagePu).filter(v => isFinite(v) && !isNaN(v))
  const loadings = items.map(i => i.maxLoadingPercent).filter(v => isFinite(v) && !isNaN(v))
  const worstV   = voltages.length ? Math.min(...voltages) : null
  const worstL   = loadings.length ? Math.max(...loadings) : null

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <MetaChip label="Cases" val={String(items.length)} />
      {pass > 0 && (
        <span style={{ fontSize: 9.5, fontWeight: 700, padding: '1px 7px',
          background: '#e6f4ec', color: '#005a20', border: '1px solid #80b090', borderRadius: 2, whiteSpace: 'nowrap' }}>
          ✓ {pass} PASS
        </span>
      )}
      {warning > 0 && (
        <span style={{ fontSize: 9.5, fontWeight: 700, padding: '1px 7px',
          background: '#fff5dc', color: '#8a5a00', border: '1px solid #c8a040', borderRadius: 2, whiteSpace: 'nowrap' }}>
          ⚠ {warning} WARN
        </span>
      )}
      {fail > 0 && (
        <span style={{ fontSize: 9.5, fontWeight: 700, padding: '1px 7px',
          background: '#fde8e8', color: '#8a0000', border: '1px solid #e08080', borderRadius: 2, whiteSpace: 'nowrap' }}>
          ✗ {fail} FAIL
        </span>
      )}
      {worstV !== null && <MetaChip label="Worst V" val={`${worstV.toFixed(3)} pu`} />}
      {worstL !== null && <MetaChip label="Worst Load" val={`${worstL.toFixed(1)}%`} />}
    </div>
  )
}

function HarmonicsSummaryCard({ buses, sources }: { buses: HarmonicBusResult[]; sources: HarmonicSourceResult[] }) {
  if (buses.length === 0) {
    return (
      <span style={{ fontSize: 9, color: '#8a9aaa', fontFamily: 'Consolas, monospace', whiteSpace: 'nowrap' }}>
        IEEE 519 · 고조파 소스 없음 (Motor/Load에서 Harmonic 활성화 필요)
      </span>
    )
  }
  const pass  = buses.filter(b => b.ieee519_pass).length
  const fail  = buses.length - pass
  const worst = Math.max(...buses.map(b => b.thdv_percent))
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <MetaChip label="Buses" val={String(buses.length)} />
      <MetaChip label="Sources" val={String(sources.length)} />
      {pass > 0 && (
        <span style={{ fontSize: 9.5, fontWeight: 700, padding: '1px 7px',
          background: '#e6f4ec', color: '#005a20', border: '1px solid #80b090', borderRadius: 2, whiteSpace: 'nowrap' }}>
          ✓ {pass} PASS
        </span>
      )}
      {fail > 0 && (
        <span style={{ fontSize: 9.5, fontWeight: 700, padding: '1px 7px',
          background: '#fde8e8', color: '#8a0000', border: '1px solid #e08080', borderRadius: 2, whiteSpace: 'nowrap' }}>
          ✗ {fail} FAIL
        </span>
      )}
      <MetaChip label="Worst THDv" val={`${worst.toFixed(2)}%`} />
    </div>
  )
}

function CableSizingSummaryCard({ items }: { items: CableSizingResult[] }) {
  if (items.length === 0) {
    return (
      <span style={{ fontSize: 9, color: '#8a9aaa', fontFamily: 'Consolas, monospace', whiteSpace: 'nowrap' }}>
        IEC 60364 · 케이블 없음
      </span>
    )
  }
  const pass    = items.filter(i => i.severity === 'PASS').length
  const warning = items.filter(i => i.severity === 'WARNING').length
  const fail    = items.filter(i => i.severity === 'FAIL').length
  const worstDv = Math.max(...items.map(i => i.voltageDropPercent))
  const worstMargin = Math.min(...items.map(i =>
    i.ampacityA > 0 ? ((i.ampacityA - i.loadCurrentA) / i.ampacityA) * 100 : 100
  ))
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <MetaChip label="Cables" val={String(items.length)} />
      {pass > 0 && (
        <span style={{ fontSize: 9.5, fontWeight: 700, padding: '1px 7px',
          background: '#e6f4ec', color: '#005a20', border: '1px solid #80b090', borderRadius: 2, whiteSpace: 'nowrap' }}>
          ✓ {pass} PASS
        </span>
      )}
      {warning > 0 && (
        <span style={{ fontSize: 9.5, fontWeight: 700, padding: '1px 7px',
          background: '#fff5dc', color: '#8a5a00', border: '1px solid #c8a040', borderRadius: 2, whiteSpace: 'nowrap' }}>
          ⚠ {warning} WARN
        </span>
      )}
      {fail > 0 && (
        <span style={{ fontSize: 9.5, fontWeight: 700, padding: '1px 7px',
          background: '#fde8e8', color: '#8a0000', border: '1px solid #e08080', borderRadius: 2, whiteSpace: 'nowrap' }}>
          ✗ {fail} FAIL
        </span>
      )}
      <MetaChip label="Worst ΔV" val={`${worstDv.toFixed(2)}%`} />
      <MetaChip label="Min Amp Margin" val={`${worstMargin.toFixed(1)}%`} />
    </div>
  )
}

// ── Bus Voltage Profile Chart ─────────────────────────────────────────────────
function BusVoltageChart({ rows }: { rows: RowData[] }) {
  const FONT = "'Segoe UI', 'Malgun Gothic', Consolas, monospace"
  const hasData = rows.some(r => r.vm_pu !== undefined)

  if (!hasData) {
    return (
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        height: '100%', color: '#9aaabb', fontSize: 11, fontFamily: FONT,
      }}>
        Load Flow 결과 없음 — Load Flow를 먼저 실행하세요
      </div>
    )
  }

  // ── Layout ──────────────────────────────────────────────────────────────────
  const MT = 18, MB = 56, ML = 46, MR = 14
  const PH = 130                      // plot height px
  const TOTAL_H = MT + PH + MB        // 204
  const BAR_W = 34, STEP = 52         // bar width + horizontal step per bus

  const filtered = rows.filter(r => r.vm_pu !== undefined)
  const svgW     = ML + filtered.length * STEP + MR

  // Y domain: 0.85 → 1.10
  const YMIN = 0.85, YMAX = 1.10, YRANGE = YMAX - YMIN

  const yOf = (v: number) =>
    MT + PH - (Math.max(YMIN, Math.min(YMAX, v)) - YMIN) / YRANGE * PH

  const barColor = (vm: number) => {
    if (vm >= 0.95 && vm <= 1.05) return '#2e9a50'
    if (vm >= 0.90 && vm <= 1.10) return '#c8a000'
    return '#c03030'
  }

  const barBg = (vm: number) => {
    if (vm >= 0.95 && vm <= 1.05) return '#d8f4e4'
    if (vm >= 0.90 && vm <= 1.10) return '#fff3c0'
    return '#fde0e0'
  }

  // Y axis ticks
  const yTicks = [0.85, 0.90, 0.95, 1.00, 1.05, 1.10]

  // Reference line config
  const refLines = [
    { v: 1.05, color: '#c8a000', dash: '4,3',  label: '' },
    { v: 1.00, color: '#3a5a9a', dash: '',      label: '' },
    { v: 0.95, color: '#c8a000', dash: '4,3',  label: '' },
    { v: 0.90, color: '#c03030', dash: '3,3',  label: '' },
  ]

  // Summary
  const vms = filtered.map(r => r.vm_pu as number)
  const minV = Math.min(...vms), maxV = Math.max(...vms)
  const underV = vms.filter(v => v < 0.95).length
  const overV  = vms.filter(v => v > 1.05).length

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden', fontFamily: FONT }}>
      {/* Summary row */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 12,
        padding: '3px 12px',
        background: '#e8eef4', borderBottom: '1px solid #ccd4dc',
        flexShrink: 0, fontSize: 9.5,
      }}>
        <span style={{ color: '#5a6a7a', textTransform: 'uppercase', letterSpacing: '0.07em', fontWeight: 700 }}>
          버스 전압 프로파일
        </span>
        <span style={{ fontFamily: 'Consolas, monospace', color: '#1a3a7a' }}>
          N = {filtered.length}
        </span>
        <span style={{ fontFamily: 'Consolas, monospace', color: '#1a3a7a' }}>
          Min: <b>{minV.toFixed(4)}</b> pu
        </span>
        <span style={{ fontFamily: 'Consolas, monospace', color: '#1a3a7a' }}>
          Max: <b>{maxV.toFixed(4)}</b> pu
        </span>
        {underV > 0 && (
          <span style={{
            fontWeight: 700, padding: '0px 6px',
            background: '#fde0e0', color: '#c03030',
            border: '1px solid #e08080', borderRadius: 2,
          }}>
            ⚠ U/V {underV}개 &lt; 0.95 pu
          </span>
        )}
        {overV > 0 && (
          <span style={{
            fontWeight: 700, padding: '0px 6px',
            background: '#fff3c0', color: '#c8a000',
            border: '1px solid #d0a800', borderRadius: 2,
          }}>
            ⚠ O/V {overV}개 &gt; 1.05 pu
          </span>
        )}
      </div>

      {/* SVG chart */}
      <div style={{ flex: 1, overflowX: 'auto', overflowY: 'hidden' }}>
        <svg
          width={Math.max(svgW, 400)}
          height={TOTAL_H}
          style={{ display: 'block' }}
        >
          {/* Plot background */}
          <rect x={ML} y={MT} width={svgW - ML - MR} height={PH} fill="#fafbfc" />
          <rect x={ML} y={MT} width={svgW - ML - MR} height={PH} fill="none" stroke="#c8d0d8" strokeWidth={0.5} />

          {/* Out-of-range zones (shaded) */}
          {/* Below 0.95 zone */}
          <rect x={ML} y={yOf(0.95)} width={svgW - ML - MR} height={yOf(YMIN) - yOf(0.95)}
            fill="#fde0e0" opacity={0.35} />
          {/* Above 1.05 zone */}
          <rect x={ML} y={yOf(YMAX)} width={svgW - ML - MR} height={yOf(1.05) - yOf(YMAX)}
            fill="#fff3c0" opacity={0.35} />

          {/* Y axis ticks + grid lines */}
          {yTicks.map(v => {
            const y = yOf(v)
            return (
              <g key={v}>
                <line x1={ML} y1={y} x2={svgW - MR} y2={y}
                  stroke="#d8e0e8" strokeWidth={v === 1.00 ? 0.8 : 0.4} />
                <text x={ML - 4} y={y + 3} textAnchor="end"
                  fontSize={7.5} fill="#5a6a7a" fontFamily="Consolas, monospace">
                  {v.toFixed(2)}
                </text>
              </g>
            )
          })}

          {/* Reference lines */}
          {refLines.map(rl => {
            const y = yOf(rl.v)
            return (
              <line key={rl.v}
                x1={ML} y1={y} x2={svgW - MR} y2={y}
                stroke={rl.color}
                strokeWidth={rl.v === 1.00 ? 1.2 : 0.9}
                strokeDasharray={rl.dash || undefined}
                opacity={0.85}
              />
            )
          })}

          {/* Y axis label */}
          <text
            x={10} y={MT + PH / 2}
            textAnchor="middle" fontSize={8.5} fill="#3a4a5a"
            fontFamily={FONT} fontWeight="bold"
            transform={`rotate(-90, 10, ${MT + PH / 2})`}
          >
            Voltage (pu)
          </text>

          {/* Bars */}
          {filtered.map((row, i) => {
            const vm  = row.vm_pu as number
            const cx  = ML + i * STEP + STEP / 2
            const bx  = cx - BAR_W / 2
            const by  = yOf(vm)
            const bh  = Math.max(1, yOf(YMIN) - by)
            const col = barColor(vm)
            const bg  = barBg(vm)
            const busName = String(row.name ?? row.id).slice(0, 12)

            return (
              <g key={row.id}>
                {/* Bar background */}
                <rect x={bx} y={by} width={BAR_W} height={bh}
                  fill={bg} stroke={col} strokeWidth={0.8} rx={1} />

                {/* Value label above bar */}
                <text x={cx} y={Math.max(MT + 8, by - 3)}
                  textAnchor="middle" fontSize={7.5}
                  fontFamily="Consolas, monospace" fontWeight="700"
                  fill={col}>
                  {vm.toFixed(3)}
                </text>

                {/* Bus name label (rotated -45°) */}
                <text
                  x={cx} y={MT + PH + 12}
                  textAnchor="end" fontSize={8}
                  fontFamily={FONT} fill="#3a4a5a"
                  transform={`rotate(-42, ${cx}, ${MT + PH + 12})`}
                >
                  {busName}
                </text>
              </g>
            )
          })}

          {/* Legend */}
          {[
            { color: '#2e9a50', bg: '#d8f4e4', label: '0.95 ~ 1.05 pu (정상)' },
            { color: '#c8a000', bg: '#fff3c0', label: '0.90 ~ 0.95 / 1.05 ~ 1.10 pu (주의)' },
            { color: '#c03030', bg: '#fde0e0', label: '< 0.90 / > 1.10 pu (경고)' },
          ].map((leg, i) => {
            const lx = ML + (svgW - ML - MR) * 0.55 + i * 0
            const ly = MT + 6 + i * 14
            return (
              <g key={leg.label}>
                <rect x={svgW - MR - 165} y={ly - 6} width={10} height={8}
                  fill={leg.bg} stroke={leg.color} strokeWidth={0.8} rx={1} />
                <text x={svgW - MR - 152} y={ly}
                  fontSize={7.5} fill="#3a4a5a" fontFamily={FONT}>
                  {leg.label}
                </text>
              </g>
            )
          })}
        </svg>
      </div>
    </div>
  )
}

// ── Generic data table ────────────────────────────────────────────────────────
function DataTable({
  title, cols, rows, selectedId, onRowClick, cellStyle,
}: {
  title:       string
  cols:        ColDef[]
  rows:        RowData[]
  selectedId:  string | null
  onRowClick:  (id: string) => void
  cellStyle?:  (colKey: string, row: RowData) => React.CSSProperties | undefined
}) {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column',
      minWidth: 0, flex: 1,
      borderRight: '1px solid #ccd4dc',
      overflow: 'hidden',
    }}>
      {/* Section header */}
      <div style={{
        padding: '2px 8px', flexShrink: 0,
        fontSize: 8.5, fontWeight: 700, color: '#5a6a7a',
        background: '#e0e6ec',
        borderBottom: '1px solid #ccd4dc',
        textTransform: 'uppercase', letterSpacing: '0.07em', whiteSpace: 'nowrap',
      }}>
        {title} <span style={{ fontWeight: 400, color: '#8a9aaa' }}>({rows.length})</span>
      </div>

      {/* Scrollable area */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 9.5, fontFamily: 'Consolas, monospace' }}>
          <thead>
            <tr>
              {cols.map(col => (
                <th key={col.key} style={{
                  padding: '3px 7px',
                  fontSize: 8.5, fontWeight: 700, color: '#3a4a5a',
                  background: '#d4dae1',
                  borderBottom: '1px solid #b8c4ce',
                  textAlign: col.right ? 'right' : 'left',
                  whiteSpace: 'nowrap',
                  position: 'sticky', top: 0, zIndex: 1,
                }}>
                  {col.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={cols.length} style={{
                  padding: '10px 8px', textAlign: 'center',
                  color: '#9aaabb', fontSize: 9, fontFamily: "'Segoe UI', sans-serif",
                }}>
                  — no results —
                </td>
              </tr>
            ) : rows.map((row, ri) => {
              const isSelected = selectedId === row.id
              const baseBg     = ri % 2 === 1 ? '#f0f4f8' : '#ffffff'
              return (
                <tr
                  key={row.id}
                  onClick={() => onRowClick(row.id)}
                  style={{
                    background:  isSelected ? '#c8dcf4' : baseBg,
                    cursor:      'pointer',
                    borderLeft:  isSelected ? '2px solid #1a60c0' : '2px solid transparent',
                  }}
                  onMouseEnter={e => {
                    if (!isSelected) (e.currentTarget as HTMLElement).style.background = '#dde8f4'
                  }}
                  onMouseLeave={e => {
                    if (!isSelected) (e.currentTarget as HTMLElement).style.background = baseBg
                  }}
                >
                  {cols.map(col => {
                    const rawVal = row[col.key]
                    const display = col.toStr
                      ? col.toStr(rawVal)
                      : rawVal === undefined || rawVal === null
                        ? '—'
                        : String(rawVal)
                    const extra = cellStyle?.(col.key, row) ?? {}
                    return (
                      <td key={col.key} style={{
                        padding: '2px 7px',
                        textAlign:    col.right ? 'right' : 'left',
                        borderBottom: '1px solid #e8ecf0',
                        whiteSpace:   'nowrap',
                        ...extra,
                      }}>
                        {display === '—'
                          ? <span style={{ color: '#b8c4ce' }}>—</span>
                          : display}
                      </td>
                    )
                  })}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

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

  const harmonicSrcRows: RowData[] = (harmonics?.sources ?? []).map(s => ({
    id:           s.sourceId,
    sourceName:   s.sourceName,
    sourceType:   s.sourceType,
    busName:      s.busName,
    i_fund_a:     s.i_fund_a,
    thdi_percent: s.thdi_percent,
    h5_a:         s.harmonic_currents[5]  ?? 0,
    h7_a:         s.harmonic_currents[7]  ?? 0,
    h11_a:        s.harmonic_currents[11] ?? 0,
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

  // ── Cell style callbacks ──────────────────────────────────────────────────
  function busLFCellStyle(colKey: string, row: RowData): React.CSSProperties | undefined {
    if (colKey === 'vm_pu' && row.vm_pu !== undefined) {
      return { color: vmColor(row.vm_pu as number), fontWeight: 700 }
    }
    if (colKey === 'ikss_ka' && row.ikss_ka !== undefined) {
      return { color: '#6a006a' }
    }
    return undefined
  }

  function coordinationCellStyle(colKey: string, row: RowData): React.CSSProperties | undefined {
    const pass    = row._pass    as boolean | undefined
    const capOk   = row._cap_ok  as boolean | undefined
    const capMgn  = row._cap_margin as number | undefined
    const allPass = (pass !== false) && (capOk !== false)

    if (colKey === 'status') {
      return allPass
        ? { color: '#006020', fontWeight: 700 }
        : { color: '#b02000', fontWeight: 700 }
    }
    if (colKey === 'cap_margin_percent' && capMgn !== undefined) {
      return { color: marginColor(capMgn), fontWeight: 600 }
    }
    if (colKey === 'breaking_capacity_ka' && capOk === false) {
      return { color: '#b02000', fontWeight: 700 }
    }
    if (!pass && colKey !== 'breakerName' && colKey !== 'busName') {
      return { color: '#b02000' }
    }
    if (colKey === 'relay_operating_time_s' && row.inst_label === '⚡ Yes') {
      return { color: '#6a006a', fontWeight: 700 }
    }
    return undefined
  }

  function motorStartCellStyle(colKey: string, row: RowData): React.CSSProperties | undefined {
    const v = row.terminal_voltage_pu as number | undefined
    if (v === undefined) return undefined
    if (colKey === 'terminal_voltage_pu' || colKey === 'voltage_drop_percent') {
      return { color: startStatusColor(v), fontWeight: 700 }
    }
    if (colKey === 'status') {
      return { color: startStatusColor(v), fontWeight: 700 }
    }
    return undefined
  }

  function protectionCellStyle(colKey: string, row: RowData): React.CSSProperties | undefined {
    if (colKey === 'status') {
      return row.status === 'PASS'
        ? { color: '#006020', fontWeight: 700 }
        : { color: '#b02000', fontWeight: 700 }
    }
    if (colKey === 'breaking_margin_percent' && row.breaking_margin_percent !== undefined) {
      return { color: marginColor(row.breaking_margin_percent as number), fontWeight: 600 }
    }
    if (colKey === 'making_margin_percent' && row.making_margin_percent !== undefined) {
      return { color: marginColor(row.making_margin_percent as number), fontWeight: 600 }
    }
    return undefined
  }

  function contingencyCellStyle(colKey: string, row: RowData): React.CSSProperties | undefined {
    const sev = row._severity as ContingencyResult['severity'] | undefined
    if (!sev) return undefined
    const clr = sev === 'PASS' ? '#006020' : sev === 'WARNING' ? '#8a5a00' : '#b02000'
    const bg  = sev === 'PASS' ? '#e6f4ec' : sev === 'WARNING' ? '#fff5dc' : '#fde8e8'
    if (colKey === 'severity') return { color: clr, fontWeight: 700, background: bg }
    if (sev === 'FAIL' && colKey !== 'equipmentName' && colKey !== 'equipmentType') {
      return { color: '#b02000' }
    }
    if (sev === 'WARNING' && (colKey === 'minV' || colKey === 'maxLoading' || colKey === 'uvCount' || colKey === 'overloadCount')) {
      return { color: '#8a5a00', fontWeight: 600 }
    }
    return undefined
  }

  function arcFlashCellStyle(colKey: string, row: RowData): React.CSSProperties | undefined {
    const risk = row._risk as ArcFlashRiskLevel | undefined
    if (!risk) return undefined
    if (colKey === 'risk_level') {
      return { color: arcRiskColor(risk), fontWeight: 700, background: arcRiskBg(risk) }
    }
    if (colKey === 'incident_energy_cal' || colKey === 'ppe_label') {
      return { color: arcRiskColor(risk), fontWeight: 600 }
    }
    return undefined
  }

  function harmonicsBusCellStyle(colKey: string, row: RowData): React.CSSProperties | undefined {
    const pass  = row._pass  as boolean | undefined
    const thdv  = row._thdv  as number  | undefined
    const limit = row._limit as number  | undefined
    if (colKey === 'status') {
      return pass
        ? { color: '#006020', fontWeight: 700 }
        : { color: '#b02000', fontWeight: 700 }
    }
    if (colKey === 'thdv_percent' && thdv !== undefined && limit !== undefined) {
      if (thdv > limit)          return { color: '#b02000', fontWeight: 700 }
      if (thdv > limit * 0.6)    return { color: '#8a5a00', fontWeight: 600 }
      return { color: '#006020' }
    }
    return undefined
  }

  function cableSizingCellStyle(colKey: string, row: RowData): React.CSSProperties | undefined {
    const sev     = row._severity as CableSizingResult['severity'] | undefined
    const passAmp = row._passAmp  as boolean | undefined
    const passDv  = row._passDv   as boolean | undefined
    const dv      = row._dv       as number  | undefined
    const dvLim   = row._dvLimit  as number  | undefined

    if (colKey === 'status') {
      if (sev === 'PASS')    return { color: '#006020', fontWeight: 700 }
      if (sev === 'WARNING') return { color: '#8a5a00', fontWeight: 700, background: '#fff5dc' }
      return { color: '#b02000', fontWeight: 700, background: '#fde8e8' }
    }
    if (colKey === 'loadCurrentA' && passAmp === false) {
      return { color: '#b02000', fontWeight: 700 }
    }
    if (colKey === 'ampacityA' && passAmp === false) {
      return { color: '#b02000', fontWeight: 700 }
    }
    if (colKey === 'voltageDropPercent' && dv !== undefined && dvLim !== undefined) {
      if (!passDv) return { color: '#b02000', fontWeight: 700 }
      if (dv > dvLim * 0.8) return { color: '#8a5a00', fontWeight: 600 }
    }
    if (colKey === 'recommendedModel') {
      if (sev === 'FAIL')    return { color: '#b02000', fontWeight: 700 }
      if (sev === 'WARNING') return { color: '#8a5a00', fontWeight: 600 }
    }
    return undefined
  }

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

      {/* ── Table area ── */}
      {tab === 'lf' && (
        <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
          <DataTable
            title="Buses"
            cols={BUS_LF_COLS}
            rows={busLFRows}
            selectedId={selectedNodeId}
            onRowClick={handleResultRowClick}
            cellStyle={busLFCellStyle}
          />
          <DataTable
            title="Transformers"
            cols={TR_LF_COLS}
            rows={trLFRows}
            selectedId={selectedNodeId}
            onRowClick={handleResultRowClick}
          />
          <DataTable
            title="Cables"
            cols={CABLE_LF_COLS}
            rows={cableLFRows}
            selectedId={selectedEdgeId}
            onRowClick={handleResultRowClick}
          />
          {motorLFRows.length > 0 && (
            <DataTable
              title="Motors"
              cols={MOTOR_LF_COLS}
              rows={motorLFRows}
              selectedId={selectedNodeId}
              onRowClick={handleResultRowClick}
            />
          )}
        </div>
      )}

      {tab === 'sc' && (
        <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
          <DataTable
            title="Buses — Short Circuit"
            cols={BUS_SC_COLS}
            rows={busSCRows}
            selectedId={selectedNodeId}
            onRowClick={handleResultRowClick}
          />
        </div>
      )}

      {tab === 'asymFault' && asymFault && (
        <div style={{ flex: 1, overflowY: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 9.5, fontFamily: 'Consolas,monospace' }}>
            <thead>
              <tr style={{ background: '#d4dae2', position: 'sticky', top: 0 }}>
                {['Bus', 'kV', 'Ik3" (kA)', 'Ik1-LG (kA)', 'IkLL (kA)', 'Ik2LG (kA)', 'Z1 (pu)', 'Z0 (pu)', '최악 유형'].map(h => (
                  <th key={h} style={{ padding: '4px 8px', textAlign: 'left', fontSize: 9, fontWeight: 700,
                    color: '#2a3a4a', textTransform: 'uppercase', letterSpacing: '0.04em', borderBottom: '2px solid #b0bcc8' }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {nodes.filter(n => n.type === 'bus').map((n, ri) => {
                const r = asymFault.buses[n.id]
                const busEq = n.data.equipment as Bus
                if (!r) return null
                const worstColor = r.worst_type !== '3P' ? '#b02000' : '#005a20'
                return (
                  <tr key={n.id} style={{ background: ri % 2 ? '#f0f4f8' : '#fff', borderBottom: '1px solid #e8ecf0' }}>
                    <td style={{ padding: '3px 8px', fontWeight: 700 }}>{busEq.name}</td>
                    <td style={{ padding: '3px 8px' }}>{busEq.vn_kv}</td>
                    <td style={{ padding: '3px 8px', color: '#7a0000', fontWeight: 700 }}>{r.ik3_ka.toFixed(3)}</td>
                    <td style={{ padding: '3px 8px', color: '#4a0070' }}>{r.ik1_ka.toFixed(3)}</td>
                    <td style={{ padding: '3px 8px', color: '#00507a' }}>{r.ik2_ka.toFixed(3)}</td>
                    <td style={{ padding: '3px 8px', color: '#005a2a' }}>{r.ik2g_ka.toFixed(3)}</td>
                    <td style={{ padding: '3px 8px', color: '#5a5a5a' }}>{r.z1_pu.toFixed(5)}</td>
                    <td style={{ padding: '3px 8px', color: '#5a5a5a' }}>{r.z0_pu.toFixed(5)}</td>
                    <td style={{ padding: '3px 8px', fontWeight: 700, color: worstColor }}>
                      {r.worst_type} ({r.worst_ka.toFixed(3)} kA)
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          <div style={{ padding: '6px 10px', fontSize: 9, color: '#8a9aaa', fontFamily: "'Segoe UI',sans-serif" }}>
            IEC 60909 · 비대칭 고장 | 1LG=1선지락 · LL=선간 · 2LG=2선지락 · Z2≈Z1 가정 · 변압기 DYn11 가정
          </div>
        </div>
      )}

      {tab === 'pfc' && pfcResult && (
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {/* PFC 시스템 요약 */}
          <div style={{ display: 'flex', gap: 10, padding: '8px 12px', background: '#f0f4f8', flexShrink: 0, flexWrap: 'wrap' }}>
            {[
              { label: '현재 역률', val: pfcResult.systemPf.toFixed(3), color: pfcResult.systemPf < 0.90 ? '#b02000' : pfcResult.systemPf < 0.95 ? '#8a5a00' : '#005a20' },
              { label: '보정 후 역률', val: pfcResult.systemPfAfter.toFixed(3), color: '#005a20' },
              { label: '총 필요 Qc', val: `${(pfcResult.totalQc_mvar * 1000).toFixed(0)} kvar`, color: '#1a3a7a' },
              { label: '요금 할증', val: pfcResult.annualSaving_pct > 0 ? `+${pfcResult.annualSaving_pct.toFixed(1)}%` : '없음', color: pfcResult.annualSaving_pct > 0 ? '#b02000' : '#005a20' },
            ].map(c => (
              <div key={c.label} style={{ background: '#fff', border: '1px solid #d0d8e4', borderRadius: 3, padding: '5px 10px' }}>
                <div style={{ fontSize: 8.5, color: '#7a8898', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{c.label}</div>
                <div style={{ fontSize: 15, fontWeight: 700, fontFamily: 'Consolas,monospace', color: c.color }}>{c.val}</div>
              </div>
            ))}
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 9.5, fontFamily: 'Consolas,monospace' }}>
            <thead>
              <tr style={{ background: '#d4dae2' }}>
                {['Bus', 'P (MW)', 'Q (Mvar)', '현재 역률', '상태', '필요 Qc', '표준 용량(kvar)', '보정후 역률', '요금 할증'].map(h => (
                  <th key={h} style={{ padding: '4px 8px', fontSize: 9, fontWeight: 700, color: '#2a3a4a',
                    textTransform: 'uppercase', letterSpacing: '0.04em', borderBottom: '2px solid #b0bcc8', textAlign: 'left' }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {pfcResult.buses.map((b, ri) => {
                const statusColor = b.status === 'ok' ? '#005a20' : b.status === 'warn' ? '#8a5a00' : '#b02000'
                return (
                  <tr key={b.busId} style={{ background: ri % 2 ? '#f0f4f8' : '#fff', borderBottom: '1px solid #e8ecf0' }}>
                    <td style={{ padding: '3px 8px', fontWeight: 700 }}>{b.busName}</td>
                    <td style={{ padding: '3px 8px' }}>{b.p_mw.toFixed(3)}</td>
                    <td style={{ padding: '3px 8px' }}>{b.q_mvar.toFixed(3)}</td>
                    <td style={{ padding: '3px 8px', fontWeight: 700, color: statusColor }}>{b.pf_current.toFixed(3)}</td>
                    <td style={{ padding: '3px 8px', fontWeight: 700, color: statusColor }}>
                      {b.status === 'ok' ? '✓ PASS' : b.status === 'warn' ? '⚠ 주의' : '✗ 할증'}
                    </td>
                    <td style={{ padding: '3px 8px', color: '#1a3a7a' }}>{(b.qc_required * 1000).toFixed(0)}</td>
                    <td style={{ padding: '3px 8px', fontWeight: 700, color: '#1a3a7a' }}>{b.qc_kvar}</td>
                    <td style={{ padding: '3px 8px', color: '#005a20', fontWeight: 700 }}>{b.pf_after.toFixed(3)}</td>
                    <td style={{ padding: '3px 8px', color: b.penalty_pct > 0 ? '#b02000' : '#005a20', fontWeight: b.penalty_pct > 0 ? 700 : 400 }}>
                      {b.penalty_pct > 0 ? `+${b.penalty_pct.toFixed(1)}%` : '—'}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          <div style={{ padding: '6px 10px', fontSize: 9, color: '#8a9aaa', fontFamily: "'Segoe UI',sans-serif" }}>
            기준 역률: 0.90 (한전 표준약관) · 권장: 0.95 이상 · 할증: 0.90 미만 1%당 0.5% (최대 15%)
          </div>
        </div>
      )}

      {tab === 'studyCase' && (
        <div style={{ flex: 1, overflowY: 'auto', padding: '10px 12px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <span style={{ fontSize: 10, fontWeight: 700, color: '#3a4a5a' }}>스터디 케이스 저장소</span>
            <button
              onClick={() => {
                const name  = window.prompt('케이스 이름', `Case-${studyCases.length + 1}`) ?? ''
                if (!name.trim()) return
                const notes = window.prompt('메모 (선택)') ?? ''
                saveCase(name.trim(), loadflow, shortcircuit, notes)
              }}
              disabled={!loadflow && !shortcircuit}
              style={{
                padding: '3px 12px', fontSize: 9.5, cursor: loadflow || shortcircuit ? 'pointer' : 'not-allowed',
                background: loadflow || shortcircuit ? 'linear-gradient(to bottom,#1e3a7a,#152d60)' : '#9aa8b8',
                border: 'none', borderRadius: 2, color: '#fff', fontWeight: 700,
              }}
            >+ 현재 결과 저장</button>
          </div>
          {studyCases.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '32px 16px', color: '#8a9aaa', fontSize: 11 }}>
              저장된 케이스 없음 — Load Flow / Short Circuit 실행 후 "현재 결과 저장" 클릭
            </div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 10 }}>
              <thead>
                <tr style={{ background: '#d4dae2' }}>
                  {['케이스명', '저장일시', 'LF', 'SC', '메모', 'Baseline', '작업'].map(h => (
                    <th key={h} style={{ padding: '4px 8px', textAlign: 'left', fontSize: 9, fontWeight: 700,
                      color: '#2a3a4a', borderBottom: '2px solid #b0bcc8' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {studyCases.map((c, ri) => (
                  <tr key={c.id} style={{ background: ri % 2 ? '#f0f4f8' : '#fff', borderBottom: '1px solid #e8ecf0' }}>
                    <td style={{ padding: '4px 8px', fontWeight: 700 }}>{c.name}</td>
                    <td style={{ padding: '4px 8px', fontFamily: 'Consolas,monospace', fontSize: 9 }}>
                      {new Date(c.savedAt).toLocaleString('ko-KR')}
                    </td>
                    <td style={{ padding: '4px 8px', color: c.loadflow ? '#005a20' : '#b0b8c4' }}>
                      {c.loadflow ? '✓' : '—'}
                    </td>
                    <td style={{ padding: '4px 8px', color: c.shortcircuit ? '#005a20' : '#b0b8c4' }}>
                      {c.shortcircuit ? '✓' : '—'}
                    </td>
                    <td style={{ padding: '4px 8px', color: '#5a6a7a', fontSize: 9, maxWidth: 140,
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                      title={c.notes}>
                      {c.notes || '—'}
                    </td>
                    <td style={{ padding: '4px 8px' }}>
                      {baseline?.id === c.id
                        ? <span style={{ color: '#1a3a7a', fontWeight: 700, fontSize: 9 }}>★ BASE</span>
                        : <button onClick={() => setBaseline(c.id)} style={{ fontSize: 9, padding: '1px 7px',
                            cursor: 'pointer', background: '#e8ecf0', border: '1px solid #a0b0c0', borderRadius: 2 }}>
                            Set Base
                          </button>
                      }
                    </td>
                    <td style={{ padding: '4px 8px' }}>
                      <button onClick={() => deleteCase(c.id)} style={{ fontSize: 9, padding: '1px 7px',
                        cursor: 'pointer', background: '#fee8e8', border: '1px solid #e08080', borderRadius: 2, color: '#8a0000' }}>
                        삭제
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {baseline && loadflow && (
            <div style={{ marginTop: 12, padding: '10px 12px', background: '#e8eef8', border: '1px solid #c0cce0', borderRadius: 3 }}>
              <div style={{ fontSize: 10, fontWeight: 700, marginBottom: 6, color: '#1a3a7a' }}>
                📊 Baseline 비교: {baseline.name} vs 현재
              </div>
              {baseline.loadflow && (
                <table style={{ width: '100%', fontSize: 9.5, borderCollapse: 'collapse', fontFamily: 'Consolas,monospace' }}>
                  <thead>
                    <tr style={{ background: '#c8d4e8' }}>
                      {['Bus', 'Baseline V (pu)', '현재 V (pu)', '차이'].map(h => (
                        <th key={h} style={{ padding: '3px 6px', textAlign: 'left', fontSize: 9 }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {nodes.filter(n => n.type === 'bus').map(n => {
                      const baseV = baseline.loadflow!.buses[n.id]?.vm_pu
                      const currV = loadflow.buses[n.id]?.vm_pu
                      if (!baseV || !currV) return null
                      const diff = currV - baseV
                      const busEq = n.data.equipment as Bus
                      return (
                        <tr key={n.id} style={{ borderBottom: '1px solid #d0d8e8' }}>
                          <td style={{ padding: '2px 6px', fontWeight: 700 }}>{busEq.name}</td>
                          <td style={{ padding: '2px 6px' }}>{baseV.toFixed(4)}</td>
                          <td style={{ padding: '2px 6px' }}>{currV.toFixed(4)}</td>
                          <td style={{ padding: '2px 6px', color: Math.abs(diff) < 0.001 ? '#5a6a7a' : diff > 0 ? '#005a20' : '#b02000', fontWeight: 700 }}>
                            {diff >= 0 ? '+' : ''}{diff.toFixed(4)}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── 계산 이력 (P2-2 CalcLog) ─────────────────────────────────────────── */}
      {tab === 'calcLog' && (
        <div style={{ flex: 1, overflowY: 'auto', padding: '8px 12px' }}>
          <div style={{
            fontSize: 9, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase',
            color: '#6a7a8a', borderBottom: '1px solid #d0d8e0', paddingBottom: 4, marginBottom: 10,
          }}>
            계산 이력 — Calculation Audit Log
          </div>
          {calcLogEntries.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '32px 16px', color: '#8a9aaa', fontSize: 11 }}>
              계산 이력 없음 — 계산을 실행하면 자동으로 기록됩니다
            </div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 9.5, fontFamily: 'Consolas, monospace' }}>
              <thead>
                <tr style={{ background: '#d4dae2', position: 'sticky', top: 0 }}>
                  {['시각', '계산 종류', '결과', '요약'].map(h => (
                    <th key={h} style={{ padding: '4px 8px', textAlign: 'left', fontSize: 9, fontWeight: 700, color: '#2a3a4a', borderBottom: '2px solid #b0bcc8' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {calcLogEntries.map((entry, i) => {
                  const typeLabel: Record<string, string> = {
                    LoadFlow: 'Load Flow', ShortCircuit: 'Short Circuit',
                    Harmonics: 'Harmonics', CableSizing: 'Cable Sizing',
                    ArcFlash: 'Arc Flash', Contingency: 'N-1 Contingency',
                    AsymFault: 'Asym. Fault',
                  }
                  const convColor = entry.converged === true ? '#005a20'
                    : entry.converged === false ? '#b02000' : '#5a6a7a'
                  const convLabel = entry.converged === true ? '✓'
                    : entry.converged === false ? '✗' : '—'
                  return (
                    <tr key={i} style={{ background: i % 2 ? '#f0f4f8' : '#fff', borderBottom: '1px solid #e8ecf0' }}>
                      <td style={{ padding: '3px 8px', whiteSpace: 'nowrap', color: '#5a6a7a', fontSize: 9 }}>
                        {new Date(entry.timestamp).toLocaleTimeString('ko-KR')}
                      </td>
                      <td style={{ padding: '3px 8px', fontWeight: 700, color: '#1a2838' }}>
                        {typeLabel[entry.calcType] ?? entry.calcType}
                      </td>
                      <td style={{ padding: '3px 8px', fontWeight: 700, color: convColor }}>
                        {convLabel}
                      </td>
                      <td style={{ padding: '3px 8px', color: '#4a5a6a' }}>
                        {entry.summary}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>
      )}

      {tab === 'protection' && (
        <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
          <DataTable
            title="Protection Coordination — IEC 62271"
            cols={PROTECTION_COLS}
            rows={protectionRows}
            selectedId={selectedNodeId}
            onRowClick={handleResultRowClick}
            cellStyle={protectionCellStyle}
          />
        </div>
      )}

      {tab === 'coordination' && (
        <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
          <DataTable
            title="Protection Coordination  ·  IEC 60255  ·  Margin threshold 0.3 s"
            cols={COORDINATION_COLS}
            rows={coordinationRows}
            selectedId={selectedNodeId}
            onRowClick={handleResultRowClick}
            cellStyle={coordinationCellStyle}
          />
        </div>
      )}

      {tab === 'motorStart' && (
        <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
          <DataTable
            title="Motor Starting Analysis  ·  PASS ≥ 0.85 pu  ·  WARNING ≥ 0.80 pu"
            cols={MOTOR_START_COLS}
            rows={motorStartRows}
            selectedId={selectedNodeId}
            onRowClick={handleResultRowClick}
            cellStyle={motorStartCellStyle}
          />
        </div>
      )}

      {tab === 'arcFlash' && (
        <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
          {arcFlash && (
            <div style={{
              padding: '6px 12px', background: '#fffbe8',
              borderBottom: '1px solid #d8b800', flexShrink: 0,
              fontFamily: "'Segoe UI','Malgun Gothic',Arial,sans-serif",
              fontSize: 9, color: '#5a3800', lineHeight: 1.6,
            }}>
              <strong style={{ color: '#8a5000' }}>
                ⚠ [{arcFlash.method === 'IEEE_1584_2018_enhanced' ? 'IEEE 1584-2018 Enhanced' : 'IEEE 1584-2002'}]&nbsp;
              </strong>
              {arcFlash.disclaimer}
            </div>
          )}
          <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
            <DataTable
              title="Arc Flash Analysis  ·  IEEE 1584  ·  HIGH ≥ 8 cal/cm²  ·  EXTREME ≥ 25 cal/cm²"
              cols={ARC_FLASH_COLS}
              rows={arcFlashRows}
              selectedId={selectedNodeId}
              onRowClick={handleResultRowClick}
              cellStyle={arcFlashCellStyle}
            />
          </div>
        </div>
      )}

      {tab === 'contingency' && (
        <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
          <DataTable
            title="N-1 Contingency Analysis  ·  V < 0.95 pu = U/V  ·  Loading > 100% = Overload  ·  Island = FAIL"
            cols={CONTINGENCY_COLS}
            rows={contingencyRows}
            selectedId={selectedNodeId}
            onRowClick={handleResultRowClick}
            cellStyle={contingencyCellStyle}
          />
        </div>
      )}

      {tab === 'tcc' && (
        <div style={{ flex: 1, overflow: 'auto', background: '#f4f6f8', padding: '2px 6px' }}>
          {/* #10 TCC 진입 가이드 */}
          {relayResults.length === 0 && (
            <div style={{
              margin: '12px 8px', padding: '10px 14px',
              background: '#fff8e8', border: '1px solid #d0a800', borderRadius: 3,
              fontSize: 10, fontFamily: "'Segoe UI', 'Malgun Gothic', Arial, sans-serif",
              color: '#5a3800', lineHeight: 1.8,
            }}>
              <div style={{ fontWeight: 700, marginBottom: 4 }}>⚠ TCC Viewer 활성화 절차</div>
              <ol style={{ margin: 0, paddingLeft: 18 }}>
                <li>캔버스에 <b>Breaker</b> 노드를 배치하고 Bus에 연결합니다.</li>
                <li>Breaker 클릭 → Properties → <b>Relay Settings → Enable Relay</b>.</li>
                <li>Pickup Current · Time Dial · 곡선 타입을 설정합니다.</li>
                <li>Toolbar → <b>Short-Circuit</b> 실행.</li>
              </ol>
              <div style={{ marginTop: 6, fontSize: 9.5, color: '#8a7000' }}>
                계전기가 설정된 Breaker가 없거나 Short-Circuit 결과가 없으면 이 탭이 비활성화됩니다.
              </div>
            </div>
          )}
          <TCCChart data={tccData} />
        </div>
      )}

      {tab === 'relay87t' && (
        <div style={{ flex: 1, overflow: 'auto' }}>
          <DataTable
            title="87T 차동계전기 — IEC 60255-151 / IEEE C37.91"
            cols={RELAY_87T_COLS}
            rows={relay87tResults.map(r => ({
              id: r.breakerId,
              breakerName:        r.breakerName,
              transformerName:    r.transformerName,
              rated_current_hv_a: r.rated_current_hv_a,
              rated_current_lv_a: r.rated_current_lv_a,
              diff_current_pct:   r.diff_current_pct,
              restrain_current_a: r.restrain_current_a,
              inrush_label:       r.inrush_blocked ? '차단' : '정상',
              status:             r.trips ? 'TRIP!' : (r.pass ? 'PASS' : 'CHECK'),
            }))}
            selectedId={selectedNodeId}
            onRowClick={handleResultRowClick}
            cellStyle={(col, row) => {
              if (col === 'status') {
                const s = row.status as string
                if (s === 'TRIP!') return { color: '#8a0000', fontWeight: 700, background: '#fde8e8' }
                if (s === 'PASS')  return { color: '#005a20', fontWeight: 700, background: '#e6f4ec' }
                return { color: '#7a5a00', fontWeight: 700, background: '#fff5dc' }
              }
            }}
          />
          <div style={{ padding: '6px 12px', fontSize: 9.5, color: '#7a8898', fontFamily: "'Segoe UI', sans-serif", borderTop: '1px solid #ccd4dc' }}>
            ※ 차동전류는 조류계산 결과의 변압기 입출력 불균형으로 근사 계산됩니다. CT 비율 및 실제 계전기 설정은 전문 엔지니어 검토가 필요합니다.
          </div>
        </div>
      )}

      {tab === 'harmonics' && (
        <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
          <DataTable
            title="IEEE 519-2014 Harmonic Voltage Distortion"
            cols={HARMONIC_BUS_COLS}
            rows={harmonicBusRows}
            selectedId={selectedNodeId}
            onRowClick={handleResultRowClick}
            cellStyle={harmonicsBusCellStyle}
          />
          <HarmonicChart result={harmonics?.buses[selectedNodeId ?? ''] ?? null} />
        </div>
      )}

      {tab === 'cableSizing' && (
        <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
          <DataTable
            title="IEC 60364 Cable Sizing  ·  Ampacity / Voltage Drop (LV 3%, MV 5%) / Short-Circuit Withstand"
            cols={CABLE_SIZING_COLS}
            rows={cableSizingRows}
            selectedId={selectedEdgeId}
            onRowClick={handleResultRowClick}
            cellStyle={cableSizingCellStyle}
          />
        </div>
      )}

      {tab === 'voltageChart' && (
        <div style={{ flex: 1, overflow: 'hidden' }}>
          <BusVoltageChart rows={busLFRows} />
        </div>
      )}
    </div>
  )
}
