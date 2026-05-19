import { memo } from 'react'
import { Handle, Position, NodeProps } from 'reactflow'
import type { NodeData, TransformerProperties } from '../types'

const W = 44

function TransformerNode({ data, selected }: NodeProps<NodeData>) {
  const p = data.props as TransformerProperties
  const stroke = selected ? '#1a3aff' : '#0a0a1e'
  const cx = W / 2

  return (
    <div style={{ width: W, userSelect: 'none', textAlign: 'center' }}>
      <Handle type="target" position={Position.Top} id="top"
        style={{ left: cx, top: 0, width: 8, height: 8,
          background: 'transparent', border: 'none', transform: 'translate(-50%, -50%)' }} />
      <Handle type="source" position={Position.Bottom} id="bottom"
        style={{ left: cx, bottom: 0, width: 8, height: 8,
          background: 'transparent', border: 'none', transform: 'translate(-50%, 50%)' }} />

      {/* IEC two-winding transformer: two tangent circles */}
      <svg width={W} height={64} viewBox={`0 0 ${W} 64`}>
        <line x1={cx} y1="0" x2={cx} y2="10" stroke={stroke} strokeWidth="2"/>
        <circle cx={cx} cy="20" r="16" fill="#fff" stroke={stroke} strokeWidth={selected ? 2.2 : 1.8}/>
        <circle cx={cx} cy="44" r="16" fill="#fff" stroke={stroke} strokeWidth={selected ? 2.2 : 1.8}/>
        <line x1={cx} y1="60" x2={cx} y2="64" stroke={stroke} strokeWidth="2"/>
        {selected && <>
          <circle cx={cx} cy="20" r="19" fill="none" stroke="#4a8aff" strokeWidth="1" strokeDasharray="3 2"/>
          <circle cx={cx} cy="44" r="19" fill="none" stroke="#4a8aff" strokeWidth="1" strokeDasharray="3 2"/>
        </>}
      </svg>

      <div style={{ fontFamily: 'Consolas, monospace', fontSize: 9, color: '#0a0a1a', lineHeight: 1.4, marginTop: 2 }}>
        <div style={{ fontWeight: 700 }}>{p.name}</div>
        <div style={{ color: '#3a3a6a' }}>{p.sn_mva} MVA</div>
        <div style={{ fontSize: 8, color: '#5a5a8a' }}>{p.vn_hv_kv}/{p.vn_lv_kv} kV</div>
      </div>
    </div>
  )
}

export default memo(TransformerNode)
