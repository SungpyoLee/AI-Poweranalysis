import type { Node as RFNode } from 'reactflow'
import type { NodeData, Bus, LoadflowResults, ShortCircuitResults } from '../../../types'
import type { StudyCaseSnapshot } from '../../../store/useStudyCaseStore'

export default function StudyCaseTab({
  studyCases, baseline, setBaseline, saveCase, deleteCase, loadflow, shortcircuit, nodes,
}: {
  studyCases:    StudyCaseSnapshot[]
  baseline:      StudyCaseSnapshot | null
  setBaseline:   (id: string | null) => void
  saveCase:      (name: string, lf?: LoadflowResults | null, sc?: ShortCircuitResults | null, notes?: string) => void
  deleteCase:    (id: string) => void
  loadflow:      LoadflowResults | null
  shortcircuit:  ShortCircuitResults | null
  nodes:         RFNode<NodeData>[]
}) {
  return (
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
  )
}
