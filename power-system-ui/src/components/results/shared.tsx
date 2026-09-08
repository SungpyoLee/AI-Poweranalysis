/**
 * ResultsPanel 공용 조각 — 컬럼 정의, 색상 헬퍼, CSV export, 범용 데이터 테이블,
 * 탭 바 아톰. 여러 탭 컴포넌트(../tabs/*)가 공유해서 쓴다.
 */
import type { ArcFlashRiskLevel } from '../../types'

// ── Types ────────────────────────────────────────────────────────────────────
export type RowData = Record<string, unknown> & { id: string }

export interface ColDef {
  key:    string
  header: string
  right?: boolean
  toStr?: (v: unknown) => string   // display formatter; CSV uses raw value
}

// ── Column definitions ───────────────────────────────────────────────────────
const f = (decimals: number) => (v: unknown) =>
  v === undefined || v === null ? '—' : (v as number).toFixed(decimals)

export const BUS_LF_COLS: ColDef[] = [
  { key: 'name',       header: 'Bus' },
  { key: 'vn_kv',     header: 'kV',        right: true },
  { key: 'vm_pu',     header: 'V (pu)',     right: true, toStr: f(4) },
  { key: 'va_degree', header: 'Angle (°)',  right: true, toStr: f(3) },
  { key: 'p_mw',      header: 'P (MW)',     right: true, toStr: f(3) },
  { key: 'q_mvar',    header: 'Q (Mvar)',   right: true, toStr: f(3) },
  { key: 'ikss_ka',   header: 'Ik" (kA)',   right: true, toStr: f(3) },
]

export const BUS_SC_COLS: ColDef[] = [
  { key: 'name',         header: 'Bus' },
  { key: 'vn_kv',       header: 'kV',            right: true },
  { key: 'ikss_ka',     header: 'Ik" (kA)',      right: true, toStr: f(3) },
  { key: 'ip_ka',       header: 'Ip (kA)',       right: true, toStr: f(3) },
  { key: 'ib_ka',       header: 'Ib (kA)',       right: true, toStr: f(3) },
  { key: 'ith_ka',      header: 'Ith (kA)',      right: true, toStr: f(3) },
  { key: 'ikss_ka_min', header: 'Ik"_min (kA)', right: true, toStr: f(3) },
  { key: 'skss_mva',    header: 'Sk" (MVA)',     right: true, toStr: f(1) },
]

export const TR_LF_COLS: ColDef[] = [
  { key: 'name',            header: 'Transformer' },
  { key: 'loading_percent', header: 'Loading (%)', right: true, toStr: f(1) },
  { key: 'pl_kw',          header: 'Loss (kW)',   right: true, toStr: f(2) },
]

export const CABLE_LF_COLS: ColDef[] = [
  { key: 'name',            header: 'Cable' },
  { key: 'i_a',             header: 'I (A)',       right: true, toStr: f(1) },
  { key: 'loading_percent', header: 'Loading (%)', right: true, toStr: f(1) },
  { key: 'vdrop_percent',   header: 'ΔV (%)',      right: true, toStr: f(3) },
]

