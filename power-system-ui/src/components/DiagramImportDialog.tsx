/**
 * DiagramImportDialog — 4-step SLD import wizard.
 *
 * Step 1 Upload  → drop PDF / PNG / JPG
 * Step 2 Process → PDF→canvas, OCR, symbol detect, graph build
 * Step 3 Review  → ImportReviewDialog (select / fix types / edges)
 * Step 4 Done    → import count summary
 */

import { useState, useCallback, useRef } from 'react'
import type { Node as RFNode, Edge as RFEdge } from 'reactflow'
import type { NodeData, EdgeData } from '../types'

import { fileToCanvases, getFileType } from '../import/pdfImporter'
import { extractWords, mergeOcrResults, type OcrResult } from '../import/ocr'
import { detectSymbols, type DetectedSymbol } from '../import/symbolDetector'
import { buildGraph, mergeResults, type BuildResult } from '../import/graphBuilder'
import ImportReviewDialog from './ImportReviewDialog'

type Step = 'upload' | 'process' | 'review' | 'done'

interface Props {
  onClose:  () => void
  onImport: (nodes: RFNode<NodeData>[], edges: RFEdge<EdgeData>[]) => void
}

const MAX_FILE_MB = 50

// ── Step indicator ─────────────────────────────────────────────────────────────
const STEPS = [
  { id: 'upload',  label: '업로드' },
  { id: 'process', label: '처리' },
  { id: 'review',  label: '검토' },
  { id: 'done',    label: '완료' },
] as const

function StepBar({ current }: { current: Step }) {
  const idx = STEPS.findIndex(s => s.id === current)
  return (
    <div style={{ display: 'flex', alignItems: 'center', padding: '10px 20px 0', gap: 0 }}>
      {STEPS.map((s, i) => {
        const done = i < idx, active = i === idx
        return (
          <div key={s.id} style={{ display: 'flex', alignItems: 'center', flex: i < STEPS.length - 1 ? 1 : 'none' }}>
            <div style={{
              width: 22, height: 22, borderRadius: '50%', flexShrink: 0,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 10, fontWeight: 700,
              background: done ? '#1a3a7a' : active ? '#4a7adf' : '#d0d8e4',
              color: (done || active) ? '#fff' : '#8a9aaa',
              boxShadow: active ? '0 0 0 3px rgba(74,122,223,0.2)' : 'none',
            }}>
              {done ? '✓' : i + 1}
            </div>
            <span style={{
              fontSize: 9, marginLeft: 4, whiteSpace: 'nowrap',
              color: active ? '#1a3a7a' : done ? '#4a5a7a' : '#9aaabb',
              fontWeight: active ? 700 : 400,
              fontFamily: "'Segoe UI', Arial, sans-serif",
            }}>
              {s.label}
            </span>
            {i < STEPS.length - 1 && (
              <div style={{ flex: 1, height: 1, marginInline: 6, background: done ? '#1a3a7a' : '#d0d8e4' }} />
            )}
          </div>
        )
      })}
    </div>
  )
}

