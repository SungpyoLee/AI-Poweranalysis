import { memo } from 'react'
import { Handle, Position, NodeProps } from 'reactflow'
import type { NodeData, Reactor } from '../types'
import { useEquipmentStore } from '../store/useEquipmentStore'

function ReactorNode({ id, data, selected }: NodeProps<NodeData>) {
  const p         = data.equipment as Reactor
  const stroke    = selected ? '#1a3aff' : '#5a0030'
  const highlighted = useEquipmentStore(s => s.highlightedIds.has(id))

  return (
    <div style={{
      width: 36, userSelect: 'none', textAlign: 'center',
      filter: highlighted ? 'drop-shadow(0 0 5px #aa003388)' : undefined,
    }}>
      <Handle type="target" position={Position.Top} id="top"
        style={{ left: 18, top: 0, width: 8, height: 8, background: 'transparent', border: 'none', transform: 'translate(-50%, -50%)' }} />
      {p.is_shunt ? null : (
        <Handle type="source" position={Position.Bottom} id="bottom"
          style={{ left: 18, bottom: 0, width: 8, height: 8, background: 'transparent', border: 'none', transform: 'translate(-50%, 50%)' }} />
      )}

      <svg width="36" height="44" viewBox="0 0 36 44" overflow="visible">
        {/* Lead */}
        <line x1="18" y1="0" x2="18" y2="10" stroke={stroke} strokeWidth="1.8" strokeLinecap="round"/>
        {/* Inductor coils */}
        {[0,1,2].map(i => (
          <path key={i}
            d={`M ${18 - 8} ${10 + i * 6} Q ${18} ${7 + i * 6} ${18 + 8} ${10 + i * 6}`}
            fill="none" stroke={stroke} strokeWidth="1.8"/>
        ))}
        <line x1="18" y1="28" x2="18" y2="36" stroke={stroke} strokeWidth="1.8" strokeLinecap="round"/>
        {p.is_shunt ? (
          /* Ground */
          <>
            <line x1="10" y1="36" x2="26" y2="36" stroke={stroke} strokeWidth="1.8" strokeLinecap="round"/>
            <line x1="13" y1="40" x2="23" y2="40" stroke={stroke} strokeWidth="1.4" strokeLinecap="round"/>
          </>
        ) : null}
      </svg>

      <div style={{
        position: 'absolute', top: -18, left: '50%', transform: 'translateX(-50%)',
        whiteSpace: 'nowrap', fontSize: 9.5, fontWeight: 700, color: '#0a1a2a',
        fontFamily: "'Segoe UI', Arial, sans-serif",
      }}>{p.name}</div>
      <div style={{
        position: 'absolute', bottom: p.is_shunt ? -14 : -14, left: '50%', transform: 'translateX(-50%)',
        whiteSpace: 'nowrap', fontSize: 8.5, color: '#5a0030',
        fontFamily: 'Consolas, monospace',
      }}>{p.qn_mvar.toFixed(1)} Mvar</div>
    </div>
  )
}

export default memo(ReactorNode)
