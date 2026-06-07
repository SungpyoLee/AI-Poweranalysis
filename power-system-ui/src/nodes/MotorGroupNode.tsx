import { memo } from 'react'
import { Handle, Position, NodeProps } from 'reactflow'
import type { NodeData, MotorGroup, Motor } from '../types'
import { useEquipmentStore } from '../store/useEquipmentStore'
import { useAnalysisStore } from '../store/useAnalysisStore'

const W = 130

function MotorGroupNode({ id, data, selected }: NodeProps<NodeData>) {
  const p = data.equipment as MotorGroup
  const setActiveMotorGroup = useEquipmentStore(s => s.setActiveMotorGroup)

  const allNodes    = useEquipmentStore(s => s.nodes)
  const loadflow    = useAnalysisStore(s => s.loadflow)

  const groupedMotors = allNodes
    .filter(n => n.type === 'motor' && (n.data.equipment as Motor).groupId === id)
    .map(n => n.data.equipment as Motor)

  const motorCount = groupedMotors.length
  const totalKw    = groupedMotors.reduce((s, m) => s + m.rated_kw, 0)

  let totalRunningA  = 0
  let totalStartingA = 0
  let anyRunning     = false
  if (loadflow?.motors) {
    groupedMotors.forEach(m => {
      const r = loadflow.motors[m.id]
      if (r) {
        totalRunningA  += r.running_current_a
        totalStartingA += r.starting_current_a
        anyRunning = true
      }
    })
  }

  const borderColor = selected ? '#1a3aff' : '#6b3a00'
  const cx = W / 2

  return (
    <div
      onDoubleClick={() => setActiveMotorGroup(id)}
      title="더블클릭 — 그룹 상세 보기"
      style={{ width: W, userSelect: 'none', cursor: 'pointer' }}
    >
      {/* Top handle */}
      <Handle
        type="target" position={Position.Top} id="top"
        style={{ left: cx, top: 0, width: 8, height: 8,
          background: 'transparent', border: 'none', transform: 'translate(-50%, -50%)' }}
      />

      {/* Node box */}
      <div style={{
        border: `1.5px solid ${borderColor}`,
        borderRadius: 4,
        background: selected ? '#f0f4ff' : '#fffaf4',
        boxShadow: selected
          ? '0 0 0 2px rgba(26,58,255,0.18)'
          : '0 2px 6px rgba(0,0,0,0.12)',
        overflow: 'hidden',
        fontFamily: 'Consolas, monospace',
      }}>
        {/* Header bar */}
        <div style={{
          background: selected
            ? 'linear-gradient(to bottom, #2a4a8a, #1a3a6a)'
            : 'linear-gradient(to bottom, #8a5000, #6b3a00)',
          padding: '4px 8px',
          display: 'flex', alignItems: 'center', gap: 5,
        }}>
          {/* Motor group icon */}
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
            <circle cx="3"  cy="6" r="2.5" stroke="#ffd090" strokeWidth="1.2"/>
            <circle cx="9"  cy="6" r="2.5" stroke="#ffd090" strokeWidth="1.2"/>
            <text x="3" y="9.5" textAnchor="middle" fill="#ffd090" fontSize="4" fontWeight="bold">M</text>
            <text x="9" y="9.5" textAnchor="middle" fill="#ffd090" fontSize="4" fontWeight="bold">M</text>
          </svg>
          <span style={{ fontSize: 9, fontWeight: 700, color: '#ffe8c0', letterSpacing: '0.05em' }}>
            MOTOR GROUP
          </span>
        </div>

        {/* Body */}
        <div style={{ padding: '6px 8px', lineHeight: 1.6 }}>
          <div style={{
            fontSize: 10.5, fontWeight: 700, color: '#2a1400',
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
            marginBottom: 3,
          }}>
            {p.name}
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 9.5, color: '#6b4a20' }}>
              {motorCount} Motors
            </span>
            <span style={{
              fontSize: 10, fontWeight: 700,
              color: motorCount === 0 ? '#b0b0b0' : '#3a1400',
            }}>
              {totalKw >= 1000
                ? `${(totalKw / 1000).toFixed(2)} MW`
                : `${totalKw.toFixed(0)} kW`}
            </span>
          </div>

          {/* Load flow overlay */}
          {anyRunning && (
            <div style={{
              marginTop: 4, paddingTop: 4,
              borderTop: '1px solid #e8d0a0',
              display: 'flex', flexDirection: 'column', gap: 1,
            }}>
              <div style={{ fontSize: 8.5, color: '#2a5a2a', fontWeight: 600 }}>
                ∑ I<sub>run</sub> {totalRunningA.toFixed(0)} A
              </div>
              <div style={{ fontSize: 8, color: '#5a3a00' }}>
                ∑ I<sub>st</sub>  {totalStartingA.toFixed(0)} A
              </div>
            </div>
          )}

          {motorCount === 0 && (
            <div style={{ fontSize: 8, color: '#c0a880', marginTop: 2, fontStyle: 'italic' }}>
              우클릭 메뉴 → 전동기 추가
            </div>
          )}
        </div>
      </div>

      {/* Selection dash ring */}
      {selected && (
        <div style={{
          position: 'absolute', inset: -4,
          border: '1px dashed #4a8aff', borderRadius: 6,
          pointerEvents: 'none',
        }} />
      )}

      {/* Bottom handle */}
      <Handle
        type="source" position={Position.Bottom} id="bottom"
        style={{ left: cx, bottom: 0, width: 8, height: 8,
          background: 'transparent', border: 'none', transform: 'translate(-50%, 50%)' }}
      />
    </div>
  )
}

export default memo(MotorGroupNode)