// ── Upload step ────────────────────────────────────────────────────────────────
function UploadStep({ onStart }: { onStart: (file: File) => void }) {
  const [file,    setFile]    = useState<File | null>(null)
  const [drag,    setDrag]    = useState(false)
  const [fileErr, setFileErr] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  const accept = (f: File) => {
    const ok = /\.(pdf|png|jpe?g)$/i.test(f.name) || f.type.startsWith('image/')
    if (!ok)                            return setFileErr('PDF, PNG, JPG 파일만 지원합니다.')
    if (f.size > MAX_FILE_MB * 1048576) return setFileErr(`최대 ${MAX_FILE_MB}MB까지 지원합니다.`)
    setFileErr('')
    setFile(f)
  }

  return (
    <div style={{ padding: '16px 24px 20px' }}>
      <div
        onClick={() => inputRef.current?.click()}
        onDragOver={e => { e.preventDefault(); setDrag(true) }}
        onDragLeave={() => setDrag(false)}
        onDrop={e => { e.preventDefault(); setDrag(false); const f = e.dataTransfer.files[0]; if (f) accept(f) }}
        style={{
          border: `2px dashed ${drag ? '#1a3a7a' : file ? '#1a9a4a' : '#b0bcc8'}`,
          borderRadius: 4, padding: '32px 20px', textAlign: 'center',
          background: drag ? '#eef2ff' : file ? '#efffef' : '#f8fafc',
          cursor: 'pointer', transition: 'all 0.2s', marginBottom: 14,
        }}
      >
        <svg width="42" height="42" viewBox="0 0 42 42" fill="none" style={{ display: 'block', margin: '0 auto 10px' }}>
          <rect x="4" y="2" width="24" height="34" rx="2" stroke={file ? '#1a9a4a' : '#8aaac8'} strokeWidth="1.5"/>
          <path d="M24 2v9h9" stroke={file ? '#1a9a4a' : '#8aaac8'} strokeWidth="1.5" strokeLinejoin="round"/>
          <path d="M21 20v10M16 25l5-5 5 5" stroke="#4a7adf" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
        <div style={{ fontSize: 11.5, fontWeight: 600, color: file ? '#1a7a3a' : '#1a3a7a', fontFamily: "'Segoe UI', Arial, sans-serif" }}>
          {file ? file.name : 'SLD 파일을 드래그하거나 클릭하여 선택'}
        </div>
        {file
          ? <div style={{ fontSize: 9, color: '#5a8a6a', marginTop: 4, fontFamily: 'Consolas, monospace' }}>
              {getFileType(file) === 'pdf' ? 'PDF' : '이미지'} · {(file.size / 1048576).toFixed(1)} MB
            </div>
          : <div style={{ fontSize: 9.5, color: '#9aaabb', marginTop: 4 }}>
              PDF · PNG · JPG · JPEG &nbsp;(최대 {MAX_FILE_MB}MB)
            </div>
        }
        <input ref={inputRef} type="file" accept=".pdf,.png,.jpg,.jpeg,image/*"
          style={{ display: 'none' }} onChange={e => { const f = e.target.files?.[0]; if (f) accept(f) }} />
      </div>

      {fileErr && (
        <div style={{ fontSize: 10, color: '#c04040', marginBottom: 10, fontFamily: "'Segoe UI', Arial, sans-serif" }}>
          ⚠ {fileErr}
        </div>
      )}

      <div style={{
        background: '#f0f4f8', border: '1px solid #c8d4e0', borderRadius: 3,
        padding: '8px 12px', fontSize: 9.5, color: '#4a5a7a', marginBottom: 14,
        fontFamily: "'Segoe UI', Arial, sans-serif", lineHeight: 1.7,
      }}>
        <b>인식 가능한 장비</b>: Bus · 변압기 · 차단기 · 전동기 · 발전기 · 부하<br />
        <b>권장</b>: 장비 이름이 명확히 표기된 도면 (BUS-154, TR-1, CB-101 등)<br />
        <b>참고</b>: 텍스트 기반 인식 — 스캔 도면은 OCR 품질에 따라 결과 다를 수 있음
      </div>

      <button
        onClick={() => file && onStart(file)}
        disabled={!file}
        style={{
          width: '100%', padding: '9px 0', fontSize: 12, fontWeight: 700,
          cursor: file ? 'pointer' : 'not-allowed',
          background: file ? 'linear-gradient(to bottom, #1e3a7a, #152d60)' : '#9aa8b8',
          border: 'none', borderRadius: 3, color: '#fff',
          fontFamily: "'Segoe UI', Arial, sans-serif", opacity: file ? 1 : 0.6,
        }}
      >
        분석 시작 →
      </button>
    </div>
  )
}

// ── Process step ──────────────────────────────────────────────────────────────
interface ProcessStep {
  label: string
  pct:   number
  done:  boolean
}

