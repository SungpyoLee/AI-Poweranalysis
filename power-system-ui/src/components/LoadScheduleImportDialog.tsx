/**
 * LoadScheduleImportDialog — EPC 부하 목록표 (Load Schedule) 가져오기
 * Motor, Load, Generator를 Excel에서 직접 SLD 캔버스로 가져옴
 * MotorListImportDialog와 유사하지만 다중 장비 유형을 지원
 */

import { useCallback, useRef, useState } from 'react'
import type { Node as RFNode, Edge as RFEdge } from 'reactflow'
import type { NodeData, EdgeData, Motor, Load, Generator, Bus, Cable } from '../types'
import { defaultEquipment, defaultCable } from '../types'
import { parseLoadSchedule, type ParsedLoadSchedule, type LoadScheduleRow } from '../import/loadScheduleParser'
import * as XLSX from 'xlsx'

const FONT = "'Segoe UI', 'Malgun Gothic', Arial, sans-serif"

interface Props {
  onClose:  () => void
  onImport: (nodes: RFNode<NodeData>[], edges: RFEdge<EdgeData>[]) => void
}

// ── 템플릿 다운로드 ───────────────────────────────────────────────────────────
function downloadTemplate() {
  const ws = XLSX.utils.aoa_to_sheet([
    ['TAG', 'Type', 'kW', 'PF', 'Voltage', 'Bus', 'Description'],
    ['PP-101', 'Motor', 1500, 0.85, 22900, '22.9kV SWGR', 'Feed Pump'],
    ['CM-101', 'Motor', 2000, 0.86, 22900, '22.9kV SWGR', 'Compressor (VFD)'],
    ['FAN-201', 'Motor', 45, 0.82, 380, 'MCC-A', 'Cooling Fan'],
    ['PANEL-301', 'Load', 200, 0.90, 380, 'MCC-B', 'Lighting & Misc'],
    ['G-EMG', 'Generator', 1500, 0.80, 380, '0.38kV EMG Bus', 'Emergency DG'],
  ])
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Load Schedule')
  XLSX.writeFile(wb, 'load_schedule_template.xlsx')
}

// ── 네트워크 빌더 ─────────────────────────────────────────────────────────────
let _uid = 7000
function uid(p: string) { return `${p}-${++_uid}` }

function buildNetwork(parsed: ParsedLoadSchedule): { nodes: RFNode<NodeData>[]; edges: RFEdge<EdgeData>[] } {
  const nodes: RFNode<NodeData>[] = []
  const edges: RFEdge<EdgeData>[] = []

  const SNAP = 20
  const snap = (n: number) => Math.round(n / SNAP) * SNAP

  const busEntries = Array.from(parsed.busGroups.entries())
  const BUS_X_STEP = 240, ITEM_Y_STEP = 110

  for (let bi = 0; bi < busEntries.length; bi++) {
    const [busName, rows] = busEntries[bi]
    const busX = snap(80 + bi * BUS_X_STEP)
    const busY = 80

    // Bus 노드
    const busId = uid('bus')
    const vn_kv = rows[0]?.voltage_v ? rows[0].voltage_v / 1000 : 0.38
    const busEq: Bus = {
      ...(defaultEquipment('bus', busId) as Bus),
      name: busName, vn_kv, busType: 'PQ',
    }
    nodes.push({ id: busId, type: 'bus', position: { x: busX, y: busY },
      data: { equipment: busEq, busWidth: 160, slots: [80] } })

    for (let ri = 0; ri < rows.length; ri++) {
      const row = rows[ri]
      const itemY = snap(busY + 180 + ri * ITEM_Y_STEP)
      const itemX = snap(busX - 22)
      let eqNodeId = ''

      if (row.equipType === 'motor') {
        const motId = uid('motor')
        const motEq: Motor = {
          ...(defaultEquipment('motor', motId) as Motor),
          name: row.tag, rated_kw: row.kw, vn_kv: row.voltage_v / 1000,
          efficiency: 94, power_factor: row.pf,
          starting_current_multiple: 6.5, starting_method: 'DOL',
        }
        nodes.push({ id: motId, type: 'motor', position: { x: itemX, y: itemY },
          data: { equipment: motEq } })
        eqNodeId = motId

      } else if (row.equipType === 'generator') {
        const genId = uid('generator')
        const genEq: Generator = {
          ...(defaultEquipment('generator', genId) as Generator),
          name: row.tag, sn_mva: row.kw / 1000 / 0.8, p_mw: row.kw / 1000,
          vn_kv: row.voltage_v / 1000, pf: row.pf,
        }
        nodes.push({ id: genId, type: 'generator', position: { x: itemX, y: itemY },
          data: { equipment: genEq } })
        eqNodeId = genId

      } else {
        const loadId = uid('load')
        const q_kvar = row.kw * Math.tan(Math.acos(row.pf))
        const loadEq: Load = {
          ...(defaultEquipment('load', loadId) as Load),
          name: row.tag, p_kw: row.kw, q_kvar,
          vn_kv: row.voltage_v / 1000, pf: row.pf,
          const_p_percent: 100, const_i_percent: 0, const_z_percent: 0, scaling: 1,
        }
        nodes.push({ id: loadId, type: 'load', position: { x: itemX, y: itemY },
          data: { equipment: loadEq } })
        eqNodeId = loadId
      }

      // Cable
      const eId = uid('e')
      const c: Cable = { ...defaultCable(eId), name: `C-${row.tag}`, length_m: 50 }
      edges.push({ id: eId, type: 'cable', source: busId, sourceHandle: 's0',
        target: eqNodeId, data: { cable: c } })
    }
  }

  return { nodes, edges }
}

