import { memo } from 'react'
import { EdgeProps, getSmoothStepPath, EdgeLabelRenderer } from 'reactflow'
import type { EdgeData } from '../types'

function CableEdge({
  id, sourceX, sourceY, sourcePosition,
  targetX, targetY, targetPosition,
  data, selected,
}: EdgeProps<EdgeData>) {
  const [edgePath, labelX, labelY] = getSmoothStepPath({
    sourceX, sourceY, sourcePosition,
    targetX, targetY, targetPosition,
    borderRadius: 0,   // sharp right-angle corners — ETAP style
    offset: 20,
  })

  const p = data?.props
  const stroke = selected ? '#1a5aff' : '#0a0a1e'
  const strokeW = selected ? 2.2 : 1.6

  return (
    <>
      {selected && (
        <path d={edgePath} fill="none" stroke="#4a8aff" strokeWidth={8} strokeOpacity={0.2}/>
      )}
      <path
        id={id}
        d={edgePath}
        fill="none"
        stroke={stroke}
        strokeWidth={strokeW}
        style={{ cursor: 'pointer' }}
      />

      {p && selected && (
        <EdgeLabelRenderer>
          <div
            className="nodrag nopan"
            style={{
              position: 'absolute',
              transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
              background: '#eef4ff',
              border: '1px solid #4a8aff',
              borderRadius: 2,
              padding: '1px 5px',
              fontSize: 8.5,
              fontFamily: 'Consolas, monospace',
              color: '#1a2030',
              pointerEvents: 'all',
              whiteSpace: 'nowrap',
              boxShadow: '0 1px 3px rgba(0,0,0,0.12)',
            }}
          >
            {p.name} · {p.length_km} km
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  )
}

export default memo(CableEdge)
