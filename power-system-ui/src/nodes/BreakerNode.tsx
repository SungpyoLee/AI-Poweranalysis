import { memo, useState } from 'react'
import { Handle, Position, NodeProps } from 'reactflow'
import type { NodeData, Breaker } from '../types'
import { useEquipmentStore } from '../store/useEquipmentStore'

const W = 44, H = 52

function BreakerNode({ id, data, selected }: NodeProps<NodeData>) {
  const p = data.equipment as Breaker
  const closed = p.is_closed
  const stroke = selected ? '#1a3aff' : '#0a0a1e'
  const fill   = closed ? '#f4f4f8' : '#fff4f0'

  // #11 인라인 이름 편집
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
        style={{ left: W / 2, top: 0, width: 8, height: 8,
          background: 'transparent', border: 'none', transform: 'translate(-50%, -50%)' }} />
      <Handle type="source" position={Position.Bottom} id="bottom"
        style={{ left: W / 2, bottom: 0, width: 8, height: 8,
          background: 'transparent', border: 'none', transform: 'translate(-50%, 50%)' }} />

      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`}>
        <line x1={W/2} y1="0" x2={W/2} y2="9" stroke={stroke} strokeWidth="2" strokeLinecap="round"/>
        <rect x="8" y="9" width="28" height="30" rx="1"
          fill={highlighted ? '#e8f0ff' : fill}
          stroke={stroke} strokeWidth={selected ? 2 : 1.8}/>
        {closed ? (
          <>
            <line x1="12" y1="13" x2="32" y2="35" stroke={stroke} strokeWidth="1.6"/>
            <line x1="32" y1="13" x2="12" y2="35" stroke={stroke} strokeWidth="1.6"/>
          </>
        ) : (
          <>
            <line x1={W/2} y1="11" x2={W/2} y2="18" stroke="#c04000" strokeWidth="1.8" strokeLinecap="round"/>
            <line x1={W/2} y1="22" x2={W/2} y2="37" stroke="#c04000" strokeWidth="1.8" strokeLinecap="round"/>
          </>
        )}
        <line x1={W/2} y1="39" x2={W/2} y2={H} stroke={stroke} strokeWidth="2" strokeLinecap="round"/>
        {selected && <rect x="6" y="7" width="32" height="34" rx="2" fill="none" stroke="#4a8aff" strokeWidth="1" strokeDasharray="3 2"/>}
      </svg>

      <div style={{ fontSize: 8, color: '#3a3a5a', fontFamily: 'Consolas, monospace', lineHeight: 1.3 }}>
        {editing ? (
          <input autoFocus value={draft}
            onChange={e => setDraft(e.target.value)}
            onBlur={commitName}
            onKeyDown={e => {
              if (e.key === 'Enter')  { e.stopPropagation(); commitName() }
              if (e.key === 'Escape') { e.stopPropagation(); setEditing(false); setDraft(p.name) }
            }}
            onClick={e => e.stopPropagation()}
            style={{
              fontSize: 8, fontWeight: 700, fontFamily: 'Consolas, monospace',
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
        <div style={{ color: closed ? '#005500' : '#880000' }}>{closed ? '■ Closed' : '○ Open'}</div>
      </div>
    </div>
  )
}

export default memo(BreakerNode)