function ProcessView({
  steps, error, onRetry,
}: {
  steps: ProcessStep[]
  error: string | null
  onRetry: () => void
}) {
  const overall = steps.reduce((s, p) => s + p.pct, 0) / steps.length

  if (error) {
    return (
      <div style={{ padding: '32px 24px', textAlign: 'center', color: '#8a0000' }}>
        <div style={{ fontSize: 32, marginBottom: 8 }}>✕</div>
        <div style={{ fontSize: 12, fontWeight: 700 }}>처리 실패</div>
        <div style={{ fontSize: 10, marginTop: 6, color: '#c04040', lineHeight: 1.6 }}>{error}</div>
        <button onClick={onRetry} style={{
          marginTop: 20, padding: '6px 20px', fontSize: 10.5,
          background: '#1e3a7a', border: 'none', borderRadius: 3, color: '#fff', cursor: 'pointer',
        }}>
          처음으로
        </button>
      </div>
    )
  }

  return (
    <div style={{ padding: '24px' }}>
      {/* Overall progress bar */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ height: 8, background: '#e0e8f0', borderRadius: 4, overflow: 'hidden' }}>
          <div style={{
            height: '100%', borderRadius: 4,
            width: `${overall}%`,
            background: 'linear-gradient(to right, #1a3a7a, #4a7adf)',
            transition: 'width 0.4s ease',
          }} />
        </div>
        <div style={{ marginTop: 5, fontSize: 9, color: '#8a9aaa', fontFamily: 'Consolas, monospace', textAlign: 'right' }}>
          {Math.round(overall)}%
        </div>
      </div>

      {/* Step checklist */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {steps.map((s, i) => (
          <div key={i} style={{
            display: 'flex', alignItems: 'center', gap: 10,
            fontFamily: "'Segoe UI', Arial, sans-serif", fontSize: 10.5,
          }}>
            <div style={{
              width: 20, height: 20, borderRadius: '50%', flexShrink: 0,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: s.done ? '#1a9a4a' : s.pct > 0 ? '#4a7adf' : '#d0d8e4',
              color: s.done || s.pct > 0 ? '#fff' : '#9aaabb', fontSize: 9, fontWeight: 700,
            }}>
              {s.done ? '✓' : s.pct > 0 ? '…' : i + 1}
            </div>
            <span style={{ flex: 1, color: s.done ? '#1a5a2a' : s.pct > 0 ? '#1a3a7a' : '#8a9aaa', fontWeight: s.pct > 0 ? 600 : 400 }}>
              {s.label}
            </span>
            {s.pct > 0 && !s.done && (
              <span style={{ fontSize: 9, color: '#6a7a8a', fontFamily: 'Consolas, monospace' }}>{s.pct}%</span>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Wizard root ────────────────────────────────────────────────────────────────
export default function DiagramImportDialog({ onClose, onImport }: Props) {
  const [step,     setStep]     = useState<Step>('upload')
  const [pSteps,   setPSteps]   = useState<ProcessStep[]>([
    { label: '이미지 변환 중…',     pct: 0, done: false },
    { label: 'OCR 텍스트 인식 중…', pct: 0, done: false },
    { label: '심볼 감지 중…',       pct: 0, done: false },
    { label: '연결 관계 분석 중…',  pct: 0, done: false },
  ])
  const [error,    setError]    = useState<string | null>(null)
  const [symbols,  setSymbols]  = useState<DetectedSymbol[]>([])
  const [graph,    setGraph]    = useState<BuildResult>({ nodes: [], edges: [] })
  const [doneInfo, setDoneInfo] = useState({ nodes: 0, edges: 0 })

  const patchStep = (idx: number, patch: Partial<ProcessStep>) =>
    setPSteps(prev => prev.map((s, i) => i === idx ? { ...s, ...patch } : s))

  const handleStart = useCallback(async (file: File) => {
    setError(null)
    setStep('process')
    setPSteps([
      { label: '이미지 변환 중…',     pct: 2, done: false },
      { label: 'OCR 텍스트 인식 중…', pct: 0, done: false },
      { label: '심볼 감지 중…',       pct: 0, done: false },
      { label: '연결 관계 분석 중…',  pct: 0, done: false },
    ])

    try {
      // ── Step 0: PDF / image → canvas ─────────────────────────────
      const canvases = await fileToCanvases(file, (done, total) => {
        patchStep(0, { pct: Math.round((done / total) * 100) })
      })
      patchStep(0, { pct: 100, done: true })
      patchStep(1, { pct: 2 })

      // ── Step 1: OCR ───────────────────────────────────────────────
      const ocrResults: OcrResult[] = []
      for (let i = 0; i < canvases.length; i++) {
        const res = await extractWords(canvases[i], (pct) => {
          const base = Math.round((i / canvases.length) * 100)
          patchStep(1, { pct: base + Math.round(pct / canvases.length) })
        })
        ocrResults.push(res)
      }
      const merged = ocrResults.length > 1 ? mergeOcrResults(ocrResults) : ocrResults[0]
      patchStep(1, { pct: 100, done: true })
      patchStep(2, { pct: 5 })

      // ── Step 2: Symbol detection ─────────────────────────────────
      let allSymbols: DetectedSymbol[] = []
      let combinedGraph: BuildResult   = { nodes: [], edges: [] }

      if (canvases.length === 1) {
        allSymbols    = detectSymbols(canvases[0], merged)
        combinedGraph = buildGraph(canvases[0], allSymbols)
      } else {
        // Multi-page: detect per page then merge
        for (let i = 0; i < canvases.length; i++) {
          const pageOcr = ocrResults[i]
          const pageSym = detectSymbols(canvases[i], pageOcr)
          const pageGrp = buildGraph(canvases[i], pageSym)
          allSymbols.push(...pageSym)
          combinedGraph = i === 0 ? pageGrp : mergeResults(combinedGraph, pageGrp)
          patchStep(2, { pct: Math.round(((i + 1) / canvases.length) * 100) })
        }
      }
      patchStep(2, { pct: 100, done: true })
      patchStep(3, { pct: 50 })

      // ── Step 3: Graph build (already done above) ─────────────────
      patchStep(3, { pct: 100, done: true })

      setSymbols(allSymbols)
      setGraph(combinedGraph)
      setStep('review')

    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }, [])

  const handleImportConfirm = useCallback((
    _syms: DetectedSymbol[],
    finalGraph: BuildResult,
  ) => {
    onImport(finalGraph.nodes, finalGraph.edges)
    setDoneInfo({ nodes: finalGraph.nodes.length, edges: finalGraph.edges.length })
    setStep('done')
  }, [onImport])

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9300,
      background: 'rgba(0,0,0,0.44)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div style={{
        background: '#f4f6f8', border: '1px solid #8a9aaa', borderRadius: 4,
        boxShadow: '0 10px 40px rgba(0,0,0,0.3)',
        width: step === 'review' ? 720 : 560,
        maxHeight: '90vh', display: 'flex', flexDirection: 'column',
        fontFamily: "'Segoe UI', 'Malgun Gothic', Arial, sans-serif",
        overflow: 'hidden', transition: 'width 0.3s ease',
      }}>

        {/* Header */}
        <div style={{
          background: 'linear-gradient(to bottom, #1e3a7a 0%, #152d60 100%)',
          padding: '10px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <rect x="1" y="1" width="14" height="14" rx="1.5" stroke="#60a0e8" strokeWidth="1.2"/>
              <path d="M4 8h8M8 4v8" stroke="#60a0e8" strokeWidth="1.3" strokeLinecap="round"/>
              <circle cx="8" cy="8" r="2.5" stroke="#60a0e8" strokeWidth="1"/>
            </svg>
            <span style={{ fontSize: 12, fontWeight: 700, color: '#e8f0ff', letterSpacing: '0.04em' }}>
              SLD 가져오기
            </span>
            {step === 'review' && symbols.length > 0 && (
              <span style={{ fontSize: 9, background: '#2a4a9a', color: '#a0c0ff',
                padding: '1px 8px', borderRadius: 10, marginLeft: 4 }}>
                {symbols.length}개 장비 감지됨
              </span>
            )}
          </div>
          <button onClick={onClose}
            style={{ background: 'none', border: 'none', color: '#8ab0e8', cursor: 'pointer', fontSize: 16 }}>
            ✕
          </button>
        </div>

        {/* Step bar */}
        {step !== 'done' && (
          <div style={{ background: '#f8fafc', borderBottom: '1px solid #d8e0ea', flexShrink: 0 }}>
            <StepBar current={step} />
            <div style={{ height: 10 }} />
          </div>
        )}

        {/* Body */}
        <div style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
          {step === 'upload' && <UploadStep onStart={handleStart} />}

          {step === 'process' && (
            <ProcessView
              steps={pSteps}
              error={error}
              onRetry={() => { setStep('upload'); setError(null) }}
            />
          )}

          {step === 'review' && symbols.length > 0 && (
            <ImportReviewDialog
              symbols={symbols}
              graph={graph}
              onImport={handleImportConfirm}
              onBack={() => setStep('upload')}
            />
          )}

          {step === 'review' && symbols.length === 0 && (
            <div style={{ padding: '40px 24px', textAlign: 'center', color: '#5a6a7a' }}>
              <div style={{ fontSize: 32, marginBottom: 10 }}>🔍</div>
              <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 8 }}>장비를 감지하지 못했습니다</div>
              <div style={{ fontSize: 10, lineHeight: 1.7, maxWidth: 360, margin: '0 auto' }}>
                도면에서 식별 가능한 텍스트 레이블(BUS-, TR-, CB- 등)이 있는지 확인하세요.
                스캔 품질이 낮은 경우 OCR 정확도가 떨어질 수 있습니다.
              </div>
              <button onClick={() => setStep('upload')} style={{
                marginTop: 20, padding: '6px 20px', fontSize: 10.5,
                background: '#1e3a7a', border: 'none', borderRadius: 3, color: '#fff', cursor: 'pointer',
              }}>
                ← 다시 업로드
              </button>
            </div>
          )}

          {step === 'done' && (
            <div style={{ padding: '40px 24px', textAlign: 'center' }}>
              <div style={{ fontSize: 40, marginBottom: 12 }}>✅</div>
              <div style={{ fontSize: 14, fontWeight: 700, color: '#1a5a2a', marginBottom: 8 }}>
                가져오기 완료
              </div>
              <div style={{ fontSize: 10.5, color: '#4a5a7a', lineHeight: 1.8, fontFamily: 'Consolas, monospace' }}>
                장비 <b>{doneInfo.nodes}</b>개 · 케이블 <b>{doneInfo.edges}</b>개가 캔버스에 추가됐습니다
              </div>
              <div style={{ fontSize: 9.5, color: '#8a9aaa', marginTop: 8 }}>
                속성 패널에서 파라미터를 확인·수정한 후 Load Flow를 실행하세요.
              </div>
              <button onClick={onClose} style={{
                marginTop: 24, padding: '8px 28px', fontSize: 11, fontWeight: 700,
                background: 'linear-gradient(to bottom, #1e3a7a, #152d60)',
                border: 'none', borderRadius: 3, color: '#fff', cursor: 'pointer',
                fontFamily: "'Segoe UI', Arial, sans-serif",
              }}>
                확인
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
