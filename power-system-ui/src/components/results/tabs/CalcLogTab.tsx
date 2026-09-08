import type { CalcLogEntry } from '../../../utils/projectIO'

export default function CalcLogTab({ calcLogEntries }: { calcLogEntries: CalcLogEntry[] }) {
  return (
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
  )
}
