/**
 * MotorImportPreview — Motor List 파싱 결과 미리보기
 * MotorListImportDialog의 Step 2에서 사용.
 */

import type { ParsedMotorList } from '../import/motorListParser'

interface Props {
  parsed:   ParsedMotorList
  onImport: () => void
  onBack:   () => void
}

export default function MotorImportPreview({ parsed, onImport, onBack }: Props) {
  const { rows, mccGroups, detectedColumns, warnings, totalRows, skippedRows } = parsed

  const totalKW   = rows.reduce((s, m) => s + m.kw, 0)
  const avgPF     = rows.length > 0 ? rows.reduce((s, m) => s + m.pf, 0) / rows.length : 0
  const largestKW = rows.reduce((mx, m) => Math.max(mx, m.kw), 0)

  const mccEntries = Array.from(mccGroups.entries()).sort((a, b) => b[1].length - a[1].length)

  const FONT = "'Segoe UI', 'Malgun Gothic', Arial, sans-serif"

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', fontFamily: FONT }}>

      {/* ── 상단 요약 바 ── */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 20,
        padding: '8px 20px', background: '#f0f4f8', borderBottom: '1px solid #d0d8e4',
        flexShrink: 0,
      }}>
        {[
          ['검출 행',    `${totalRows + skippedRows}행`],
          ['유효 모터',  `${totalRows}대`],
          ['MCC 그룹',   `${mccGroups.size}개`],
          ['건너뜀',     `${skippedRows}행`],
        ].map(([label, val]) => (
          <div key={label} style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            <span style={{ fontSize: 8.5, color: '#7a8898', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              {label}
            </span>
            <span style={{ fontSize: 13, fontWeight: 700, color: '#1a2838', fontFamily: 'Consolas, monospace' }}>
              {val}
            </span>
          </div>
        ))}
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 12 }}>
          {[
            ['총 부하',  `${(totalKW / 1000).toFixed(2)} MW`],
            ['평균 PF',  avgPF.toFixed(3)],
            ['최대 모터', `${largestKW} kW`],
          ].map(([label, val]) => (
            <div key={label} style={{ display: 'flex', flexDirection: 'column', gap: 1, textAlign: 'right' }}>
              <span style={{ fontSize: 8.5, color: '#7a8898', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                {label}
              </span>
              <span style={{ fontSize: 11, fontWeight: 700, color: '#1a3a7a', fontFamily: 'Consolas, monospace' }}>
                {val}
              </span>
            </div>
          ))}
        </div>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', display: 'flex', gap: 0 }}>

        {/* ── MCC 그룹 목록 ── */}
        <div style={{ width: 220, flexShrink: 0, borderRight: '1px solid #d0d8e4', padding: '12px 0' }}>
          <div style={{
            padding: '0 16px 8px', fontSize: 9.5, fontWeight: 700,
            color: '#2a3848', textTransform: 'uppercase', letterSpacing: '0.05em',
          }}>
            MCC 그룹
          </div>

          {mccEntries.map(([mcc, motors]) => {
            const grpKW = motors.reduce((s, m) => s + m.kw, 0)
            const pct   = totalKW > 0 ? (grpKW / totalKW) * 100 : 0
            return (
              <div key={mcc} style={{
                padding: '6px 16px',
                borderBottom: '1px solid #eef0f4',
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 3 }}>
                  <span style={{ fontSize: 10.5, fontWeight: 700, color: '#1a2838' }}>{mcc}</span>
                  <span style={{ fontSize: 10, fontFamily: 'Consolas, monospace', color: '#3a5a8a' }}>
                    {motors.length}대
                  </span>
                </div>
                {/* 부하 바 */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <div style={{ flex: 1, height: 4, background: '#e0e8f0', borderRadius: 2 }}>
                    <div style={{
                      height: '100%', width: `${pct}%`, borderRadius: 2,
                      background: 'linear-gradient(to right, #1e3a7a, #4a7adf)',
                    }} />
                  </div>
                  <span style={{ fontSize: 8.5, color: '#7a8898', fontFamily: 'Consolas, monospace', minWidth: 50, textAlign: 'right' }}>
                    {(grpKW / 1000).toFixed(2)} MW
                  </span>
                </div>
              </div>
            )
          })}
        </div>

        {/* ── 상세 테이블 ── */}
        <div style={{ flex: 1, padding: '12px 16px', overflowX: 'auto' }}>

          {/* 컬럼 매핑 정보 */}
          <div style={{
            marginBottom: 10, padding: '6px 10px',
            background: '#f8fafc', border: '1px solid #d8e4ee', borderRadius: 2,
            fontSize: 9, color: '#5a7090', fontFamily: 'Consolas, monospace',
          }}>
            <span style={{ fontWeight: 700, color: '#1a3a7a', marginRight: 6 }}>컬럼 매핑:</span>
            {[
              ['TAG',     detectedColumns.tag],
              ['kW',      detectedColumns.kw],
              ['PF',      detectedColumns.pf],
              ['Voltage', detectedColumns.voltage],
              ['MCC',     detectedColumns.mcc],
            ].map(([k, v]) => (
              <span key={k} style={{ marginRight: 10 }}>
                {k} → <span style={{ color: v ? '#1a5a1a' : '#a03030' }}>{v || '미탐지'}</span>
              </span>
            ))}
          </div>

          {/* 경고 */}
          {warnings.length > 0 && (
            <div style={{ marginBottom: 10 }}>
              {warnings.map((w, i) => (
                <div key={i} style={{
                  padding: '4px 8px', marginBottom: 3,
                  background: '#fff8e8', border: '1px solid #e0c060',
                  borderRadius: 2, fontSize: 9.5, color: '#6a4800',
                  display: 'flex', alignItems: 'center', gap: 6,
                }}>
                  <span style={{ fontSize: 11 }}>⚠</span>
                  {w}
                </div>
              ))}
            </div>
          )}

          {/* 모터 데이터 테이블 */}
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 9.5, fontFamily: 'Consolas, monospace' }}>
            <thead>
              <tr style={{ background: '#e8eef4' }}>
                {['TAG', 'kW', 'PF', 'Voltage', 'MCC'].map(h => (
                  <th key={h} style={{
                    padding: '4px 8px', textAlign: 'left',
                    fontSize: 9, fontWeight: 700, color: '#3a4a5a',
                    textTransform: 'uppercase', letterSpacing: '0.05em',
                    borderBottom: '2px solid #c0ccd8',
                  }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.slice(0, 200).map((row, i) => (
                <tr key={i} style={{ borderBottom: '1px solid #eef0f4' }}
                  onMouseEnter={e => { (e.currentTarget as HTMLTableRowElement).style.background = '#f4f8fc' }}
                  onMouseLeave={e => { (e.currentTarget as HTMLTableRowElement).style.background = '' }}
                >
                  <td style={{ padding: '3px 8px', fontWeight: 600, color: '#1a2838' }}>{row.tag}</td>
                  <td style={{ padding: '3px 8px', color: '#0a3a5a' }}>{row.kw}</td>
                  <td style={{ padding: '3px 8px', color: '#1a4a1a' }}>{row.pf.toFixed(3)}</td>
                  <td style={{ padding: '3px 8px', color: '#4a3a00' }}>{row.voltage_v} V</td>
                  <td style={{ padding: '3px 8px', color: '#3a005a' }}>{row.mcc}</td>
                </tr>
              ))}
            </tbody>
          </table>

          {rows.length > 200 && (
            <div style={{
              textAlign: 'center', padding: '8px', fontSize: 9.5,
              color: '#7a8898', background: '#f8fafc', marginTop: 4,
            }}>
              … 외 {rows.length - 200}대 (총 {rows.length}대)
            </div>
          )}
        </div>
      </div>

      {/* ── 액션 바 ── */}
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        padding: '10px 20px 14px', borderTop: '1px solid #d0d8e0', flexShrink: 0,
        fontFamily: FONT,
      }}>
        <button onClick={onBack} style={{
          padding: '5px 16px', fontSize: 10.5, cursor: 'pointer',
          background: '#e8ecf0', border: '1px solid #a0b0c0',
          borderRadius: 2, color: '#3a4a5a',
        }}>
          ← 이전
        </button>
        <button
          onClick={onImport}
          disabled={totalRows === 0}
          style={{
            padding: '7px 28px', fontSize: 11, fontWeight: 700,
            cursor: totalRows > 0 ? 'pointer' : 'not-allowed',
            background: totalRows > 0
              ? 'linear-gradient(to bottom, #1e3a7a, #152d60)'
              : '#9aa8b8',
            border: 'none', borderRadius: 3, color: '#fff',
            opacity: totalRows > 0 ? 1 : 0.6,
          }}
        >
          SLD 자동 작성 ({totalRows}대)
        </button>
      </div>
    </div>
  )
}
