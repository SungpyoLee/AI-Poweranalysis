/**
 * MotorListImportDialog — MCC Motor List Excel/CSV → SLD 자동 작성 위자드
 *
 * 4단계:
 *   upload   → 파일 업로드 (XLSX · XLS · CSV, 최대 50 MB)
 *   preview  → 파싱 결과 미리보기 (MotorImportPreview)
 *   building → 네트워크 자동 생성 (체크리스트 진행 표시)
 *   done     → 완료 요약 + 자동 해석 옵션
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import type { Node as RFNode, Edge as RFEdge } from 'reactflow'
import type { NodeData, EdgeData } from '../types'
import { parseMotorList, type ParsedMotorList } from '../import/motorListParser'
import { buildMotorNetwork, type MotorNetworkSummary } from '../import/motorNetworkBuilder'
import MotorImportPreview from './MotorImportPreview'
import * as XLSX from 'xlsx'

// #7 샘플 Excel 템플릿 다운로드
function downloadTemplate() {
  const ws = XLSX.utils.aoa_to_sheet([
    ['TAG',     'kW',  'PF',   'Voltage', 'MCC'   ],
    ['P-101A',  75,    0.88,   380,       'MCC-A'  ],
    ['P-101B',  75,    0.88,   380,       'MCC-A'  ],
    ['C-201',   45,    0.85,   380,       'MCC-A'  ],
    ['FAN-301', 30,    0.82,   380,       'MCC-B'  ],
    ['PP-101',  200,   0.90,   380,       'MCC-B'  ],
    ['CM-501',  500,   0.91,   6600,      'MCC-C'  ],
  ])
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Motor List')
  XLSX.writeFile(wb, 'motor_list_template.xlsx')
}

// ── Props ─────────────────────────────────────────────────────────────────────
interface Props {
  onClose:  () => void
  /** 생성된 노드/엣지를 캔버스에 추가하고 선택적으로 해석 실행 */
  onImport: (
    nodes:       RFNode<NodeData>[],
    edges:       RFEdge<EdgeData>[],
    runLoadflow: boolean,
  ) => void
}

type Step = 'upload' | 'mccStrategy' | 'preview' | 'building' | 'done'
type MccStrategy = 'single' | 'bykw' | 'custom'

// ── Building checklist ────────────────────────────────────────────────────────
interface CheckItem {
  id:    string
  label: string
  done:  boolean
}

const FONT = "'Segoe UI', 'Malgun Gothic', Arial, sans-serif"

// ── 파일 크기 제한 50 MB ──────────────────────────────────────────────────────
const MAX_BYTES = 50 * 1024 * 1024
const ACCEPT    = '.xlsx,.xls,.csv'

