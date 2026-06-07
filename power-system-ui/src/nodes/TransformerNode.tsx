import { memo, useState } from 'react'
import { Handle, Position, NodeProps, useStore as useRFStore } from 'reactflow'
import type { NodeData, Transformer } from '../types'
import { useAnalysisStore } from '../store/useAnalysisStore'
import { useEquipmentStore } from '../store/useEquipmentStore'

const W = 44

function TransformerNode({ id, data, selected }: NodeProps<NodeData>) {
  const p = data.equipment as Transformer
  const stroke = selected ? '#1a3aff' : '#0a0a1e'
  const cx = W / 2

  const trResult = useAnalysisStore(s => s.loadflow?.transformers[id])
  const zoom     = useRFStore(s => s.transform[2])
  const showRes  = zoom >= 0.4

  const loadingColor = trResult
    ? trResult.loading_percent > 100 ? '#cc2200'
      : trResult.loading_percent > 80 ? '#cc7700'
      : '#1a4a1a'
    : undefined

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
        style={{ left: cx, top: 0, width: 8, height: 8,
          background: 'transparent', border: 'none', transform: 'translate(-50%, -50%)' }} />
      <Handle type="source" position={Position.Bottom} id="bottom"
        style={{ left: cx, bottom: 0, width: 8, height: 8,
          background: 'transparent', border: 'none', transform: 'translate(-50%, 50%)' }} />

      <svg width={W} height={64} viewBox={`0 0 ${W} 64`}>
        <line x1={cx} y1="0" x2={cx} y2="10" stroke={stroke} strokeWidth="2"/>
        <circle cx={cx} cy="20" r="16" fill={highlighted ? '#e8f0ff' : '#fff'}
          stroke={stroke} strokeWidth={selected ? 2.2 : 1.8}/>
        <circle cx={cx} cy="44" r="16" fill={highlighted ? '#e8f0ff' : '#fff'}
          stroke={stroke} strokeWidth={selected ? 2.2 : 1.8}/>
        <line x1={cx} y1="60" x2={cx} y2="64" stroke={stroke} strokeWidth="2"/>
        {selected && <>
          <circle cx={cx} cy="20" r="19" fill="none" stroke="#4a8aff" strokeWidth="1" strokeDasharray="3 2"/>
          <circle cx={cx} cy="44" r="19" fill="none" stroke="#4a8aff" strokeWidth="1" strokeDasharray="3 2"/>
        </>}
      </svg>

      <div style={{ fontFamily: 'Consolas, monospace', fontSize: 9, color: '#0a0a1a', lineHeight: 1.4, marginTop: 2 }}>
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
        <div style={{ color: '#3a3a6a' }}>{p.sn_mva} MVA</div>
        <div style={{ fontSize: 8, color: '#5a5a8a' }}>{p.vn_hv_kv}/{p.vn_lv_kv} kV</div>
        {trResult && showRes && (
          <div style={{
            fontSize: 8.5, fontWeight: 700, color: loadingColor,
            background: loadingColor + '12', border: `1px solid ${loadingColor}44`,
            borderRadius: 2, padding: '0 3px', marginTop: 2,
          }}>
            {trResult.loading_percent.toFixed(1)}%
          </div>
        )}
      </div>
    </div>
  )
}

export default memo(TransformerNode)
