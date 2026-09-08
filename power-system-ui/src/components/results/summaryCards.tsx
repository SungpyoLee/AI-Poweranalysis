/**
 * 탭 헤더에 표시되는 요약 배지 카드들 — 각 해석 종류별 PASS/FAIL 집계.
 */
import type {
  ProtectionItem, RelayResult, MotorStartResult, ArcFlashResult,
  ContingencyResult, HarmonicBusResult, HarmonicSourceResult, CableSizingResult,
} from '../../types'
import { MetaChip } from './shared'

export function ProtectionSummaryCard({ items }: { items: ProtectionItem[] }) {
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

export function CoordinationSummaryCard({ items }: { items: RelayResult[] }) {
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

export function MotorStartSummaryCard({ items }: { items: MotorStartResult[] }) {
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

export function ArcFlashSummaryCard({ items }: { items: ArcFlashResult[] }) {
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

export function ContingencySummaryCard({ items }: { items: ContingencyResult[] }) {
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

export function HarmonicsSummaryCard({ buses, sources }: { buses: HarmonicBusResult[]; sources: HarmonicSourceResult[] }) {
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

export function CableSizingSummaryCard({ items }: { items: CableSizingResult[] }) {
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