// ── Component ────────────────────────────────────────────────────────────────
export default function MotorListImportDialog({ onClose, onImport }: Props) {
  const [step,    setStep]    = useState<Step>('upload')
  const [error,   setError]   = useState<string | null>(null)
  const [parsing, setParsing] = useState(false)

  // Parsed data
  const [parsed,      setParsed]      = useState<ParsedMotorList | null>(null)
  const [mccStrategy, setMccStrategy] = useState<MccStrategy>('single')
  const [customMcc,   setCustomMcc]   = useState('MCC-1')

  // Building checklist
  const [checks, setChecks] = useState<CheckItem[]>([
    { id: 'motors',  label: 'Motor 노드 생성',   done: false },
    { id: 'buses',   label: 'MCC Bus 생성',       done: false },
    { id: 'trs',     label: 'Transformer 생성',   done: false },
    { id: 'cables',  label: 'Cable 연결',          done: false },
    { id: 'layout',  label: '레이아웃 자동 배치',  done: false },
  ])

  // Built network
  const [builtNodes,   setBuiltNodes]   = useState<RFNode<NodeData>[]>([])
  const [builtEdges,   setBuiltEdges]   = useState<RFEdge<EdgeData>[]>([])
  const [summary,      setSummary]      = useState<MotorNetworkSummary | null>(null)

  // Analysis options
  const [runLF,      setRunLF]      = useState(true)
  const [runCS,      setRunCS]      = useState(false)
  const [runMS,      setRunMS]      = useState(false)

  // Drag state
  const [dragging, setDragging] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  // ── 파일 처리 ────────────────────────────────────────────────────────────
  const handleFile = useCallback(async (file: File) => {
    setError(null)
    if (file.size > MAX_BYTES) {
      setError(`파일 크기 초과 (${(file.size / 1e6).toFixed(1)} MB > 50 MB)`)
      return
    }
    const ext = file.name.split('.').pop()?.toLowerCase() ?? ''
    if (!['xlsx', 'xls', 'csv'].includes(ext)) {
      setError('지원 형식: .xlsx · .xls · .csv')
      return
    }
    setParsing(true)
    try {
      const result = await parseMotorList(file)
      setParsed(result)
      // #15 MCC 컬럼 없으면 전략 선택 다이얼로그 먼저
      if (!result.detectedColumns.mcc) {
        setStep('mccStrategy')
      } else {
        setStep('preview')
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setParsing(false)
    }
  }, [])

  const onFileInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    if (f) handleFile(f)
    e.target.value = ''
  }, [handleFile])

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragging(false)
    const f = e.dataTransfer.files[0]
    if (f) handleFile(f)
  }, [handleFile])

  // #15 MCC 전략 적용 후 preview로
  const applyMccStrategy = useCallback(() => {
    if (!parsed) return
    let rows = [...parsed.rows]
    if (mccStrategy === 'single') {
      const mcc = customMcc.trim() || 'MCC-1'
      rows = rows.map(r => ({ ...r, mcc }))
    } else if (mccStrategy === 'bykw') {
      rows = rows.map(r => ({
        ...r, mcc: r.kw < 22 ? 'MCC-LV' : r.kw < 150 ? 'MCC-MV' : 'MCC-HV',
      }))
    }
    const mccGroups = new Map<string, typeof rows>()
    for (const row of rows) {
      if (!mccGroups.has(row.mcc)) mccGroups.set(row.mcc, [])
      mccGroups.get(row.mcc)!.push(row)
    }
    setParsed(prev => prev ? { ...prev, rows, mccGroups } : prev)
    setStep('preview')
  }, [parsed, mccStrategy, customMcc])

  // ── Building 단계 ─────────────────────────────────────────────────────────
  const tickCheck = useCallback((id: string) => {
    setChecks(prev => prev.map(c => c.id === id ? { ...c, done: true } : c))
  }, [])

  const runBuild = useCallback(() => {
    if (!parsed) return
    setChecks(prev => prev.map(c => ({ ...c, done: false })))
    setStep('building')
  }, [parsed])

  // Building 단계 진입 시 실제 네트워크 생성
  useEffect(() => {
    if (step !== 'building' || !parsed) return

    // 체크리스트 항목들을 50ms 간격으로 순차 완료 표시
    const DELAYS = [50, 120, 200, 300, 420]
    const ids = ['motors', 'buses', 'trs', 'cables', 'layout']

    const result = buildMotorNetwork(parsed)
    setBuiltNodes(result.nodes)
    setBuiltEdges(result.edges)
    setSummary(result.summary)

    const timers = ids.map((id, i) =>
      window.setTimeout(() => tickCheck(id), DELAYS[i])
    )
    const finishTimer = window.setTimeout(() => setStep('done'), 550)

    return () => {
      timers.forEach(clearTimeout)
      clearTimeout(finishTimer)
    }
  }, [step, parsed, tickCheck])

  // ── Confirm import ────────────────────────────────────────────────────────
  const handleConfirm = useCallback(() => {
    onImport(builtNodes, builtEdges, runLF)
    if (runCS || runMS) {
      // Cable Sizing / Motor Starting은 load flow 완료 후 의미 있음
      // 현재는 LF만 자동 트리거, 나머지는 사용자가 수동 실행
    }
  }, [onImport, builtNodes, builtEdges, runLF, runCS, runMS])

  // ── Dialog 렌더 ──────────────────────────────────────────────────────────
  const HEADER_H = 44
  const DIALOG_W = step === 'preview' ? 820 : 440

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 9300,
        background: 'rgba(0,0,0,0.44)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div style={{
        background: '#f4f6f8',
        border: '1px solid #8a9aaa',
        borderRadius: 4,
        boxShadow: '0 12px 40px rgba(0,0,0,0.3)',
        width: DIALOG_W,
        maxWidth: '95vw',
        maxHeight: '88vh',
        display: 'flex', flexDirection: 'column',
        fontFamily: FONT,
        overflow: 'hidden',
        transition: 'width 0.2s ease',
      }}>

        {/* ── 헤더 ── */}
        <div style={{
          background: 'linear-gradient(to bottom, #1e3a7a 0%, #152d60 100%)',
          padding: `0 16px`,
          height: HEADER_H,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          flexShrink: 0,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {/* Motor List 아이콘 */}
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <rect x="1" y="1" width="14" height="14" rx="1.5" stroke="#60a0e8" strokeWidth="1.1"/>
              <path d="M3 4h10M3 7h7M3 10h5" stroke="#60a0e8" strokeWidth="1" strokeLinecap="round"/>
              <circle cx="12" cy="10" r="2.5" stroke="#60e890" strokeWidth="1.1"/>
              <path d="M11 10h2M12 9v2" stroke="#60e890" strokeWidth="0.9" strokeLinecap="round"/>
            </svg>
            <span style={{ fontSize: 12, fontWeight: 700, color: '#e8f0ff', letterSpacing: '0.04em' }}>
              Motor List 가져오기
            </span>

            {/* Step 인디케이터 */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginLeft: 12 }}>
              {(['upload', 'mccStrategy', 'preview', 'building', 'done'] as Step[]).map((s, i) => {
                const stepMap: Record<Step, number> = { upload: 0, mccStrategy: 1, preview: 2, building: 3, done: 4 }
                const cur = stepMap[step]
                const si  = stepMap[s]
                const active = si === cur
                const done   = si < cur
                return (
                  <div key={s} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <div style={{
                      width: 18, height: 18, borderRadius: '50%',
                      border: `1.5px solid ${active ? '#60a0e8' : done ? '#40c080' : '#4a6a9a'}`,
                      background: active ? '#60a0e8' : done ? '#40c080' : 'transparent',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 9, fontWeight: 700,
                      color: (active || done) ? '#fff' : '#4a6a9a',
                    }}>
                      {done ? '✓' : i + 1}
                    </div>
                    {i < 3 && (
                      <div style={{
                        width: 16, height: 1.5,
                        background: done ? '#40c080' : '#2a4a7a',
                      }} />
                    )}
                  </div>
                )
              })}
            </div>
          </div>

          <button onClick={onClose} style={{
            background: 'none', border: 'none', color: '#8ab0e8',
            cursor: 'pointer', fontSize: 16, lineHeight: 1,
          }}>✕</button>
        </div>

        {/* ── 본문 ── */}
        <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>

          {/* ──────────────── STEP: upload ──────────────────────────────── */}
          {step === 'upload' && (
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: '24px 28px', gap: 16 }}>
              <div style={{ fontSize: 11, color: '#3a4a5a', lineHeight: 1.7 }}>
                MCC Motor List Excel 파일을 업로드하면 단선도를 자동으로 작성합니다.
                <br />
                지원: <strong>.xlsx · .xls · .csv</strong> &nbsp;|&nbsp; 최대 50 MB
              </div>

              {/* 드래그 앤 드롭 영역 */}
              <div
                onDragOver={e => { e.preventDefault(); setDragging(true) }}
                onDragLeave={() => setDragging(false)}
                onDrop={onDrop}
                onClick={() => inputRef.current?.click()}
                style={{
                  flex: 1,
                  border: `2px dashed ${dragging ? '#1a3a9a' : '#b0bcc8'}`,
                  borderRadius: 4,
                  background: dragging ? '#f0f4ff' : '#fafbfc',
                  display: 'flex', flexDirection: 'column',
                  alignItems: 'center', justifyContent: 'center',
                  gap: 12, cursor: 'pointer',
                  transition: 'all 0.15s',
                  minHeight: 180,
                }}
              >
                {parsing ? (
                  <>
                    <div style={{
                      width: 36, height: 36, borderRadius: '50%',
                      border: '3px solid #d0d8e4', borderTopColor: '#1a3a7a',
                      animation: 'spin 0.8s linear infinite',
                    }} />
                    <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
                    <span style={{ fontSize: 11, color: '#5a6a7a' }}>파싱 중…</span>
                  </>
                ) : (
                  <>
                    <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
                      <rect x="8" y="6" width="24" height="32" rx="2" stroke="#6080a0" strokeWidth="1.8"/>
                      <path d="M20 6v8h12" stroke="#6080a0" strokeWidth="1.6" strokeLinejoin="round"/>
                      <path d="M12 18h12M12 23h9M12 28h7" stroke="#6080a0" strokeWidth="1.3" strokeLinecap="round"/>
                      <circle cx="36" cy="36" r="9" fill="#e8f4ee" stroke="#40a060" strokeWidth="1.5"/>
                      <path d="M33 36l2.5 2.5L39 33" stroke="#40a060" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                    <div style={{ textAlign: 'center' }}>
                      <div style={{ fontSize: 12, fontWeight: 700, color: '#2a3848' }}>
                        파일을 드래그하거나 클릭하여 선택
                      </div>
                      <div style={{ fontSize: 10, color: '#7a8898', marginTop: 4 }}>
                        .xlsx · .xls · .csv (최대 50 MB)
                      </div>
                    </div>
                  </>
                )}
                <input
                  ref={inputRef}
                  type="file"
                  accept={ACCEPT}
                  onChange={onFileInput}
                  style={{ display: 'none' }}
                />
              </div>

              {/* 예시 컬럼 안내 + #7 템플릿 다운로드 */}
              <div style={{
                padding: '8px 12px',
                background: '#eef4ff', border: '1px solid #c0d0ee', borderRadius: 3,
                fontSize: 9.5, color: '#3a4a7a',
                display: 'flex', alignItems: 'center', gap: 12,
              }}>
                <span style={{ fontFamily: 'Consolas, monospace', flex: 1 }}>
                  <span style={{ fontWeight: 700, fontFamily: FONT, marginRight: 6 }}>예시 컬럼:</span>
                  TAG · kW · PF · Voltage · MCC
                </span>
                <button
                  onClick={downloadTemplate}
                  style={{
                    padding: '3px 10px', fontSize: 9.5, cursor: 'pointer', flexShrink: 0,
                    background: '#1a3a7a', border: 'none', borderRadius: 3,
                    color: '#fff', fontWeight: 600,
                    fontFamily: FONT,
                  }}
                >
                  ↓ 템플릿 다운로드
                </button>
              </div>

              {/* 에러 */}
              {error && (
                <div style={{
                  padding: '6px 10px', background: '#fce8e8',
                  border: '1px solid #e09090', borderRadius: 2,
                  fontSize: 10, color: '#800000',
                }}>
                  ⚠ {error}
                </div>
              )}

              <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <button onClick={onClose} style={{
                  padding: '5px 18px', fontSize: 10.5, cursor: 'pointer',
                  background: '#e8ecf0', border: '1px solid #a0b0c0',
                  borderRadius: 2, color: '#3a4a5a',
                }}>취소</button>
              </div>
            </div>
          )}

          {/* ──────────────── STEP: mccStrategy (#15) ──────────────────── */}
          {step === 'mccStrategy' && (
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: '20px 28px', gap: 14 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#1a2838', fontFamily: FONT }}>
                MCC 그룹 구성 방법 선택
              </div>
              <div style={{ fontSize: 10.5, color: '#5a6a7a', fontFamily: FONT }}>
                파일에서 MCC 컬럼을 찾지 못했습니다. 모터를 어떻게 그룹화할까요?
              </div>

              {[
                { key: 'single' as MccStrategy, label: '단일 그룹', desc: '모든 모터를 하나의 MCC에 배치합니다.' },
                { key: 'bykw'   as MccStrategy, label: 'kW 범위 자동 분류', desc: '< 22 kW → LV · 22~150 kW → MV · > 150 kW → HV' },
              ].map(opt => (
                <label key={opt.key} style={{
                  display: 'flex', alignItems: 'flex-start', gap: 10,
                  padding: '10px 12px',
                  border: `2px solid ${mccStrategy === opt.key ? '#1a3a7a' : '#c8d0d8'}`,
                  borderRadius: 3, cursor: 'pointer',
                  background: mccStrategy === opt.key ? '#f0f4ff' : '#fff',
                }}>
                  <input type="radio" name="mccStrategy" value={opt.key}
                    checked={mccStrategy === opt.key}
                    onChange={() => setMccStrategy(opt.key)}
                    style={{ marginTop: 2 }}
                  />
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 700, color: '#1a2838', fontFamily: FONT }}>{opt.label}</div>
                    <div style={{ fontSize: 9.5, color: '#7a8898', fontFamily: FONT, marginTop: 2 }}>{opt.desc}</div>
                  </div>
                </label>
              ))}

              {mccStrategy === 'single' && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <label style={{ fontSize: 10, color: '#4a5a6a', fontFamily: FONT, flexShrink: 0 }}>MCC 이름:</label>
                  <input
                    value={customMcc}
                    onChange={e => setCustomMcc(e.target.value)}
                    style={{
                      flex: 1, padding: '4px 8px', fontSize: 10.5,
                      border: '1px solid #b0bcc8', borderRadius: 2,
                      fontFamily: 'Consolas, monospace', outline: 'none',
                    }}
                  />
                </div>
              )}

              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 'auto' }}>
                <button onClick={() => { setStep('upload'); setParsed(null) }} style={{
                  padding: '5px 16px', fontSize: 10.5, cursor: 'pointer',
                  background: '#e8ecf0', border: '1px solid #a0b0c0', borderRadius: 2, color: '#3a4a5a',
                }}>← 이전</button>
                <button onClick={applyMccStrategy} style={{
                  padding: '7px 22px', fontSize: 11, fontWeight: 700, cursor: 'pointer',
                  background: 'linear-gradient(to bottom, #1e3a7a, #152d60)',
                  border: 'none', borderRadius: 3, color: '#fff',
                }}>미리보기 →</button>
              </div>
            </div>
          )}

          {/* ──────────────── STEP: preview ─────────────────────────────── */}
          {step === 'preview' && parsed && (
            <MotorImportPreview
              parsed={parsed}
              onImport={runBuild}
              onBack={() => { setStep('upload'); setParsed(null) }}
            />
          )}

          {/* ──────────────── STEP: building ────────────────────────────── */}
          {step === 'building' && (
            <div style={{
              flex: 1, display: 'flex', flexDirection: 'column',
              alignItems: 'center', justifyContent: 'center',
              padding: '32px 40px', gap: 20,
            }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#1a2838' }}>
                단선도 자동 작성 중…
              </div>
              <div style={{
                width: '100%', background: '#f0f4f8',
                border: '1px solid #d0d8e4', borderRadius: 3,
                padding: '12px 20px', display: 'flex', flexDirection: 'column', gap: 10,
              }}>
                {checks.map(c => (
                  <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{
                      width: 18, height: 18, borderRadius: '50%', flexShrink: 0,
                      border: `2px solid ${c.done ? '#40c080' : '#c0ccd8'}`,
                      background: c.done ? '#40c080' : 'transparent',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      transition: 'all 0.2s',
                    }}>
                      {c.done && (
                        <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                          <path d="M2 5l2.5 2.5L8 3" stroke="white" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                      )}
                    </div>
                    <span style={{
                      fontSize: 11,
                      color: c.done ? '#2a5a2a' : '#8a9aaa',
                      fontWeight: c.done ? 600 : 400,
                      transition: 'color 0.2s',
                    }}>{c.label}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ──────────────── STEP: done ────────────────────────────────── */}
          {step === 'done' && summary && (
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: '20px 28px', gap: 16 }}>
              {/* 완료 배지 */}
              <div style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '10px 14px',
                background: '#e8f8ee', border: '1px solid #80c0a0', borderRadius: 3,
              }}>
                <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
                  <circle cx="11" cy="11" r="10" fill="#40c080"/>
                  <path d="M6 11l3.5 3.5L16 8" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
                <div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: '#1a5a2a' }}>가져오기 완료</div>
                  <div style={{ fontSize: 9, color: '#5a8a6a' }}>
                    단선도가 캔버스에 추가됩니다.
                  </div>
                </div>
              </div>

              {/* 요약 그리드 */}
              <div style={{
                display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8,
              }}>
                {[
                  ['Motors Imported',  `${summary.motorCount}개`,            '#1a3a7a'],
                  ['MCC Groups',       `${summary.mccCount}개`,              '#1a5a2a'],
                  ['Connected Load',   `${(summary.totalKW / 1000).toFixed(2)} MW`,  '#5a2800'],
                  ['Average PF',       summary.avgPF.toFixed(3),             '#003a6a'],
                  ['Largest Motor',    `${summary.largestKW} kW`,            '#4a0050'],
                  ['Cables Created',   `${summary.motorCount + summary.mccCount * 2}개`, '#00507a'],
                ].map(([label, val, color]) => (
                  <div key={label} style={{
                    padding: '8px 12px',
                    background: '#f4f8fc', border: '1px solid #d8e4f0', borderRadius: 2,
                  }}>
                    <div style={{ fontSize: 8.5, color: '#7a8898', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 3 }}>
                      {label}
                    </div>
                    <div style={{ fontSize: 14, fontWeight: 700, color: color as string, fontFamily: 'Consolas, monospace' }}>
                      {val}
                    </div>
                  </div>
                ))}
              </div>

              {/* 자동 해석 옵션 */}
              <div style={{
                padding: '10px 14px',
                background: '#f8fafc', border: '1px solid #d0d8e4', borderRadius: 3,
              }}>
                <div style={{ fontSize: 9.5, fontWeight: 700, color: '#3a4a5a', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  가져오기 후 자동 해석
                </div>
                {[
                  { key: 'lf', label: 'Load Flow', checked: runLF,  set: setRunLF,  recommended: true  },
                  { key: 'cs', label: 'Cable Sizing', checked: runCS, set: setRunCS, recommended: false },
                  { key: 'ms', label: 'Motor Starting', checked: runMS, set: setRunMS, recommended: false },
                ].map(opt => (
                  <label key={opt.key} style={{
                    display: 'flex', alignItems: 'center', gap: 8,
                    marginBottom: 6, cursor: 'pointer',
                    fontSize: 10.5, color: '#2a3848',
                  }}>
                    <input
                      type="checkbox"
                      checked={opt.checked}
                      onChange={e => opt.set(e.target.checked)}
                      style={{ cursor: 'pointer' }}
                    />
                    {opt.label}
                    {opt.recommended && (
                      <span style={{
                        fontSize: 8, background: '#1a3a7a', color: '#fff',
                        padding: '1px 5px', borderRadius: 2, fontWeight: 700,
                      }}>기본</span>
                    )}
                  </label>
                ))}
              </div>

              {/* 액션 버튼 */}
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 'auto' }}>
                <button onClick={onClose} style={{
                  padding: '5px 16px', fontSize: 10.5, cursor: 'pointer',
                  background: '#e8ecf0', border: '1px solid #a0b0c0',
                  borderRadius: 2, color: '#3a4a5a',
                }}>
                  나중에 실행
                </button>
                <button onClick={handleConfirm} style={{
                  padding: '7px 22px', fontSize: 11, fontWeight: 700, cursor: 'pointer',
                  background: 'linear-gradient(to bottom, #1e3a7a, #152d60)',
                  border: 'none', borderRadius: 3, color: '#fff',
                }}>
                  캔버스에 추가{runLF ? ' + LF 실행' : ''}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
