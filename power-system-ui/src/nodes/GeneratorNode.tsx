import { memo } from 'react'
import { Handle, Position, NodeProps } from 'reactflow'
import type { NodeData, GeneratorProperties } from '../types'

const H = { background: '#0a0a1a', border: '2px solid #fff', width: 8, height: 8, borderRadius: 2 }

function GeneratorNode({ data, selected }: NodeProps<NodeData>) {
  const p = data.props as GeneratorProperties
  const stroke = selected ? '#1a3a8a' : '#0a0a1a'

  return (
    <div style={{ width: 56, userSelect: 'none', textAlign: 'center' }}>
      <Handle type="target" position={Position.Top} id="top" style={H} />

      {/* IEC generator: circle with G~ */}
      <svg width="56" height="56" viewBox="0 0 56 56">
        <circle cx="28" cy="28" r="25" fill="#fff" stroke={stroke} strokeWidth={selected ? 2.5 : 2}/>
        {selected && <circle cx="28" cy="28" r="28" fill="none" stroke="#4a7ae8" strokeWidth="1" strokeDasharray="3 2"/>}
        <text x="28" y="27" textAnchor="middle" fill={stroke}
          fontSize="14" fontWeight="bold" fontFamily="'Segoe UI', Arial, sans-serif">G</text>
        {/* Sinewave ~ */}
        <path d="M14,36 Q17,30 20,36 Q23,42 26,36 Q29,30 32,36 Q35,42 38,36 Q40,33 42,36"
          fill="none" stroke={stroke} strokeWidth="1.6" strokeLinecap="round"/>
      </svg>

      <div style={{ fontFamily: 'Consolas, monospace', fontSize: 9, color: '#0a0a1a', lineHeight: 1.4 }}>
        <div style={{ fontWeight: 700 }}>{p.name}</div>
        <div style={{ color: '#3a3a6a' }}>{p.p_mw} MW</div>
        <div style={{ color: '#5a5a8a', fontSize: 8 }}>{p.vn_kv} kV</div>
      </div>
    </div>
  )
}

export default memo(GeneratorNode)