export const COORDINATION_COLS: ColDef[] = [
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

export const CURVE_LABELS: Record<string, string> = {
  IEC_NORMAL_INVERSE:    'Normal',
  IEC_VERY_INVERSE:      'Very',
  IEC_EXTREMELY_INVERSE: 'Extr.',
}

export const MOTOR_START_COLS: ColDef[] = [
  { key: 'name',                header: 'Motor' },
  { key: 'starting_method',     header: 'Method' },
  { key: 'running_current_a',   header: 'Irated (A)',    right: true, toStr: f(1) },
  { key: 'start_current_a',     header: 'Istart (A)',    right: true, toStr: f(1) },
  { key: 'start_mva',           header: 'Start MVA',     right: true, toStr: f(3) },
  { key: 'terminal_voltage_pu', header: 'Voltage (pu)',  right: true, toStr: f(4) },
  { key: 'voltage_drop_percent',header: 'Drop (%)',      right: true, toStr: f(2) },
  { key: 'status',              header: 'Status' },
]

export const MOTOR_LF_COLS: ColDef[] = [
  { key: 'name',               header: 'Motor' },
  { key: 'rated_kw',          header: 'Rated (kW)',  right: true },
  { key: 'p_mw',              header: 'P in (MW)',   right: true, toStr: f(4) },
  { key: 'q_mvar',            header: 'Q (Mvar)',    right: true, toStr: f(4) },
  { key: 'running_current_a', header: 'Ir (A)',      right: true, toStr: f(1) },
  { key: 'starting_current_a',header: 'Is (A)',      right: true, toStr: f(1) },
  { key: 'starting_method',   header: 'Method' },
]

export const ARC_FLASH_COLS: ColDef[] = [
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

export const CONTINGENCY_COLS: ColDef[] = [
  { key: 'equipmentName',    header: 'Equipment' },
  { key: 'equipmentType',    header: 'Type' },
  { key: 'severity',         header: 'Status' },
  { key: 'minV',             header: 'Min V (pu)',     right: true, toStr: f(4) },
  { key: 'maxLoading',       header: 'Max Load (%)',   right: true, toStr: f(1) },
  { key: 'islandCount',      header: 'Islands',        right: true },
  { key: 'uvCount',          header: 'U/V Buses',      right: true },
  { key: 'overloadCount',    header: 'Overloads',      right: true },
]

export const HARMONIC_BUS_COLS: ColDef[] = [
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

export const HARMONIC_SRC_COLS: ColDef[] = [
  { key: 'sourceName',   header: 'Source' },
  { key: 'sourceType',   header: 'Type' },
  { key: 'busName',      header: 'Bus' },
  { key: 'i_fund_a',     header: 'I_fund (A)',   right: true, toStr: f(1) },
  { key: 'thdi_percent', header: 'THDi (%)',     right: true, toStr: f(1) },
  { key: 'h5_a',         header: 'h5 (A)',       right: true, toStr: f(2) },
  { key: 'h7_a',         header: 'h7 (A)',       right: true, toStr: f(2) },
  { key: 'h11_a',        header: 'h11 (A)',      right: true, toStr: f(2) },
]

export const CABLE_SIZING_COLS: ColDef[] = [
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

export const RELAY_87T_COLS: ColDef[] = [
  { key: 'breakerName',        header: 'Relay (Breaker)' },
  { key: 'transformerName',    header: 'Transformer' },
  { key: 'rated_current_hv_a', header: 'In_HV (A)',   right: true },
  { key: 'rated_current_lv_a', header: 'In_LV (A)',   right: true },
  { key: 'diff_current_pct',   header: 'Idiff (%In)', right: true, toStr: f(2) },
  { key: 'restrain_current_a', header: 'Ires (A)',    right: true },
  { key: 'inrush_label',       header: '2nd Harm.' },
  { key: 'status',             header: 'Status' },
]

export const PROTECTION_COLS: ColDef[] = [
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
export function vmColor(vm_pu: number): string {
  if (vm_pu < 0.95)  return '#b02000'
  if (vm_pu < 0.98)  return '#8a5a00'
  if (vm_pu <= 1.05) return '#006020'
  return '#a04a00'
}

export function marginColor(margin_percent: number): string {
  if (margin_percent > 20)  return '#006020'  // green
  if (margin_percent >= 0)  return '#8a5a00'  // amber
  return '#b02000'                             // red
}

export function startStatusColor(v: number): string {
  if (v >= 0.85) return '#006020'  // green — PASS
  if (v >= 0.80) return '#8a5a00'  // amber — WARNING
  return '#b02000'                  // red   — FAIL
}

export function startStatusLabel(v: number): 'PASS' | 'WARNING' | 'FAIL' {
  if (v >= 0.85) return 'PASS'
  if (v >= 0.80) return 'WARNING'
  return 'FAIL'
}

export function arcRiskColor(risk: ArcFlashRiskLevel): string {
  switch (risk) {
    case 'LOW':     return '#006020'
    case 'MEDIUM':  return '#8a5a00'
    case 'HIGH':    return '#b04000'
    case 'EXTREME': return '#b02000'
  }
}

export function arcRiskBg(risk: ArcFlashRiskLevel): string {
  switch (risk) {
    case 'LOW':     return '#e6f4ec'
    case 'MEDIUM':  return '#fff5dc'
    case 'HIGH':    return '#fff0e0'
    case 'EXTREME': return '#fde8e8'
  }
}

// ── CSV export ───────────────────────────────────────────────────────────────
export function exportCSV(cols: ColDef[], rows: RowData[], filename: string) {
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

// ── Tab bar atoms ────────────────────────────────────────────────────────────
export function TabGroupLabel({ label }: { label: string }) {
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

export function TabGroupDivider() {
  return (
    <div style={{
      width: 1, background: '#a8b4c0',
      margin: '6px 4px', flexShrink: 0,
    }} />
  )
}

export function PanelTab({ label, active, disabled, onClick }: {
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

export function SummaryCard({ converged, meta }: {
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

export function MetaChip({ label, val }: { label: string; val: string }) {
  return (
    <span style={{ fontSize: 9, fontFamily: 'Consolas, monospace', color: '#3a4a5a', whiteSpace: 'nowrap' }}>
      <span style={{ color: '#8a9aaa', marginRight: 2 }}>{label}:</span>
      <span style={{ fontWeight: 600 }}>{val}</span>
    </span>
  )
}

// ── Generic data table ────────────────────────────────────────────────────────
export function DataTable({
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
