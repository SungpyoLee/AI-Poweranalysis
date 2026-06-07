import { memo, useState } from 'react'
import React from 'react'
import { Handle, Position, NodeProps, useStore as useRFStore } from 'reactflow'
import type { NodeData, Bus, ArcFlashRiskLevel } from '../types'
import { useAnalysisStore } from '../store/useAnalysisStore'
import { useEquipmentStore } from '../store/useEquipmentStore'

function arcFlashColor(risk: ArcFlashRiskLevel): string {
  switch (risk) {
    case 'LOW':     return '#006020'
    case 'MEDIUM':  return '#8a5a00'
    case 'HIGH':    return '#b04000'
    case 'EXTREME': return '#8a0000'
  }
}

// ── 전압 pu 값에 따른 버스 바 상태 색상 ─────────────────────────────────────
function voltageStatus(vm_pu: number | undefined): 'normal' | 'warning' | 'critical' {
  if (vm_pu === undefined) return 'normal'
  if (vm_pu < 0.95 || vm_pu > 1.05) return 'critical'
  if (vm_pu < 0.97 || vm_pu > 1.03) return 'warning'
  return 'normal'
}

const STATUS_COLORS = {
  normal:   { bar: '#0a0a1e', glow: 'none',                        strip: 'transparent' },
  warning:  { bar: '#3a2800', glow: '0 0 0 2px #e0900040',         strip: '#e09000' },
  critical: { bar: '#3a0000', glow: '0 0 0 2px #cc200040',         strip: '#cc2000' },
}

