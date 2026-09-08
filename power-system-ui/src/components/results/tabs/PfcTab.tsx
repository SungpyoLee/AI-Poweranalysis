import type { PfcSystemResult } from '../../../engine/powerFactor'

export default function PfcTab({ pfcResult }: { pfcResult: PfcSystemResult }) {
  return (
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
  )
}
