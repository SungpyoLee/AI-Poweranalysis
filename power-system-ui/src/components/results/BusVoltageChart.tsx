/**
 * 버스 전압 프로파일 막대그래프 — 'V Profile' 탭 전용.
 */
import type { RowData } from './shared'

export default function BusVoltageChart({ rows }: { rows: RowData[] }) {
  const FONT = "'Segoe UI', 'Malgun Gothic', Consolas, monospace"
  const hasData = rows.some(r => r.vm_pu !== undefined)

  if (!hasData) {
    return (
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        height: '100%', color: '#9aaabb', fontSize: 11, fontFamily: FONT,
      }}>
        Load Flow 결과 없음 — Load Flow를 먼저 실행하세요
      </div>
    )
  }

  // ── Layout ──────────────────────────────────────────────────────────────────
  const MT = 18, MB = 56, ML = 46, MR = 14
  const PH = 130                      // plot height px
  const TOTAL_H = MT + PH + MB        // 204
  const BAR_W = 34, STEP = 52         // bar width + horizontal step per bus

  const filtered = rows.filter(r => r.vm_pu !== undefined)
  const svgW     = ML + filtered.length * STEP + MR

  // Y domain: 0.85 → 1.10
  const YMIN = 0.85, YMAX = 1.10, YRANGE = YMAX - YMIN

  const yOf = (v: number) =>
    MT + PH - (Math.max(YMIN, Math.min(YMAX, v)) - YMIN) / YRANGE * PH

  const barColor = (vm: number) => {
    if (vm >= 0.95 && vm <= 1.05) return '#2e9a50'
    if (vm >= 0.90 && vm <= 1.10) return '#c8a000'
    return '#c03030'
  }

  const barBg = (vm: number) => {
    if (vm >= 0.95 && vm <= 1.05) return '#d8f4e4'
    if (vm >= 0.90 && vm <= 1.10) return '#fff3c0'
    return '#fde0e0'
  }

  // Y axis ticks
  const yTicks = [0.85, 0.90, 0.95, 1.00, 1.05, 1.10]

  // Reference line config
  const refLines = [
    { v: 1.05, color: '#c8a000', dash: '4,3',  label: '' },
    { v: 1.00, color: '#3a5a9a', dash: '',      label: '' },
    { v: 0.95, color: '#c8a000', dash: '4,3',  label: '' },
    { v: 0.90, color: '#c03030', dash: '3,3',  label: '' },
  ]

  // Summary
  const vms = filtered.map(r => r.vm_pu as number)
  const minV = Math.min(...vms), maxV = Math.max(...vms)
  const underV = vms.filter(v => v < 0.95).length
  const overV  = vms.filter(v => v > 1.05).length

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden', fontFamily: FONT }}>
      {/* Summary row */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 12,
        padding: '3px 12px',
        background: '#e8eef4', borderBottom: '1px solid #ccd4dc',
        flexShrink: 0, fontSize: 9.5,
      }}>
        <span style={{ color: '#5a6a7a', textTransform: 'uppercase', letterSpacing: '0.07em', fontWeight: 700 }}>
          버스 전압 프로파일
        </span>
        <span style={{ fontFamily: 'Consolas, monospace', color: '#1a3a7a' }}>
          N = {filtered.length}
        </span>
        <span style={{ fontFamily: 'Consolas, monospace', color: '#1a3a7a' }}>
          Min: <b>{minV.toFixed(4)}</b> pu
        </span>
        <span style={{ fontFamily: 'Consolas, monospace', color: '#1a3a7a' }}>
          Max: <b>{maxV.toFixed(4)}</b> pu
        </span>
        {underV > 0 && (
          <span style={{
            fontWeight: 700, padding: '0px 6px',
            background: '#fde0e0', color: '#c03030',
            border: '1px solid #e08080', borderRadius: 2,
          }}>
            ⚠ U/V {underV}개 &lt; 0.95 pu
          </span>
        )}
        {overV > 0 && (
          <span style={{
            fontWeight: 700, padding: '0px 6px',
            background: '#fff3c0', color: '#c8a000',
            border: '1px solid #d0a800', borderRadius: 2,
          }}>
            ⚠ O/V {overV}개 &gt; 1.05 pu
          </span>
        )}
      </div>

      {/* SVG chart */}
      <div style={{ flex: 1, overflowX: 'auto', overflowY: 'hidden' }}>
        <svg
          width={Math.max(svgW, 400)}
          height={TOTAL_H}
          style={{ display: 'block' }}
        >
          {/* Plot background */}
          <rect x={ML} y={MT} width={svgW - ML - MR} height={PH} fill="#fafbfc" />
          <rect x={ML} y={MT} width={svgW - ML - MR} height={PH} fill="none" stroke="#c8d0d8" strokeWidth={0.5} />

          {/* Out-of-range zones (shaded) */}
          {/* Below 0.95 zone */}
          <rect x={ML} y={yOf(0.95)} width={svgW - ML - MR} height={yOf(YMIN) - yOf(0.95)}
            fill="#fde0e0" opacity={0.35} />
          {/* Above 1.05 zone */}
          <rect x={ML} y={yOf(YMAX)} width={svgW - ML - MR} height={yOf(1.05) - yOf(YMAX)}
            fill="#fff3c0" opacity={0.35} />

          {/* Y axis ticks + grid lines */}
          {yTicks.map(v => {
            const y = yOf(v)
            return (
              <g key={v}>
                <line x1={ML} y1={y} x2={svgW - MR} y2={y}
                  stroke="#d8e0e8" strokeWidth={v === 1.00 ? 0.8 : 0.4} />
                <text x={ML - 4} y={y + 3} textAnchor="end"
                  fontSize={7.5} fill="#5a6a7a" fontFamily="Consolas, monospace">
                  {v.toFixed(2)}
                </text>
              </g>
            )
          })}

          {/* Reference lines */}
          {refLines.map(rl => {
            const y = yOf(rl.v)
            return (
              <line key={rl.v}
                x1={ML} y1={y} x2={svgW - MR} y2={y}
                stroke={rl.color}
                strokeWidth={rl.v === 1.00 ? 1.2 : 0.9}
                strokeDasharray={rl.dash || undefined}
                opacity={0.85}
              />
            )
          })}

          {/* Y axis label */}
          <text
            x={10} y={MT + PH / 2}
            textAnchor="middle" fontSize={8.5} fill="#3a4a5a"
            fontFamily={FONT} fontWeight="bold"
            transform={`rotate(-90, 10, ${MT + PH / 2})`}
          >
            Voltage (pu)
          </text>

          {/* Bars */}
          {filtered.map((row, i) => {
            const vm  = row.vm_pu as number
            const cx  = ML + i * STEP + STEP / 2
            const bx  = cx - BAR_W / 2
            const by  = yOf(vm)
            const bh  = Math.max(1, yOf(YMIN) - by)
            const col = barColor(vm)
            const bg  = barBg(vm)
            const busName = String(row.name ?? row.id).slice(0, 12)

            return (
              <g key={row.id}>
                {/* Bar background */}
                <rect x={bx} y={by} width={BAR_W} height={bh}
                  fill={bg} stroke={col} strokeWidth={0.8} rx={1} />

                {/* Value label above bar */}
                <text x={cx} y={Math.max(MT + 8, by - 3)}
                  textAnchor="middle" fontSize={7.5}
                  fontFamily="Consolas, monospace" fontWeight="700"
                  fill={col}>
                  {vm.toFixed(3)}
                </text>

                {/* Bus name label (rotated -45°) */}
                <text
                  x={cx} y={MT + PH + 12}
                  textAnchor="end" fontSize={8}
                  fontFamily={FONT} fill="#3a4a5a"
                  transform={`rotate(-42, ${cx}, ${MT + PH + 12})`}
                >
                  {busName}
                </text>
              </g>
            )
          })}

          {/* Legend */}
          {[
            { color: '#2e9a50', bg: '#d8f4e4', label: '0.95 ~ 1.05 pu (정상)' },
            { color: '#c8a000', bg: '#fff3c0', label: '0.90 ~ 0.95 / 1.05 ~ 1.10 pu (주의)' },
            { color: '#c03030', bg: '#fde0e0', label: '< 0.90 / > 1.10 pu (경고)' },
          ].map((leg, i) => {
            const ly = MT + 6 + i * 14
            return (
              <g key={leg.label}>
                <rect x={svgW - MR - 165} y={ly - 6} width={10} height={8}
                  fill={leg.bg} stroke={leg.color} strokeWidth={0.8} rx={1} />
                <text x={svgW - MR - 152} y={ly}
                  fontSize={7.5} fill="#3a4a5a" fontFamily={FONT}>
                  {leg.label}
                </text>
              </g>
            )
          })}
        </svg>
      </div>
    </div>
  )
}
