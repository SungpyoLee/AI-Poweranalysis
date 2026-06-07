import { memo } from 'react'
import { Handle, Position, NodeProps } from 'reactflow'
import type { NodeData, Generator } from '../types'

const W = 44

function GeneratorNode({ data, selected }: NodeProps<NodeData>) {
  const p = data.equipment as Generator
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

      <svg width={W} height={W} viewBox={`0 0 ${W} ${W}`}>
        <circle cx={cx} cy={cx} r="20" fill="#fff" stroke={stroke} strokeWidth={selected ? 2.2 : 1.8}/>
        <text x={cx} y={cx - 1} textAnchor="middle" fill={stroke}
          fontSize="13" fontWeight="bold" fontFamily="'Segoe UI', Arial, sans-serif">G</text>
        <path d={`M${cx-12},${cx+9} Q${cx-8},${cx+3} ${cx-4},${cx+9} Q${cx},${cx+15} ${cx+4},${cx+9} Q${cx+8},${cx+3} ${cx+12},${cx+9}`}
          fill="none" stroke={stroke} strokeWidth="1.6" strokeLinecap="round"/>
        {selected && <circle cx={cx} cy={cx} r="22" fill="none" stroke="#4a8aff" strokeWidth="1" strokeDasharray="3 2"/>}
      </svg>

      <div style={{ fontFamily: 'Consolas, monospace', fontSize: 9, color: '#0a0a1a', lineHeight: 1.4, marginTop: 1 }}>
        <div style={{ fontWeight: 700 }}>{p.name}</div>
        <div style={{ color: '#3a3a6a' }}>{p.p_mw} MW</div>
        <div style={{ fontSize: 8, color: '#5a5a8a' }}>{p.vn_kv} kV</div>
      </div>
    </div>
  )
}

export default memo(GeneratorNode)
