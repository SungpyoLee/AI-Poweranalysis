import { memo, useState } from 'react'
import { Handle, Position, NodeProps, useStore as useRFStore } from 'reactflow'
import type { NodeData, ThreeWindingTransformer } from '../types'
import { useEquipmentStore } from '../store/useEquipmentStore'

const W = 52

function ThreeWindingTransformerNode({ id, data, selected }: NodeProps<NodeData>) {
  const p = data.equipment as ThreeWindingTransformer
  const stroke = selected ? '#1a3aff' : '#5a0090'
  const cx = W / 2

  const [editing, setEditing] = useState(false)
  const [draft,   setDraft]   = useState(p.name)
  const updateEquipment = useEquipmentStore(s => s.updateEquipment)
  const highlighted     = useEquipmentStore(s => s.highlightedIds.has(id))
  const zoom = useRFStore(s => s.transform[2])

  const commitName = () => {
    setEditing(false)
    const t = draft.trim() || p.name
    if (t !== p.name) updateEquipment(id, { ...p, name: t })
    setDraft(t)
  }

  return (
    <div style={{
      width: W, userSelect: 'none', textAlign: 'center',
      filter: highlighted ? 'drop-shadow(0 0 5px #9a3aff88)' : undefined,
    }}>
      {/* HV handle — top */}
      <Handle type="target" position={Position.Top} id="hv"
        style={{ left: cx, top: 0, width: 8, height: 8, background: 'transparent', border: 'none', transform: 'translate(-50%, -50%)' }} />
      {/* MV handle — left */}
      <Handle type="source" position={Position.Left} id="mv"
        style={{ left: 0, top: '65%', width: 8, height: 8, background: 'transparent', border: 'none', transform: 'translate(-50%, -50%)' }} />
      {/* LV handle — right */}
      <Handle type="source" position={Position.Right} id="lv"
        style={{ right: 0, top: '65%', width: 8, height: 8, background: 'transparent', border: 'none', transform: 'translate(50%, -50%)' }} />
      {/* Bottom handle (alt LV) */}
      <Handle type="source" position={Position.Bottom} id="bottom"
        style={{ left: cx, bottom: 0, width: 8, height: 8, background: 'transparent', border: 'none', transform: 'translate(-50%, 50%)' }} />

      <svg width={W} height={W + 8} viewBox={`0 0 ${W} ${W + 8}`} overflow="visible">
        {/* Three stacked circles — IEC 3-winding symbol */}
        <circle cx={cx} cy={14} r={10} fill="none" stroke={stroke} strokeWidth="1.8"/>
        <circle cx={cx} cy={28} r={10} fill="none" stroke={stroke} strokeWidth="1.8"/>
        <circle cx={cx} cy={42} r={10} fill="none" stroke={stroke} strokeWidth="1.8"/>
        {/* Small star mark */}
        <text x={cx} y={45} textAnchor="middle" fill={stroke} fontSize="6" fontWeight="bold">✶</text>
      </svg>

      {/* Name */}
      {editing ? (
        <input autoFocus value={draft}
          onChange={e => setDraft(e.target.value)}
          onBlur={commitName}
          onKeyDown={e => { if (e.key === 'Enter') { e.stopPropagation(); commitName() } if (e.key === 'Escape') { e.stopPropagation(); setEditing(false); setDraft(p.name) } }}
          onClick={e => e.stopPropagation()}
          style={{
            position: 'absolute', top: -18, left: '50%', transform: 'translateX(-50%)',
            fontSize: 10, fontFamily: "'Segoe UI', Arial, sans-serif",
            background: '#fff', border: '1px solid #5a0090', borderRadius: 2,
            padding: '1px 4px', outline: 'none', zIndex: 20, minWidth: 50,
          }}
        />
      ) : (
        <div onDoubleClick={e => { e.stopPropagation(); setEditing(true); setDraft(p.name) }}
          style={{
            position: 'absolute', top: -18, left: '50%', transform: 'translateX(-50%)',
            whiteSpace: 'nowrap', fontSize: 10, fontWeight: 700, color: '#0a1a2a',
            fontFamily: "'Segoe UI', Arial, sans-serif", cursor: 'text',
          }}>
          {p.name}
        </div>
      )}

      {/* Voltage labels */}
      {zoom >= 0.5 && (
        <div style={{
          position: 'absolute', bottom: -22, left: '50%', transform: 'translateX(-50%)',
          whiteSpace: 'nowrap', fontSize: 8, color: '#5a0090',
          fontFamily: 'Consolas, monospace',
        }}>
          {p.vn_hv_kv}/{p.vn_mv_kv}/{p.vn_lv_kv} kV
        </div>
      )}
    </div>
  )
}

export default memo(ThreeWindingTransformerNode)
