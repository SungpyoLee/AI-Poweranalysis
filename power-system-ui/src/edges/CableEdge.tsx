import { memo } from 'react'
import { EdgeProps, getStraightPath, EdgeLabelRenderer } from 'reactflow'
import type { EdgeData } from '../types'

function CableEdge({
  id, sourceX, sourceY, targetX, targetY,
  data, selected, markerEnd,
}: EdgeProps<EdgeData>) {
  const [edgePath, labelX, labelY] = getStraightPath({ sourceX, sourceY, targetX, targetY })
  const p = data?.props
  const stroke = selected ? '#1a3a8a' : '#0a0a1a'
  const strokeW = selected ? 2.5 : 1.8

  return (
    <>
      {/* Selection halo */}
      {selected && (
        <path d={edgePath} fill="none" stroke="#4a7ae8" strokeWidth={8} strokeOpacity={0.25}/>
      )}
      {/* Main cable line */}
      <path
        id={id}
        d={edgePath}
        fill="none"
        stroke={stroke}
        strokeWidth={strokeW}
        markerEnd={markerEnd}
        style={{ cursor: 'pointer' }}
      />

      {/* Cable label (only when selected or named) */}
      {p && (
        <EdgeLabelRenderer>
          <div
            style={{
              position: 'absolute',
              transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
              background: selected ? '#eef4ff' : '#ffffff',
              border: `1px solid ${selected ? '#4a7ae8' : '#c8d0d8'}`,
              borderRadius: 2,
              padding: '1px 5px',
              fontSize: 8.5,
              fontFamily: 'Consolas, monospace',
              color: '#1a2030',
              pointerEvents: 'all',
              whiteSpace: 'nowrap',
              boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
            }}
            className="nodrag nopan"
          >
            {p.name} · {p.length_km} km
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  )
}

export default memo(CableEdge)
