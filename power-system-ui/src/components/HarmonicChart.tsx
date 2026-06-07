/**
 * HarmonicChart — SVG bar chart for per-harmonic voltage distortion (IEEE 519)
 */
import type { HarmonicBusResult } from '../types'
import { HARM_ORDERS } from '../engine/harmonics'

const VW = 280, VH = 170
const ML = 36, MR = 10, MT = 14, MB = 32
const PW = VW - ML - MR   // 234
const PH = VH - MT - MB   // 124

function barColor(d: number, limit: number): string {
  if (d > limit)        return '#b02000'
  if (d > limit * 0.6)  return '#8a5a00'
  return '#006030'
}
function barBg(d: number, limit: number): string {
  if (d > limit)        return '#fde8e8'
  if (d > limit * 0.6)  return '#fff5dc'
  return '#e6f4ec'
}

interface Props { result: HarmonicBusResult | null }

export default function HarmonicChart({ result }: Props) {
  if (!result) {
    return (
      <div style={{
        width: VW, height: VH, display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: '#9aaabb', fontSize: 10, fontFamily: "'Segoe UI', sans-serif",
        flexShrink: 0,
      }}>
        Select a bus row
      </div>
    )
  }

  const { distortion, ieee519_limit, thdv_percent, busName } = result
  const values = HARM_ORDERS.map(h => distortion[h] ?? 0)
  const maxVal = Math.max(...values, ieee519_limit * 1.2, 0.1)

  const barW   = Math.floor(PW / HARM_ORDERS.length) - 4
  const barSpacing = PW / HARM_ORDERS.length

  const cy = (v: number) => MT + PH - (v / maxVal) * PH
  const limitY = cy(ieee519_limit)

  // Y-axis ticks
  const tickCount = 4
  const tickStep  = maxVal / tickCount
  const ticks: number[] = Array.from({ length: tickCount + 1 }, (_, i) => i * tickStep)

  return (
    <svg
      width={VW} height={VH}
      style={{ flexShrink: 0, display: 'block', background: '#f8fafb', borderLeft: '1px solid #d0d8e0' }}
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* Title */}
      <text x={ML + PW / 2} y={10} textAnchor="middle"
        fontSize={8.5} fill="#1a2838" fontFamily="'Segoe UI', sans-serif" fontWeight="bold">
        {busName} — Harmonic Distortion
      </text>

      {/* Plot background */}
      <rect x={ML} y={MT} width={PW} height={PH} fill="#fafbfc" />
      <rect x={ML} y={MT} width={PW} height={PH} fill="none" stroke="#c8d4dc" strokeWidth={0.5} />

      {/* Y-axis ticks + grid */}
      {ticks.map(v => {
        const y = cy(v)
        return (
          <g key={`tick-${v}`}>
            <line x1={ML} y1={y} x2={ML + PW} y2={y}
              stroke="#e0e8ee" strokeWidth={0.4} />
            <text x={ML - 3} y={y + 3} textAnchor="end"
              fontSize={7} fill="#7a8898" fontFamily="Consolas, monospace">
              {v.toFixed(1)}
            </text>
          </g>
        )
      })}

      {/* IEEE 519 limit line */}
      <line x1={ML} y1={limitY} x2={ML + PW} y2={limitY}
        stroke="#c04000" strokeWidth={1} strokeDasharray="4,3" />
      <text x={ML + PW + 2} y={limitY + 3}
        fontSize={6.5} fill="#c04000" fontFamily="Consolas, monospace">
        {ieee519_limit}%
      </text>

      {/* Bars */}
      {HARM_ORDERS.map((h, idx) => {
        const d  = distortion[h] ?? 0
        const bx = ML + idx * barSpacing + (barSpacing - barW) / 2
        const bh = (d / maxVal) * PH
        const by = MT + PH - bh
        const color = barColor(d, ieee519_limit)
        const bg    = barBg(d, ieee519_limit)

        return (
          <g key={`bar-${h}`}>
            <rect x={bx} y={by} width={barW} height={Math.max(bh, 0.5)}
              fill={bg} stroke={color} strokeWidth={0.8} />
            {/* Value label above bar */}
            {d > 0.001 && (
              <text x={bx + barW / 2} y={Math.max(by - 2, MT + 8)}
                textAnchor="middle" fontSize={6.5} fill={color}
                fontFamily="Consolas, monospace" fontWeight="bold">
                {d.toFixed(2)}
              </text>
            )}
            {/* X label */}
            <text x={bx + barW / 2} y={VH - MB + 12}
              textAnchor="middle" fontSize={8} fill="#3a4a5a"
              fontFamily="Consolas, monospace">
              {h}th
            </text>
          </g>
        )
      })}

      {/* X axis line */}
      <line x1={ML} y1={MT + PH} x2={ML + PW} y2={MT + PH}
        stroke="#8a9aaa" strokeWidth={0.8} />

      {/* THDv summary */}
      <text x={ML} y={VH - 4}
        fontSize={7.5} fill="#3a4a5a" fontFamily="Consolas, monospace">
        THDv = {thdv_percent.toFixed(2)}%
        {' '}
        <tspan fill={result.ieee519_pass ? '#006020' : '#b02000'} fontWeight="bold">
          {result.ieee519_pass ? '✓ PASS' : '✗ FAIL'}
        </tspan>
        {' '}(limit {ieee519_limit}%)
      </text>

      {/* Y axis label */}
      <text x={9} y={MT + PH / 2} textAnchor="middle"
        fontSize={7.5} fill="#5a6a7a" fontFamily="'Segoe UI', sans-serif"
        transform={`rotate(-90, 9, ${MT + PH / 2})`}>
        Dh (%)
      </text>
    </svg>
  )
}
