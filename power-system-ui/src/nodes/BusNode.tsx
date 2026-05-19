import { memo } from 'react'
import { Handle, Position, NodeProps } from 'reactflow'
import type { NodeData, BusProperties } from '../types'

const HANDLE = {
  background: '#1a1a2e',
  border: '2px solid #fff',
  width: 8, height: 8, borderRadius: 2,
}

function BusNode({ data, selected }: NodeProps<NodeData>) {
  const p = data.props as BusProperties
  return (
    <div style={{ width: 240, userSelect: 'none' }}>
      {/* Handles */}
      <Handle type="target" position={Position.Top}    id="top"    style={HANDLE} />
      <Handle type="source" position={Position.Bottom} id="bottom" style={HANDLE} />
      <Handle type="source" position={Position.Left}   id="left"   style={HANDLE} />
      <Handle type="target" position={Position.Left}   id="left-t" style={{ ...HANDLE, opacity: 0 }} />
      <Handle type="source" position={Position.Right}  id="right"  style={HANDLE} />
      <Handle type="target" position={Position.Right}  id="right-t"style={{ ...HANDLE, opacity: 0 }} />

      {/* Label row */}
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
        padding: '0 2px', marginBottom: 3,
        fontFamily: "'Segoe UI', Arial, sans-serif",
      }}>
        <span style={{ fontSize: 10, fontWeight: 700, color: '#0a0a1a' }}>{p.name}</span>
        <span style={{ fontSize: 9, color: '#1a3a8a', fontFamily: 'Consolas, monospace', fontWeight: 600 }}>
          {p.vn_kv} kV
        </span>
      </div>

      {/* Bus bar */}
      <div style={{
        height: 8,
        background: selected ? '#1a3a8a' : '#0a0a1a',
        borderRadius: 1,
        boxShadow: selected ? '0 0 0 2px #4a7ae8' : 'none',
        transition: 'background 0.15s',
      }} />

      {/* Sub-label */}
      <div style={{
        padding: '2px 2px 0',
        fontSize: 8.5,
        color: '#5a6a7a',
        fontFamily: 'Consolas, monospace',
        display: 'flex', gap: 8,
      }}>
        <span>{p.busType}</span>
      </div>
    </div>
  )
}

export default memo(BusNode)
