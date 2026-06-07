import { memo } from 'react'
import { Handle, Position, NodeProps } from 'reactflow'
import type { NodeData, CapacitorBank } from '../types'
import { useAnalysisStore } from '../store/useAnalysisStore'
import { useEquipmentStore } from '../store/useEquipmentStore'

function CapacitorNode({ id, data, selected }: NodeProps<NodeData>) {
  const p         = data.equipment as CapacitorBank
  const stroke    = selected ? '#1a3aff' : '#005a8a'
  const highlighted = useEquipmentStore(s => s.highlightedIds.has(id))
  const lfResult  = useAnalysisStore(s => s.loadflow?.buses)

  const Qeff = p.qn_mvar * (p.step_enabled / Math.max(p.steps, 1))

  return (
    <div style={{
      width: 36, userSelect: 'none', textAlign: 'center',
      filter: highlighted ? 'drop-shadow(0 0 5px #0088cc88)' : undefined,
    }}>
      <Handle type="target" position={Position.Top} id="top"
        style={{ left: 18, top: 0, width: 8, height: 8, background: 'transparent', border: 'none', transform: 'translate(-50%, -50%)' }} />

      <svg width="36" height="44" viewBox="0 0 36 44" overflow="visible">
        {/* Vertical lead */}
        <line x1="18" y1="0" x2="18" y2="14" stroke={stroke} strokeWidth="1.8" strokeLinecap="round"/>
        {/* Capacitor plates */}
        <line x1="6" y1="14" x2="30" y2="14" stroke={stroke} strokeWidth="2.2" strokeLinecap="round"/>
        <line x1="6" y1="20" x2="30" y2="20" stroke={stroke} strokeWidth="2.2" strokeLinecap="round"/>
        {/* Ground symbol */}
        <line x1="18" y1="20" x2="18" y2="28" stroke={stroke} strokeWidth="1.8" strokeLinecap="round"/>
        <line x1="10" y1="28" x2="26" y2="28" stroke={stroke} strokeWidth="1.8" strokeLinecap="round"/>
        <line x1="13" y1="32" x2="23" y2="32" stroke={stroke} strokeWidth="1.4" strokeLinecap="round"/>
        <line x1="16" y1="36" x2="20" y2="36" stroke={stroke} strokeWidth="1.0" strokeLinecap="round"/>
      </svg>

      {/* Name + Mvar */}
      <div style={{
        position: 'absolute', top: -18, left: '50%', transform: 'translateX(-50%)',
        whiteSpace: 'nowrap', fontSize: 9.5, fontWeight: 700, color: '#0a1a2a',
        fontFamily: "'Segoe UI', Arial, sans-serif",
      }}>{p.name}</div>
      <div style={{
        position: 'absolute', bottom: -14, left: '50%', transform: 'translateX(-50%)',
        whiteSpace: 'nowrap', fontSize: 8.5, color: '#005a8a',
        fontFamily: 'Consolas, monospace',
      }}>{Qeff.toFixed(1)} Mvar</div>
    </div>
  )
}

export default memo(CapacitorNode)
