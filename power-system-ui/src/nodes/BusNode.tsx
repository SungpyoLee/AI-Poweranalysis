import { memo } from 'react'
import { Handle, Position, NodeProps } from 'reactflow'
import type { NodeData, BusProperties } from '../types'

function BusNode({ data, selected }: NodeProps<NodeData>) {
  const p = data.props as BusProperties
  const busWidth: number = (data as any).busWidth ?? 220
  const slots: number[] = (data as any).slots ?? [busWidth / 2]
  const voltColor = p.vn_kv >= 100 ? '#8b0000' : p.vn_kv >= 10 ? '#00008b' : '#005500'

  return (
    <div style={{ position: 'relative', width: busWidth, height: 14, userSelect: 'none' }}>
      {/* Incoming handle — top center */}
      <Handle type="target" position={Position.Top} id="top"
        style={{ left: busWidth / 2, top: 0, width: 10, height: 10,
          background: 'transparent', border: 'none',
          transform: 'translate(-50%, -50%)', zIndex: 10 }} />

      {/* Bus bar */}
      <div style={{
        position: 'absolute', inset: 0,
        background: selected ? '#1a5aff' : '#0a0a1e',
        borderRadius: 2,
        boxShadow: selected ? '0 0 0 2px #4a8aff44' : 'none',
      }} />

      {/* Name — above */}
      <div style={{
        position: 'absolute', bottom: 19, left: '50%',
        transform: 'translateX(-50%)', whiteSpace: 'nowrap',
        fontSize: 10.5, fontWeight: 700, color: '#0a1a2a',
        fontFamily: "'Segoe UI', Arial, sans-serif", pointerEvents: 'none',
      }}>{p.name}</div>

      {/* Voltage + type — below */}
      <div style={{
        position: 'absolute', top: 18, left: '50%',
        transform: 'translateX(-50%)', whiteSpace: 'nowrap',
        display: 'flex', alignItems: 'center', gap: 4, pointerEvents: 'none',
      }}>
        <span style={{ fontSize: 9.5, fontWeight: 700, color: voltColor, fontFamily: 'Consolas, monospace' }}>
          {p.vn_kv} kV
        </span>
        <span style={{
          fontSize: 8, background: voltColor + '18', color: voltColor,
          border: `1px solid ${voltColor}44`, borderRadius: 2, padding: '0 3px',
        }}>{p.busType}</span>
      </div>

      {/* Slot handles — bottom */}
      {slots.map((offsetX, i) => (
        <Handle key={i} type="source" position={Position.Bottom} id={`s${i}`}
          style={{ left: offsetX, bottom: 0, width: 10, height: 10,
            background: 'transparent', border: 'none',
            transform: 'translate(-50%, 50%)', zIndex: 10 }} />
      ))}
    </div>
  )
}

export default memo(BusNode)
