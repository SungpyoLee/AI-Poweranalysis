/**
 * TCCChart — SVG log-log Time-Current Characteristics viewer (IEC 60255)
 * Pure presentational component; data computed by buildTCCData().
 */
import type { TCCData } from '../engine/tcc'

// Virtual canvas dimensions
const VW = 700, VH = 220
const ML = 54, MR = 110, MT = 18, MB = 36
const PW = VW - ML - MR  // 536
const PH = VH - MT - MB  // 166

function logCx(I: number, xMin: number, xMax: number): number {
  return ML + (Math.log10(I / xMin) / Math.log10(xMax / xMin)) * PW
}

function logCy(t: number, yMin: number, yMax: number): number {
  return MT + PH - (Math.log10(t / yMin) / Math.log10(yMax / yMin)) * PH
}

interface Props { data: TCCData }

export default function TCCChart({ data }: Props) {
  const { curves, faultLines, margins, cableWithstands, transformerDamages, xMin, xMax, yMin, yMax } = data

  if (curves.length === 0) {
    return (
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        height: 198, color: '#9aaabb', fontSize: 11,
        fontFamily: "'Segoe UI', 'Malgun Gothic', sans-serif",
      }}>
        No relay data — run Short Circuit with relays configured
      </div>
    )
  }

  // Build grid line sets
  const xGrid: { val: number; major: boolean }[] = []
  for (let exp = Math.floor(Math.log10(xMin)); exp <= Math.ceil(Math.log10(xMax)); exp++) {
    for (const mult of [1, 2, 3, 5]) {
      const val = Math.pow(10, exp) * mult
      if (val >= xMin * 0.9999 && val <= xMax * 1.0001) xGrid.push({ val, major: mult === 1 })
    }
  }

  const yGrid: { val: number; major: boolean }[] = []
  for (let exp = Math.floor(Math.log10(yMin)); exp <= Math.ceil(Math.log10(yMax)); exp++) {
    for (const mult of [1, 2, 5]) {
      const val = Math.pow(10, exp) * mult
      if (val >= yMin * 0.9999 && val <= yMax * 1.0001) yGrid.push({ val, major: mult === 1 })
    }
  }

  return (
    <svg
      viewBox={`0 0 ${VW} ${VH}`}
      style={{ width: '100%', height: 198, display: 'block' }}
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <clipPath id="tcc-plot-clip">
          <rect x={ML} y={MT} width={PW} height={PH} />
        </clipPath>
      </defs>

      {/* Plot background */}
      <rect x={ML} y={MT} width={PW} height={PH} fill="#fafbfc" />
      <rect x={ML} y={MT} width={PW} height={PH} fill="none" stroke="#c0c8d0" strokeWidth={0.5} />

      {/* X grid */}
      {xGrid.map(({ val, major }) => {
        const x = logCx(val, xMin, xMax)
        return (
          <line key={`xg-${val}`}
            x1={x} y1={MT} x2={x} y2={MT + PH}
            stroke={major ? '#c0c8d0' : '#dde4ea'}
            strokeWidth={major ? 0.5 : 0.3} />
        )
      })}

      {/* Y grid */}
      {yGrid.map(({ val, major }) => {
        const y = logCy(val, yMin, yMax)
        return (
          <line key={`yg-${val}`}
            x1={ML} y1={y} x2={ML + PW} y2={y}
            stroke={major ? '#c0c8d0' : '#dde4ea'}
            strokeWidth={major ? 0.5 : 0.3} />
        )
      })}

      {/* X axis labels — decades only */}
      {xGrid.filter(g => g.major).map(({ val }) => {
        const x = logCx(val, xMin, xMax)
        const label = val >= 1000 ? `${val / 1000}k` : String(val)
        return (
          <text key={`xl-${val}`} x={x} y={MT + PH + 13}
            textAnchor="middle" fontSize={8} fill="#5a6a7a"
            fontFamily="Consolas, monospace">
            {label}
          </text>
        )
      })}

      {/* Y axis labels — decades only */}
      {yGrid.filter(g => g.major).map(({ val }) => {
        const y = logCy(val, yMin, yMax)
        return (
          <text key={`yl-${val}`} x={ML - 4} y={y + 3}
            textAnchor="end" fontSize={8} fill="#5a6a7a"
            fontFamily="Consolas, monospace">
            {val < 1 ? val.toString() : String(val)}
          </text>
        )
      })}

      {/* Axis titles */}
      <text x={ML + PW / 2} y={VH - 2} textAnchor="middle"
        fontSize={8.5} fill="#3a4a5a"
        fontFamily="'Segoe UI', 'Malgun Gothic', sans-serif" fontWeight="bold">
        Current (A)
      </text>
      <text x={9} y={MT + PH / 2} textAnchor="middle"
        fontSize={8.5} fill="#3a4a5a"
        fontFamily="'Segoe UI', 'Malgun Gothic', sans-serif" fontWeight="bold"
        transform={`rotate(-90, 9, ${MT + PH / 2})`}>
        Time (s)
      </text>

      {/* Fault current lines (dashed) */}
      {faultLines.map(fl => {
        const x = logCx(fl.current_a, xMin, xMax)
        if (x < ML || x > ML + PW) return null
        return (
          <g key={`fl-${fl.current_a}`}>
            <line x1={x} y1={MT} x2={x} y2={MT + PH}
              stroke="#c04000" strokeWidth={1} strokeDasharray="5,3" opacity={0.75} />
            <text x={x + 3} y={MT + 11} fontSize={7} fill="#c04000"
              fontFamily="Consolas, monospace">
              {fl.label}
            </text>
          </g>
        )
      })}

      {/* Relay curves (clipped to plot area) */}
      <g clipPath="url(#tcc-plot-clip)">
        {curves.map(curve => {
          let d = ''
          for (let i = 0; i < curve.points.length; i++) {
            const px = logCx(curve.points[i].x, xMin, xMax)
            const py = logCy(curve.points[i].y, yMin, yMax)
            d += `${i === 0 ? 'M' : 'L'}${px.toFixed(1)},${py.toFixed(1)} `
          }
          return (
            <g key={`c-${curve.breakerId}`}>
              {d && (
                <path d={d.trimEnd()} fill="none"
                  stroke={curve.color} strokeWidth={1.5} strokeLinejoin="round" />
              )}
              {curve.instSegment && (
                <line
                  x1={logCx(curve.instSegment[0].x, xMin, xMax)}
                  y1={logCy(curve.instSegment[0].y, yMin, yMax)}
                  x2={logCx(curve.instSegment[1].x, xMin, xMax)}
                  y2={logCy(curve.instSegment[1].y, yMin, yMax)}
                  stroke={curve.color} strokeWidth={2.5} />
              )}
            </g>
          )
        })}
      </g>

      {/* Operating point dots */}
      {curves.map(curve => {
        if (curve.instTrip || curve.operatingTime_s <= 0 || !isFinite(curve.operatingTime_s)) return null
        const fx = logCx(curve.faultCurrent_a, xMin, xMax)
        const fy = logCy(curve.operatingTime_s, yMin, yMax)
        if (fx < ML || fx > ML + PW || fy < MT || fy > MT + PH) return null
        return (
          <circle key={`dot-${curve.breakerId}`}
            cx={fx} cy={fy} r={3.5}
            fill={curve.color} stroke="#fff" strokeWidth={1} />
        )
      })}

      {/* Pickup triangles at bottom of chart */}
      {curves.map(curve => {
        const px = logCx(curve.pickup_a, xMin, xMax)
        if (px < ML || px > ML + PW) return null
        const py = MT + PH
        return (
          <polygon key={`tri-${curve.breakerId}`}
            points={`${px},${py} ${px - 4},${py + 8} ${px + 4},${py + 8}`}
            fill={curve.color} opacity={0.85} />
        )
      })}

      {/* Cable short-time withstand curves (dashed brown) */}
      <g clipPath="url(#tcc-plot-clip)">
        {(cableWithstands ?? []).map(cw => {
          let d = ''
          for (let i = 0; i < cw.points.length; i++) {
            const px = logCx(cw.points[i].x, xMin, xMax)
            const py = logCy(cw.points[i].y, yMin, yMax)
            d += `${i === 0 ? 'M' : 'L'}${px.toFixed(1)},${py.toFixed(1)} `
          }
          return d ? (
            <path key={`cw-${cw.cableId}`} d={d.trimEnd()} fill="none"
              stroke="#8a5a00" strokeWidth={1.2} strokeDasharray="4,2" opacity={0.7} />
          ) : null
        })}
      </g>

      {/* Transformer damage curves (dashed magenta) */}
      <g clipPath="url(#tcc-plot-clip)">
        {(transformerDamages ?? []).map(td => {
          const buildPath = (pts: {x:number;y:number}[]) => {
            let d = ''
            for (let i = 0; i < pts.length; i++) {
              const px = logCx(pts[i].x, xMin, xMax)
              const py = logCy(pts[i].y, yMin, yMax)
              d += `${i === 0 ? 'M' : 'L'}${px.toFixed(1)},${py.toFixed(1)} `
            }
            return d.trimEnd()
          }
          return (
            <g key={`td-${td.transformerId}`}>
              {td.freqFaultPoints.length > 0 && (
                <path d={buildPath(td.freqFaultPoints)} fill="none"
                  stroke="#9900aa" strokeWidth={1.2} strokeDasharray="6,2" opacity={0.7} />
              )}
              {td.rareFaultPoints.length > 0 && td.sn_mva >= 5 && (
                <path d={buildPath(td.rareFaultPoints)} fill="none"
                  stroke="#9900aa" strokeWidth={0.8} strokeDasharray="3,3" opacity={0.5} />
              )}
            </g>
          )
        })}
      </g>

      {/* Coordination margin arrows */}
      {margins.map((m, i) => {
        const x = logCx(m.current_a, xMin, xMax)
        if (x < ML || x > ML + PW) return null
        const y1 = logCy(m.time_low_s, yMin, yMax)
        const y2 = logCy(m.time_high_s, yMin, yMax)
        if (y1 < MT || y1 > MT + PH || y2 < MT || y2 > MT + PH) return null
        const mx = x + 14 + i * 12
        const color = m.pass ? '#006020' : '#b02000'
        const A = 4
        return (
          <g key={`mg-${i}`}>
            <line x1={mx} y1={y2 + A} x2={mx} y2={y1 - A} stroke={color} strokeWidth={1} />
            <polygon points={`${mx},${y2} ${mx - A / 2},${y2 + A} ${mx + A / 2},${y2 + A}`} fill={color} />
            <polygon points={`${mx},${y1} ${mx - A / 2},${y1 - A} ${mx + A / 2},${y1 - A}`} fill={color} />
            <text x={mx + 3} y={(y1 + y2) / 2 + 3} fontSize={7} fill={color}
              fontFamily="Consolas, monospace">
              {m.margin_s.toFixed(2)}s
            </text>
          </g>
        )
      })}

      {/* Legend — relay curves */}
      {curves.map((curve, i) => {
        const lx = ML + PW + 8
        const ly = MT + 8 + i * 26
        return (
          <g key={`leg-${curve.breakerId}`}>
            <line x1={lx} y1={ly + 5} x2={lx + 18} y2={ly + 5}
              stroke={curve.color} strokeWidth={2} />
            <text x={lx + 22} y={ly + 5} dominantBaseline="middle"
              fontSize={8.5} fill="#1a2838"
              fontFamily="'Segoe UI', 'Malgun Gothic', sans-serif" fontWeight="bold">
              {curve.breakerName}
            </text>
            <text x={lx + 22} y={ly + 16}
              fontSize={7} fill="#5a6a7a"
              fontFamily="Consolas, monospace">
              {curve.busName} · {curve.pickup_a}A
            </text>
          </g>
        )
      })}

      {/* Legend — cable withstand */}
      {(cableWithstands ?? []).slice(0, 3).map((cw, i) => {
        const lx = ML + PW + 8
        const ly = MT + 8 + (curves.length + i) * 22 + 10
        return (
          <g key={`cwleg-${cw.cableId}`}>
            <line x1={lx} y1={ly + 4} x2={lx + 18} y2={ly + 4}
              stroke="#8a5a00" strokeWidth={1.2} strokeDasharray="4,2" opacity={0.8} />
            <text x={lx + 22} y={ly + 4} dominantBaseline="middle"
              fontSize={7.5} fill="#8a5a00" fontFamily="Consolas, monospace">
              {cw.cableName} {cw.mm2}mm²
            </text>
          </g>
        )
      })}

      {/* Legend — transformer damage */}
      {(transformerDamages ?? []).slice(0, 2).map((td, i) => {
        const lx = ML + PW + 8
        const ly = MT + 8 + (curves.length + (cableWithstands?.length ?? 0) + i) * 22 + 14
        return (
          <g key={`tdleg-${td.transformerId}`}>
            <line x1={lx} y1={ly + 4} x2={lx + 18} y2={ly + 4}
              stroke="#9900aa" strokeWidth={1.2} strokeDasharray="6,2" opacity={0.75} />
            <text x={lx + 22} y={ly + 4} dominantBaseline="middle"
              fontSize={7.5} fill="#9900aa" fontFamily="Consolas, monospace">
              {td.transformerName} TF Damage
            </text>
          </g>
        )
      })}
    </svg>
  )
}
