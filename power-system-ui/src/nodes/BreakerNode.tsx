import { memo } from 'react'
import { Handle, Position, NodeProps } from 'reactflow'
import type { NodeData, BreakerProperties } from '../types'

const H = { background: '#0a0a1a', border: '2px solid #fff', width: 6, height: 6, borderRadius: 1 }

function BreakerNode({ data, selected }: NodeProps<NodeData>) {
  const p = data.props as BreakerProperties
  const closed = p.is_closed
  const stroke = selected ? '#1a3a8a' : '#0a0a1a'
  const fill   = closed ? '#f4f4f8' : '#fff4f0'

  return (
    <div style={{ width: 22, userSelect: 'none', textAlign: 'center' }}>
      <Handle type="target" position={Position.Top}    id="top"    style={H} />
      <Handle type="source" position={Position.Bottom} id="bottom" style={H} />
      <Handle type="target" position={Position.Left}   id="left"   style={{ ...H, opacity: 0 }} />
      <Handle type="source" position={Position.Right}  id="right"  style={{ ...H, opacity: 0 }} />

      {/* IEC CB symbol */}
      <svg width="22" height="38" viewBox="0 0 22 38">
        {/* Top wire */}
        <line x1="11" y1="0" x2="11" y2="7" stroke={stroke} strokeWidth="2" strokeLinecap="round"/>
        {/* Body */}
        <rect x="2" y="7" width="18" height="24" rx="1" fill={fill} stroke={stroke}
          strokeWidth={selected ? 2 : 1.8}/>
        {closed ? (
          <>
            <line x1="5"  y1="10" x2="17" y2="28" stroke={stroke} strokeWidth="1.4"/>
            <line x1="17" y1="10" x2="5"  y2="28" stroke={stroke} strokeWidth="1.4"/>
          </>
        ) : (
          <>
            <line x1="11" y1="9"  x2="11" y2="15" stroke="#c03000" strokeWidth="1.6"/>
            <line x1="11" y1="21" x2="11" y2="27" stroke="#c03000" strokeWidth="1.6"/>
          </>
        )}
        {/* Bottom wire */}
        <line x1="11" y1="31" x2="11" y2="38" stroke={stroke} strokeWidth="2" strokeLinecap="round"/>
      </svg>

      <div style={{ fontSize: 7.5, color: '#3a3a5a', fontFamily: 'Consolas, monospace', marginTop: 1 }}>
        {p.name}
      </div>
    </div>
  )
}

export default memo(BreakerNode)
