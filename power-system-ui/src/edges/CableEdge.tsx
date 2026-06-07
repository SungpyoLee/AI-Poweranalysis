import { memo } from 'react'
import { EdgeProps, getSmoothStepPath, EdgeLabelRenderer } from 'reactflow'
import type { EdgeData } from '../types'
import { useAnalysisStore } from '../store/useAnalysisStore'

function CableEdge({
  id, sourceX, sourceY, sourcePosition,
  targetX, targetY, targetPosition,
  data, selected,
}: EdgeProps<EdgeData>) {
  const [edgePath, labelX, labelY] = getSmoothStepPath({
    sourceX, sourceY, sourcePosition,
    targetX, targetY, targetPosition,
    borderRadius: 0,
    offset: 20,
  })

  const p          = data?.cable
  const lineResult = useAnalysisStore(s => s.loadflow?.lines[id])
  const sizingResult = useAnalysisStore(s => s.cableSizing?.cables[id])

  const loadingColor =
    !lineResult                           ? null
    : lineResult.loading_percent >= 80   ? '#c00000'
    : lineResult.loading_percent >= 60   ? '#c07000'
    : '#006030'

  const stroke  = selected ? '#1a5aff' : (loadingColor ?? '#0a0a1e')
  const strokeW = selected ? 2.2 : (lineResult ? 2.0 : 1.6)

  // #14 전력 흐름 방향 화살표
  const showArrow = !!lineResult
  const arrowDir  = lineResult && lineResult.p_from_mw < 0 ? 'reverse' : 'forward'

  return (
    <>
      {/* SVG defs — arrow marker */}
      {showArrow && (
        <defs>
          <marker
            id={`arrow-${id}`}
            markerWidth="7" markerHeight="7"
            refX="5" refY="3.5"
            orient={arrowDir === 'forward' ? 'auto' : 'auto-start-reverse'}
          >
            <polygon
              points="0 0, 7 3.5, 0 7"
              fill={stroke}
              opacity={0.85}
            />
          </marker>
        </defs>
      )}
      {selected && (
        <path d={edgePath} fill="none" stroke="#4a8aff" strokeWidth={8} strokeOpacity={0.2}/>
      )}
      <path
        id={id}
        d={edgePath}
        fill="none"
        stroke={stroke}
        strokeWidth={strokeW}
        markerEnd={showArrow && arrowDir === 'forward'  ? `url(#arrow-${id})` : undefined}
        markerStart={showArrow && arrowDir === 'reverse' ? `url(#arrow-${id})` : undefined}
        style={{ cursor: 'pointer' }}
      />

      <EdgeLabelRenderer>
        {/* Results overlay — always visible when results exist and not selected */}
        {lineResult && !selected && (
          <div
            className="nodrag nopan"
            style={{
              position: 'absolute',
              transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
              background: loadingColor === '#c00000' ? '#fff0f0'
                : loadingColor === '#c07000' ? '#fff8e0' : '#f0fff4',
              border: `1px solid ${loadingColor}`,
              borderRadius: 2,
              padding: '1px 4px',
              fontSize: 8,
              fontFamily: 'Consolas, monospace',
              color: loadingColor!,
              pointerEvents: 'none',
              whiteSpace: 'nowrap',
            }}
          >
            {(lineResult.i_ka * 1000).toFixed(0)}A · {lineResult.loading_percent.toFixed(0)}% · ΔV{lineResult.vdrop_percent.toFixed(2)}%
          </div>
        )}

        {/* Cable sizing overlay */}
        {sizingResult && !selected && !lineResult && (
          <div
            className="nodrag nopan"
            style={{
              position: 'absolute',
              transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
              background: sizingResult.severity === 'FAIL'    ? '#fde8e8'
                        : sizingResult.severity === 'WARNING' ? '#fff5dc' : '#e6f4ec',
              border: `1px solid ${
                sizingResult.severity === 'FAIL'    ? '#e08080'
                : sizingResult.severity === 'WARNING' ? '#c8a040' : '#80b090'
              }`,
              borderRadius: 2,
              padding: '1px 5px',
              fontSize: 8,
              fontFamily: 'Consolas, monospace',
              color: sizingResult.severity === 'FAIL'    ? '#b02000'
                   : sizingResult.severity === 'WARNING' ? '#8a5a00' : '#005a20',
              pointerEvents: 'none',
              whiteSpace: 'nowrap',
            }}
          >
            {sizingResult.severity === 'PASS'
              ? `✓ ${sizingResult.existingMM2}mm²`
              : `→ ${sizingResult.recommendedModel.replace(/^.*?(\d+sq).*$/, '$1').replace('sq', 'mm²') || sizingResult.recommendedMM2 + 'mm²'}`
            }
          </div>
        )}

        {/* Selection label */}
        {p && selected && (
          <div
            className="nodrag nopan"
            style={{
              position: 'absolute',
              transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
              background: '#eef4ff',
              border: '1px solid #4a8aff',
              borderRadius: 2,
              padding: '2px 6px',
              fontSize: 8.5,
              fontFamily: 'Consolas, monospace',
              color: '#1a2030',
              pointerEvents: 'all',
              whiteSpace: 'nowrap',
              boxShadow: '0 1px 3px rgba(0,0,0,0.12)',
            }}
          >
            <div>{p.name} · {p.length_m} m</div>
            {lineResult && (
              <div style={{ color: loadingColor ?? '#555', marginTop: 1 }}>
                I={( lineResult.i_ka * 1000).toFixed(1)}A · {lineResult.loading_percent.toFixed(1)}% · ΔV={lineResult.vdrop_percent.toFixed(3)}%
              </div>
            )}
            {sizingResult && (
              <div style={{
                marginTop: 1,
                color: sizingResult.severity === 'FAIL' ? '#b02000'
                     : sizingResult.severity === 'WARNING' ? '#8a5a00' : '#005a20',
              }}>
                {sizingResult.severity === 'PASS' ? '✓' : '→'} {sizingResult.recommendedModel}
              </div>
            )}
          </div>
        )}
      </EdgeLabelRenderer>
    </>
  )
}

export default memo(CableEdge)