// ── Main Component ────────────────────────────────────────────────────────────
export default function LoadScheduleImportDialog({ onClose, onImport }: Props) {
  const [parsed,  setParsed]  = useState<ParsedLoadSchedule | null>(null)
  const [error,   setError]   = useState<string | null>(null)
  const [parsing, setParsing] = useState(false)
  const [done,    setDone]    = useState(false)
  const [built,   setBuilt]   = useState<{ nodes: RFNode<NodeData>[]; edges: RFEdge<EdgeData>[] } | null>(null)
  const [dragging, setDragging] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const handleFile = useCallback(async (file: File) => {
    setError(null)
    if (file.size > 50 * 1024 * 1024) { setError('파일 크기 초과 (>50MB)'); return }
    setParsing(true)
    try {
      const result = await parseLoadSchedule(file)
      setParsed(result)
    } catch (e) { setError(e instanceof Error ? e.message : String(e)) }
    finally { setParsing(false) }
  }, [])

  const handleBuild = useCallback(() => {
    if (!parsed) return
    const net = buildNetwork(parsed)
    setBuilt(net)
    setDone(true)
  }, [parsed])

  const handleConfirm = useCallback(() => {
    if (!built) return
    onImport(built.nodes, built.edges)
  }, [built, onImport])

  const typeCount = (parsed: ParsedLoadSchedule, type: string) =>
    parsed.rows.filter(r => r.equipType === type).length

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9350,
      background: 'rgba(0,0,0,0.44)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div style={{
        background: '#f4f6f8', border: '1px solid #8a9aaa', borderRadius: 4,
        boxShadow: '0 12px 40px rgba(0,0,0,0.3)',
        width: 560, maxHeight: '88vh',
        display: 'flex', flexDirection: 'column', fontFamily: FONT, overflow: 'hidden',
      }}>
        {/* 헤더 */}
        <div style={{
          background: 'linear-gradient(to bottom, #1e3a7a, #152d60)',
          padding: '10px 16px', flexShrink: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: '#e8f0ff' }}>
            📋 부하 목록표 가져오기 (Load Schedule)
          </span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#8ab0e8', cursor: 'pointer', fontSize: 16 }}>✕</button>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 14 }}>
          {!done ? (
            <>
              <div style={{ fontSize: 10.5, color: '#4a5a6a', lineHeight: 1.7 }}>
                EPC 부하 목록표(Load Schedule) Excel을 가져옵니다.<br />
                <strong>Motor, Load, Generator</strong> 모두 지원 | .xlsx · .xls · .csv
              </div>

              {/* 업로드 */}
              <div
                onDragOver={e => { e.preventDefault(); setDragging(true) }}
                onDragLeave={() => setDragging(false)}
                onDrop={e => { e.preventDefault(); setDragging(false); const f = e.dataTransfer.files[0]; if (f) handleFile(f) }}
                onClick={() => inputRef.current?.click()}
                style={{
                  border: `2px dashed ${dragging ? '#1a3a9a' : '#b0bcc8'}`,
                  borderRadius: 4, background: dragging ? '#f0f4ff' : '#fafbfc',
                  padding: '28px', textAlign: 'center', cursor: 'pointer',
                  transition: 'all 0.15s',
                }}
              >
                {parsing ? (
                  <div style={{ color: '#5a6a7a', fontSize: 11 }}>⏳ 파싱 중…</div>
                ) : parsed ? (
                  <div style={{ color: '#005a20', fontSize: 11, fontWeight: 700 }}>
                    ✓ {parsed.totalRows}개 항목 파싱 완료 — 다른 파일을 드래그하면 교체됩니다
                  </div>
                ) : (
                  <div style={{ fontSize: 11, color: '#5a6a7a' }}>
                    <div style={{ fontSize: 28, marginBottom: 8 }}>📄</div>
                    파일을 드래그하거나 클릭하여 선택
                  </div>
                )}
                <input ref={inputRef} type="file" accept=".xlsx,.xls,.csv"
                  onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = '' }}
                  style={{ display: 'none' }} />
              </div>

              {/* 템플릿 + 파싱 결과 */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontSize: 9.5, color: '#7a8898', flex: 1 }}>
                  TAG · Type(Motor/Load/Generator) · kW · PF · Voltage · Bus
                </span>
                <button onClick={downloadTemplate} style={{
                  padding: '3px 10px', fontSize: 9.5, cursor: 'pointer',
                  background: '#1a3a7a', border: 'none', borderRadius: 3, color: '#fff', fontWeight: 600,
                }}>↓ 템플릿</button>
              </div>

              {error && (
                <div style={{ padding: '6px 10px', background: '#fce8e8', border: '1px solid #e09090',
                  borderRadius: 2, fontSize: 10, color: '#800000' }}>⚠ {error}</div>
              )}

              {parsed && (
                <div style={{ background: '#f0f4f8', border: '1px solid #d0d8e4', borderRadius: 3, padding: '12px 14px' }}>
                  <div style={{ fontWeight: 700, fontSize: 11, marginBottom: 8 }}>파싱 결과</div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
                    {[
                      ['전체 항목', parsed.totalRows],
                      ['Motor', typeCount(parsed, 'motor')],
                      ['Load', typeCount(parsed, 'load')],
                      ['Generator', typeCount(parsed, 'generator')],
                      ['Bus 그룹', parsed.busGroups.size],
                      ['건너뜀', parsed.skippedRows],
                    ].map(([k, v]) => (
                      <div key={String(k)} style={{ background: '#fff', border: '1px solid #d8e4f0', borderRadius: 2, padding: '6px 10px' }}>
                        <div style={{ fontSize: 8.5, color: '#7a8898', textTransform: 'uppercase' }}>{k}</div>
                        <div style={{ fontSize: 16, fontWeight: 700, fontFamily: 'Consolas,monospace', color: '#1a3a7a' }}>{v}</div>
                      </div>
                    ))}
                  </div>
                  {parsed.warnings.length > 0 && (
                    <div style={{ marginTop: 8 }}>
                      {parsed.warnings.map((w, i) => (
                        <div key={i} style={{ fontSize: 9.5, color: '#6a4800', padding: '3px 6px',
                          background: '#fff8e8', border: '1px solid #e0c060', borderRadius: 2, marginBottom: 3 }}>
                          ⚠ {w}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </>
          ) : (
            /* 완료 화면 */
            <div style={{ textAlign: 'center', padding: 16 }}>
              <div style={{ fontSize: 40, marginBottom: 12 }}>✅</div>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#005a20', marginBottom: 8 }}>SLD 생성 완료</div>
              <div style={{ fontSize: 10.5, color: '#5a6a7a', lineHeight: 1.8 }}>
                노드 {built?.nodes.length ?? 0}개 · 케이블 {built?.edges.length ?? 0}개가 캔버스에 추가됩니다.
              </div>
            </div>
          )}
        </div>

        {/* 하단 버튼 */}
        <div style={{
          padding: '10px 16px', borderTop: '1px solid #d0d8e0', flexShrink: 0,
          display: 'flex', gap: 8, justifyContent: 'flex-end',
        }}>
          <button onClick={onClose} style={{
            padding: '5px 16px', fontSize: 10.5, cursor: 'pointer',
            background: '#e8ecf0', border: '1px solid #a0b0c0', borderRadius: 2, color: '#3a4a5a',
          }}>취소</button>
          {!done && parsed && parsed.totalRows > 0 && (
            <button onClick={handleBuild} style={{
              padding: '5px 18px', fontSize: 10.5, fontWeight: 700, cursor: 'pointer',
              background: 'linear-gradient(to bottom, #1e3a7a, #152d60)',
              border: 'none', borderRadius: 3, color: '#fff',
            }}>SLD 자동 작성 →</button>
          )}
          {done && (
            <button onClick={handleConfirm} style={{
              padding: '5px 18px', fontSize: 10.5, fontWeight: 700, cursor: 'pointer',
              background: 'linear-gradient(to bottom, #1a6a2a, #145520)',
              border: 'none', borderRadius: 3, color: '#fff',
            }}>캔버스에 추가</button>
          )}
        </div>
      </div>
    </div>
  )
}
