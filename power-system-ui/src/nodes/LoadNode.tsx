import { memo } from 'react'
import { Handle, Position, NodeProps } from 'reactflow'
import type { NodeData, Load } from '../types'

const W = 44

function LoadNode({ data, selected }: NodeProps<NodeData>) {
  const p = data.equipment as Load
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

      {/* IEC load symbol: downward triangle + baseline */}
      <svg width={W} height={W} viewBox={`0 0 ${W} ${W}`}>
        <line x1={cx} y1="2" x2={cx} y2="12" stroke={stroke} strokeWidth="2" strokeLinecap="round"/>
        <polygon
          points={`${cx},${W - 4} ${cx - 14},12 ${cx + 14},12`}
          fill="#fff"
          stroke={stroke}
          strokeWidth={selected ? 2.2 : 1.8}
          strokeLinejoin="round"
        />
        <line x1={cx - 14} y1={W - 4} x2={cx + 14} y2={W - 4}
          stroke={stroke} strokeWidth="2" strokeLinecap="round"/>
        {selected && (
          <rect x="3" y="3" width={W - 6} height={W - 6} rx="2"
            fill="none" stroke="#4a8aff" strokeWidth="1" strokeDasharray="3 2"/>
        )}
      </svg>

      <div style={{ fontFamily: 'Consolas, monospace', fontSize: 9, color: '#0a0a1a', lineHeight: 1.4, marginTop: 1 }}>
        <div style={{ fontWeight: 700 }}>{p.name}</div>
        <div style={{ color: '#3a3a6a' }}>{p.p_kw} kW</div>
        <div style={{ fontSize: 8, color: '#5a5a8a' }}>{p.vn_kv} kV</div>
      </div>
    </div>
  )
}

export default memo(LoadNode)
