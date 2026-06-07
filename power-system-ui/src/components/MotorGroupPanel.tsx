import type { Motor, MotorGroup } from '../types'
import { useEquipmentStore } from '../store/useEquipmentStore'
import { useAnalysisStore } from '../store/useAnalysisStore'

function statusBadge(pass: boolean | undefined) {
  if (pass === undefined) return { label: '—', color: '#8a9aaa', bg: '#f0f4f8' }
  return pass
    ? { label: 'OK',   color: '#006020', bg: '#e8f4ee' }
    : { label: 'FAIL', color: '#8a0000', bg: '#fce8e8' }
}

export default function MotorGroupPanel({ onCollapse }: { onCollapse?: () => void } = {}) {
  const activeId         = useEquipmentStore(s => s.activeMotorGroupId)
  const setActiveMotorGroup = useEquipmentStore(s => s.setActiveMotorGroup)
  const ungroupMotors    = useEquipmentStore(s => s.ungroupMotors)
  const allNodes         = useEquipmentStore(s => s.nodes)
  const loadflow         = useAnalysisStore(s => s.loadflow)

  if (!activeId) return null

  const groupNode = allNodes.find(n => n.id === activeId)
  if (!groupNode) return null
  const group = groupNode.data.equipment as MotorGroup

  const groupedMotors: Motor[] = allNodes
    .filter(n => n.type === 'motor' && (n.data.equipment as Motor).groupId === activeId)
    .map(n => n.data.equipment as Motor)

  const totalKw       = groupedMotors.reduce((s, m) => s + m.rated_kw, 0)
  let   totalRunningA = 0
  groupedMotors.forEach(m => {
    const r = loadflow?.motors?.[m.id]
    if (r) totalRunningA += r.running_current_a
  })

  return (
    <div style={{
      width: '100%', height: '100%',
      display: 'flex', flexDirection: 'column',
      background: '#f4f6f8',
      fontFamily: "'Segoe UI', 'Malgun Gothic', Arial, sans-serif",
      overflow: 'hidden',
    }}>
        {/* Header */}
        <div style={{
          background: 'linear-gradient(to bottom, #8a5000 0%, #6b3a00 100%)',
          padding: '10px 16px',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          flexShrink: 0,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <circle cx="4"  cy="7" r="3" stroke="#ffd090" strokeWidth="1.2"/>
              <circle cx="10" cy="7" r="3" stroke="#ffd090" strokeWidth="1.2"/>
              <text x="4"  y="10" textAnchor="middle" fill="#ffd090" fontSize="4" fontWeight="bold">M</text>
              <text x="10" y="10" textAnchor="middle" fill="#ffd090" fontSize="4" fontWeight="bold">M</text>
            </svg>
            <span style={{ fontSize: 12, fontWeight: 700, color: '#ffe8c0', letterSpacing: '0.04em' }}>
              {group.name}
            </span>
            <span style={{ fontSize: 9.5, color: '#c8a070' }}>Motor Group</span>
          </div>
          <div style={{ display: 'flex', gap: 4 }}>
            {onCollapse && (
              <button
                onClick={onCollapse}
                title="패널 접기"
                style={{ background: 'none', border: 'none', color: '#c8a070', cursor: 'pointer', fontSize: 16 }}
              >›</button>
            )}
            <button
              onClick={() => setActiveMotorGroup(null)}
              style={{ background: 'none', border: 'none', color: '#c8a070', cursor: 'pointer', fontSize: 16 }}
            >✕</button>
          </div>
        </div>

        {/* Summary bar */}
        <div style={{
          background: '#fff8f0', borderBottom: '1px solid #e8d0b0',
          padding: '6px 16px', display: 'flex', gap: 24, flexShrink: 0,
        }}>
          {[
            ['Motors',         groupedMotors.length],
            ['Total kW',       `${totalKw.toFixed(0)} kW`],
            ['∑ I_run',        loadflow ? `${totalRunningA.toFixed(0)} A` : '—'],
          ].map(([label, val]) => (
            <div key={String(label)}>
              <div style={{ fontSize: 8.5, color: '#8a7060', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{label}</div>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#3a1400', fontFamily: 'Consolas, monospace' }}>{val}</div>
            </div>
          ))}
        </div>

        {/* Motor table */}
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {groupedMotors.length === 0 ? (
            <div style={{ padding: '32px 16px', textAlign: 'center', color: '#8a9aaa', fontSize: 11 }}>
              그룹에 속한 전동기가 없습니다.
            </div>
          ) : (
            <table style={{
              width: '100%', borderCollapse: 'collapse',
              fontSize: 10.5, fontFamily: 'Consolas, monospace',
            }}>
              <thead>
                <tr style={{ background: '#eef2f8', borderBottom: '2px solid #c8d4e0' }}>
                  {['전동기명', 'kW', 'kV', 'PF', 'I_run (A)', 'I_start (A)', 'Status'].map(h => (
                    <th key={h} style={{
                      padding: '5px 10px', textAlign: h === '전동기명' ? 'left' : 'right',
                      fontSize: 9, color: '#4a5a7a', fontWeight: 700,
                      textTransform: 'uppercase', letterSpacing: '0.06em',
                    }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {groupedMotors.map((m, i) => {
                  const r     = loadflow?.motors?.[m.id]
                  const start = loadflow?.motorStarts?.[m.id]
                  const badge = statusBadge(start?.pass)
                  return (
                    <tr key={m.id} style={{
                      background: i % 2 === 0 ? '#fff' : '#fafbfc',
                      borderBottom: '1px solid #e8ecf0',
                    }}>
                      <td style={{ padding: '6px 10px', fontWeight: 700, color: '#1a2838' }}>
                        {m.name}
                        {m.description && (
                          <div style={{ fontSize: 8.5, color: '#8a9aaa', fontWeight: 400 }}>{m.description}</div>
                        )}
                      </td>
                      <td style={{ padding: '6px 10px', textAlign: 'right', color: '#2a3848' }}>{m.rated_kw}</td>
                      <td style={{ padding: '6px 10px', textAlign: 'right', color: '#2a3848' }}>{m.vn_kv}</td>
                      <td style={{ padding: '6px 10px', textAlign: 'right', color: '#2a3848' }}>{m.power_factor}</td>
                      <td style={{ padding: '6px 10px', textAlign: 'right', color: r ? '#006020' : '#b0b8c0', fontWeight: r ? 600 : 400 }}>
                        {r ? r.running_current_a.toFixed(1) : '—'}
                      </td>
                      <td style={{ padding: '6px 10px', textAlign: 'right', color: r ? '#8a4000' : '#b0b8c0', fontWeight: r ? 600 : 400 }}>
                        {r ? r.starting_current_a.toFixed(1) : '—'}
                      </td>
                      <td style={{ padding: '6px 10px', textAlign: 'right' }}>
                        <span style={{
                          background: badge.bg, color: badge.color,
                          border: `1px solid ${badge.color}40`,
                          padding: '1px 6px', borderRadius: 1, fontSize: 9, fontWeight: 700,
                        }}>
                          {badge.label}
                        </span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* Footer */}
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          padding: '8px 16px 12px',
          borderTop: '1px solid #d0d8e0', flexShrink: 0,
        }}>
          <button
            onClick={() => { ungroupMotors(activeId); setActiveMotorGroup(null) }}
            style={{
              padding: '4px 14px', fontSize: 10, cursor: 'pointer',
              background: '#fde8e8', border: '1px solid #e08080',
              borderRadius: 2, color: '#8a0000', fontWeight: 600,
              fontFamily: "'Segoe UI', Arial, sans-serif",
            }}
          >
            그룹 해제
          </button>
          <button
            onClick={() => setActiveMotorGroup(null)}
            style={{
              padding: '4px 18px', fontSize: 10.5, cursor: 'pointer',
              background: 'linear-gradient(to bottom, #1e3a7a, #152d60)',
              border: 'none', borderRadius: 2, color: '#fff', fontWeight: 700,
              fontFamily: "'Segoe UI', Arial, sans-serif",
            }}
          >
            닫기
          </button>
        </div>
      </div>
  )
}
