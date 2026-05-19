import { memo } from 'react'
import { Handle, Position, NodeProps } from 'reactflow'
import type { NodeData, TransformerProperties } from '../types'

const H = { background: '#0a0a1a', border: '2px solid #fff', width: 8, height: 8, borderRadius: 2 }

function TransformerNode({ data, selected }: NodeProps<NodeData>) {
  const p = data.props as TransformerProperties
  const stroke = selected ? '#1a3a8a' : '#0a0a1a'

  return (
    <div style={{ width: 56, userSelect: 'none', textAlign: 'center' }}>
      <Handle type="target" position={Position.Top}    id="top"    style={H} />
      <Handle type="source" position={Position.Bottom} id="bottom" style={H} />

      {/* IEC 2-winding transformer: two tangent circles */}
      <svg width="56" height="76" viewBox="0 0 56 76">
        <circle cx="28" cy="19" r="17" fill="#fff" stroke={stroke} strokeWidth={selected ? 2.5 : 2}/>
        <circle cx="28" cy="57" r="17" fill="#fff" stroke={stroke} strokeWidth={selected ? 2.5 : 2}/>
        {selected && <circle cx="28" cy="19" r="20" fill="none" stroke="#4a7ae8" strokeWidth="1" strokeDasharray="3 2"/>}
        {selected && <circle cx="28" cy="57" r="20" fill="none" stroke="#4a7ae8" strokeWidth="1" strokeDasharray="3 2"/>}
      </svg>

      <div style={{ fontFamily: 'Consolas, monospace', fontSize: 9, color: '#0a0a1a', lineHeight: 1.4 }}>
        <div style={{ fontWeight: 700 }}>{p.name}</div>
        <div style={{ color: '#3a3a6a' }}>{p.sn_mva} MVA</div>
        <div style={{ color: '#5a5a8a', fontSize: 8 }}>{p.vn_hv_kv}/{p.vn_lv_kv} kV</div>
      </div>
    </div>
  )
}

export default memo(TransformerNode)