function BusNode({ id, data, selected }: NodeProps<NodeData>) {
  const p = data.equipment as Bus
  const busWidth: number = data.busWidth ?? 220
  const slots: number[] = data.slots ?? [busWidth / 2]
  const voltColor = p.vn_kv >= 100 ? '#8b0000' : p.vn_kv >= 10 ? '#00008b' : '#005500'

  // #4 zoom 수준 감지 — 낮은 줌에서는 결과 배지 숨김
  const zoom = useRFStore(s => s.transform[2])
  const showResults = zoom >= 0.4

  // #11 인라인 이름 편집
  const [editingName, setEditingName] = useState(false)
  const [draftName,   setDraftName]   = useState(p.name)
  const updateEquipment = useEquipmentStore(s => s.updateEquipment)

  const commitName = () => {
    setEditingName(false)
    const trimmed = draftName.trim() || p.name
    if (trimmed !== p.name) updateEquipment(id, { ...p, name: trimmed })
    setDraftName(trimmed)
  }

  // #12 연결 장비 하이라이트
  const highlighted = useEquipmentStore(s => s.highlightedIds.has(id))

  const lfResult   = useAnalysisStore(s => s.loadflow?.buses[id])
  const status     = voltageStatus(lfResult?.vm_pu)
  const statusC    = STATUS_COLORS[status]
  const scResult   = useAnalysisStore(s => s.shortcircuit?.buses[id])
  const afResult   = useAnalysisStore(s => s.arcFlash?.items[id])
  const harmResult = useAnalysisStore(s => s.harmonics?.buses[id])
  const genResult  = useAnalysisStore(s => {
    if (!s.loadflow) return null
    return Object.values(s.loadflow.generators).find(g => g.busId === id) ?? null
  })

  return (
    <div style={{
      position: 'relative', width: busWidth, height: 14, userSelect: 'none',
      // #12 하이라이트 글로우
      filter: highlighted ? 'drop-shadow(0 0 6px #4a8aff88)' : undefined,
    }}>
      {/* Incoming handle — top center */}
      <Handle type="target" position={Position.Top} id="top"
        style={{ left: busWidth / 2, top: 0, width: 10, height: 10,
          background: 'transparent', border: 'none',
          transform: 'translate(-50%, -50%)', zIndex: 10 }} />

      {/* Bus bar */}
      <div style={{
        position: 'absolute', inset: 0,
        background: selected ? '#1a5aff' : highlighted ? '#2a4acc' : statusC.bar,
        borderRadius: 2,
        boxShadow: selected
          ? '0 0 0 2px #4a8aff44'
          : highlighted
            ? '0 0 0 2px #4a8aff66'
            : statusC.glow,
      }} />
      {/* 전압 상태 표시 스트립 (경고/위험 시 좌측 컬러 바) */}
      {status !== 'normal' && (
        <div style={{
          position: 'absolute', left: 0, top: 0, bottom: 0, width: 4,
          background: statusC.strip, borderRadius: '2px 0 0 2px',
          pointerEvents: 'none',
        }} />
      )}

      {/* Name — above (더블클릭으로 인라인 편집 #11) */}
      {editingName ? (
        <input
          autoFocus
          value={draftName}
          onChange={e => setDraftName(e.target.value)}
          onBlur={commitName}
          onKeyDown={e => {
            if (e.key === 'Enter')  { e.stopPropagation(); commitName() }
            if (e.key === 'Escape') { e.stopPropagation(); setEditingName(false); setDraftName(p.name) }
          }}
          onClick={e => e.stopPropagation()}
          style={{
            position: 'absolute', bottom: 16, left: '50%',
            transform: 'translateX(-50%)',
            fontSize: 10.5, fontWeight: 700, fontFamily: "'Segoe UI', Arial, sans-serif",
            background: '#fff', border: '1px solid #1a3a8a', borderRadius: 2,
            padding: '1px 5px', outline: 'none', zIndex: 20, minWidth: 60,
          }}
        />
      ) : (
        <div
          onDoubleClick={e => { e.stopPropagation(); setEditingName(true); setDraftName(p.name) }}
          title="더블클릭하여 이름 편집"
          style={{
            position: 'absolute', bottom: 19, left: '50%',
            transform: 'translateX(-50%)', whiteSpace: 'nowrap',
            fontSize: 10.5, fontWeight: 700, color: '#0a1a2a',
            fontFamily: "'Segoe UI', Arial, sans-serif",
            cursor: 'text',
          }}
        >{p.name}</div>
      )}

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

      {/* Q Limit exceeded badge */}
      {genResult?.mode === 'PQ_LIMIT' && (
        <div style={{
          position: 'absolute', top: -11, right: -6, whiteSpace: 'nowrap',
          fontSize: 7.5, background: '#fce0e0', color: '#b02000',
          border: '1px solid #d06040', borderRadius: 2, padding: '0 3px',
          fontFamily: 'Consolas, monospace', pointerEvents: 'none', fontWeight: 700,
        }}>
          Q LIM
        </div>
      )}

      {/* ── 결과 오버레이 — 상태별 색상 체계 적용 ───────────────────────── */}
      {showResults && (() => {
        let top = 32
        const rows: React.ReactNode[] = []

        // ① Load Flow — 전압 상태 기반 색상 (정상=녹, 경고=황, 위험=적)
        if (lfResult) {
          const vm = lfResult.vm_pu
          const vmColor =
            vm < 0.90 || vm > 1.10 ? '#c01800' :   // 위험: 빨강
            vm < 0.95 || vm > 1.05 ? '#8a5a00' :   // 경고: 황색
            '#005a1e'                                 // 정상: 녹색
          const vmBg =
            vm < 0.90 || vm > 1.10 ? '#fde8e8' :
            vm < 0.95 || vm > 1.05 ? '#fff5dc' :
            '#e8f5ee'
          rows.push(
            <div key="lf" style={{ display: 'flex', gap: 4 }}>
              <ResultBadge2 value={vm.toFixed(4)} unit="pu" fg={vmColor} bg={vmBg} />
              <ResultBadge2 value={lfResult.va_degree.toFixed(2)} unit="°" fg="#3a5a7a" bg="#eef3f8" />
            </div>
          )
          top += 16
        }

        // ② 발전기 Q 리밋
        if (lfResult && genResult) {
          const qLim = genResult.mode === 'PQ_LIMIT'
          rows.push(
            <div key="gen" style={{ display: 'flex', gap: 4 }}>
              <ResultBadge2
                value={`Q${genResult.q_mvar >= 0 ? '+' : ''}${genResult.q_mvar.toFixed(2)}`}
                unit="Mvar"
                fg={qLim ? '#c01800' : '#005a1e'}
                bg={qLim ? '#fde8e8' : '#e8f5ee'}
              />
              {qLim && <ResultBadge2 value="Q-LIM" unit="" fg="#c01800" bg="#fde8e8" bold />}
            </div>
          )
          top += 16
        }

        // ③ 단락계산 — 중립 색상 (데이터 표시, 경보 아님)
        if (scResult) {
          rows.push(
            <div key="sc" style={{ display: 'flex', gap: 4 }}>
              <ResultBadge2 value={scResult.ikss_ka.toFixed(3)} unit="kA" fg="#1a2a5a" bg="#eef0f8" />
              <ResultBadge2 value={scResult.skss_mva.toFixed(0)} unit="MVA" fg="#1a2a5a" bg="#eef0f8" />
            </div>
          )
          top += 16
        }

        // ④ Arc Flash — 위험도 기반 색상
        if (afResult) {
          const afColor = arcFlashColor(afResult.risk_level)
          const afBg =
            afResult.risk_level === 'EXTREME' ? '#fde8e8' :
            afResult.risk_level === 'HIGH'    ? '#fff0e4' :
            afResult.risk_level === 'MEDIUM'  ? '#fff8e4' : '#e8f5ee'
          const ppeLabel = afResult.ppe_category === 5 ? 'Cat 4+' : `Cat ${afResult.ppe_category}`
          rows.push(
            <div key="af" style={{ display: 'flex', gap: 4 }}>
              <ResultBadge2 value={afResult.incident_energy_cal.toFixed(1)} unit="cal" fg={afColor} bg={afBg} />
              <ResultBadge2 value={ppeLabel} unit="" fg={afColor} bg={afBg} bold />
            </div>
          )
          top += 16
        }

        // ⑤ 고조파 THDv — IEEE 519 합격 여부
        if (harmResult) {
          const fail = !harmResult.ieee519_pass
          const near = harmResult.thdv_percent > harmResult.ieee519_limit * 0.6
          const hColor = fail ? '#c01800' : near ? '#8a5a00' : '#005a1e'
          const hBg    = fail ? '#fde8e8' : near ? '#fff5dc' : '#e8f5ee'
          rows.push(
            <div key="harm" style={{ display: 'flex', gap: 4 }}>
              <ResultBadge2 value={`THDv ${harmResult.thdv_percent.toFixed(1)}`} unit="%" fg={hColor} bg={hBg} />
              <ResultBadge2 value={fail ? 'FAIL' : 'OK'} unit="" fg={hColor} bg={hBg} bold />
            </div>
          )
        }

        if (rows.length === 0) return null
        return (
          <div style={{
            position: 'absolute', top: 32, left: '50%',
            transform: 'translateX(-50%)', whiteSpace: 'nowrap',
            display: 'flex', flexDirection: 'column', gap: 3,
            pointerEvents: 'none',
          }}>
            {rows}
          </div>
        )
      })()}

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

// ── 상태 기반 결과 뱃지 (C-1 디자인 개선) ────────────────────────────────────
function ResultBadge2({
  value, unit, fg, bg, bold = false,
}: { value: string; unit: string; fg: string; bg: string; bold?: boolean }) {
  return (
    <span style={{
      fontSize: 9, fontFamily: 'Consolas, monospace',
      fontWeight: bold ? 700 : 500,
      background: bg, color: fg,
      border: `1px solid ${fg}33`,
      borderRadius: 3, padding: '1px 5px',
      letterSpacing: '-0.01em',
      boxShadow: '0 1px 2px rgba(0,0,0,0.08)',
    }}>
      {value}{unit ? <span style={{ opacity: 0.65, fontSize: 8, marginLeft: 2 }}>{unit}</span> : null}
    </span>
  )
}

export default memo(BusNode)
