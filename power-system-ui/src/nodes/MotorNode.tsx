import { memo } from 'react'
import { Handle, Position, NodeProps } from 'reactflow'
import type { NodeData, MotorProperties } from '../types'

const H = { background: '#0a0a1a', border: '2px solid #fff', width: 8, height: 8, borderRadius: 2 }

function MotorNode({ data, selected }: NodeProps<NodeData>) {
  const p = data.props as MotorProperties
  const stroke = selected ? '#1a3a8a' : '#0a0a1a'

  return (
    <div style={{ width: 56, userSelect: 'none', textAlign: 'center' }}>
      <Handle type="target" position={Position.Top} id="top" style={H} />

      {/* IEC motor: circle with M */}
      <svg width="56" height="56" viewBox="0 0 56 56">
        <circle cx="28" cy="28" r="25" fill="#fff" stroke={stroke} strokeWidth={selected ? 2.5 : 2}/>
        {selected && <circle cx="28" cy="28" r="28" fill="none" stroke="#4a7ae8" strokeWidth="1" strokeDasharray="3 2"/>}
        <text x="28" y="33" textAnchor="middle" fill={stroke}
          fontSize="18" fontWeight="bold" fontFamily="'Segoe UI', Arial, sans-serif">M</text>
      </svg>

      <div style={{ fontFamily: 'Consolas, monospace', fontSize: 9, color: '#0a0a1a', lineHeight: 1.4 }}>
        <div style={{ fontWeight: 700 }}>{p.name}</div>
        <div style={{ color: '#3a3a6a' }}>{p.p_kw} kW</div>
        <div style={{ color: '#5a5a8a', fontSize: 8 }}>{p.vn_kv} kV</div>
      </div>
    </div>
  )
}

export default memo(MotorNode)
