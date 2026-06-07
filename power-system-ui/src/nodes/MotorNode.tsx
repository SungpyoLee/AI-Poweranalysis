import { memo, useState } from 'react'
import { Handle, Position, NodeProps, useStore as useRFStore } from 'reactflow'
import type { NodeData, Motor } from '../types'
import { useAnalysisStore } from '../store/useAnalysisStore'
import { useEquipmentStore } from '../store/useEquipmentStore'

const W = 44

function startColor(v: number): string {
  if (v >= 0.85) return '#006020'
  if (v >= 0.80) return '#8a5a00'
  return '#b02000'
}

function MotorNode({ id, data, selected }: NodeProps<NodeData>) {
  const p = data.equipment as Motor
  const startResult = useAnalysisStore(s => s.loadflow?.motorStarts?.[id])
  const stroke = selected ? '#1a3aff' : '#0a0a1e'
  const cx = W / 2

  // #4
  const zoom       = useRFStore(s => s.transform[2])
  const showRes    = zoom >= 0.45

  // #11
  const [editing, setEditing] = useState(false)
  const [draft,   setDraft]   = useState(p.name)
  const updateEquipment = useEquipmentStore(s => s.updateEquipment)

  const commitName = () => {
    setEditing(false)
    const t = draft.trim() || p.name
    if (t !== p.name) updateEquipment(id, { ...p, name: t })
    setDraft(t)
  }

  // #12
  const highlighted = useEquipmentStore(s => s.highlightedIds.has(id))

  return (
    <div style={{
      width: W, userSelect: 'none', textAlign: 'center',
      filter: highlighted ? 'drop-shadow(0 0 5px #4a8aff88)' : undefined,
    }}>
      <Handle type="target" position={Position.Top} id="top"
        style={{ left: cx, top: 0, width: 8, height: 8,
          background: 'transparent', border: 'none', transform: 'translate(-50%, -50%)' }} />
      <Handle type="source" position={Position.Bottom} id="bottom"
        style={{ left: cx, bottom: 0, width: 8, height: 8,
          background: 'transparent', border: 'none', transform: 'translate(-50%, 50%)' }} />

      <svg width={W} height={W} viewBox={`0 0 ${W} ${W}`}>
        <circle cx={cx} cy={cx} r="20" fill={highlighted ? '#e8f0ff' : '#fff'}
          stroke={stroke} strokeWidth={selected ? 2.2 : 1.8}/>
        <text x={cx} y={cx + 7} textAnchor="middle" fill={stroke}
          fontSize="16" fontWeight="bold" fontFamily="'Segoe UI', Arial, sans-serif">M</text>
        {selected && <circle cx={cx} cy={cx} r="22" fill="none" stroke="#4a8aff" strokeWidth="1" strokeDasharray="3 2"/>}
      </svg>

      <div style={{ fontFamily: 'Consolas, monospace', fontSize: 9, color: '#0a0a1a', lineHeight: 1.4, marginTop: 1 }}>
        {/* #11 인라인 이름 편집 */}
        {editing ? (
          <input
            autoFocus value={draft}
            onChange={e => setDraft(e.target.value)}
            onBlur={commitName}
            onKeyDown={e => {
              if (e.key === 'Enter')  { e.stopPropagation(); commitName() }
              if (e.key === 'Escape') { e.stopPropagation(); setEditing(false); setDraft(p.name) }
            }}
            onClick={e => e.stopPropagation()}
            style={{
              fontSize: 9, fontWeight: 700, fontFamily: 'Consolas, monospace',
              width: '100%', boxSizing: 'border-box',
              background: '#fff', border: '1px solid #1a3a8a', borderRadius: 2,
              padding: '1px 3px', outline: 'none',
            }}
          />
        ) : (
          <div
            onDoubleClick={e => { e.stopPropagation(); setEditing(true); setDraft(p.name) }}
            style={{ fontWeight: 700, cursor: 'text' }}
          >{p.name}</div>
        )}
        <div style={{ color: '#3a3a6a' }}>{p.rated_kw} kW</div>
        <div style={{ fontSize: 8, color: '#5a5a8a' }}>{p.vn_kv} kV</div>
      </div>
      {startResult && showRes && (
        <div style={{ fontFamily: 'Consolas, monospace', lineHeight: 1.35, marginTop: 2 }}>
          <div style={{ fontSize: 8, fontWeight: 700, color: startColor(startResult.terminal_voltage_pu) }}>
            {startResult.terminal_voltage_pu.toFixed(2)} pu
          </div>
          <div style={{ fontSize: 7, color: startColor(startResult.terminal_voltage_pu) }}>
            ▼{startResult.voltage_drop_percent.toFixed(1)}%
          </div>
        </div>
      )}
    </div>
  )
}

export default memo(MotorNode)
