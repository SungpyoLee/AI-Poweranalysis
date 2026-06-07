import { useState } from 'react'
import type { PFAMeta, RevisionEntry } from '../utils/projectIO'

interface Props {
  mode:      'new' | 'edit'
  meta:      PFAMeta
  onConfirm: (patch: Partial<PFAMeta>) => void
  onCancel:  () => void
}

export default function ProjectDialog({ mode, meta, onConfirm, onCancel }: Props) {
  const [name,          setName]          = useState(mode === 'new' ? '' : meta.name)
  const [desc,          setDesc]          = useState(meta.description)
  const [freq,          setFreq]          = useState<50 | 60>(meta.frequency_hz ?? 60)
  const [projectNumber, setProjectNumber] = useState(meta.projectNumber ?? '')
  const [docNumber,     setDocNumber]     = useState(meta.docNumber ?? '')
  const [revision,      setRevision]      = useState(meta.revision ?? 'Rev.0')
  const [engineer,      setEngineer]      = useState(meta.engineer ?? '')
  const [checker,       setChecker]       = useState(meta.checker ?? '')
  const [approver,      setApprover]      = useState(meta.approver ?? '')
  const [client,        setClient]        = useState(meta.client ?? '')
  const [coordMargin,   setCoordMargin]   = useState(String(meta.coordination_margin_s ?? 0.3))
  const [revHistory,    setRevHistory]    = useState<RevisionEntry[]>(meta.revisionHistory ?? [])
  const [newRevDesc,    setNewRevDesc]    = useState('')

  const canConfirm = name.trim().length > 0

  const handleConfirm = () => {
    if (!canConfirm) return
    onConfirm({
      name:            name.trim(),
      description:     desc.trim(),
      frequency_hz:    freq,
      projectNumber:   projectNumber.trim(),
      docNumber:       docNumber.trim(),
      revision:        revision.trim(),
      engineer:        engineer.trim(),
      checker:         checker.trim(),
      approver:        approver.trim(),
      client:          client.trim(),
      coordination_margin_s: Math.max(0.1, Math.min(1.0, parseFloat(coordMargin) || 0.3)),
      revisionHistory: revHistory,
    })
  }

  return (
    <div
      onKeyDown={e => {
        if (e.key === 'Enter' && canConfirm) handleConfirm()
        if (e.key === 'Escape') onCancel()
      }}
      style={{
        position: 'fixed', inset: 0, zIndex: 9000,
        background: 'rgba(0,0,0,0.45)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
      onClick={e => { if (e.target === e.currentTarget) onCancel() }}
    >
      <div style={{
        background: '#f4f6f8',
        border: '1px solid #8a9aaa',
        borderRadius: 3,
        boxShadow: '0 8px 28px rgba(0,0,0,0.25)',
        width: 480,
        maxHeight: '90vh',
        display: 'flex', flexDirection: 'column',
        fontFamily: "'Segoe UI', 'Malgun Gothic', Arial, sans-serif",
        overflow: 'hidden',
      }}>
        {/* Header */}
        <div style={{
          background: 'linear-gradient(to bottom, #1e3a7a 0%, #152d60 100%)',
          padding: '10px 16px',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          flexShrink: 0,
        }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: '#e8f0ff', letterSpacing: '0.04em' }}>
            {mode === 'new' ? '새 프로젝트' : '프로젝트 속성'}
          </span>
          <button
            onClick={onCancel}
            style={{ background: 'none', border: 'none', color: '#8ab0e8', cursor: 'pointer', fontSize: 16, lineHeight: 1 }}
          >✕</button>
        </div>

        {/* Body */}
        <div style={{ padding: '14px 16px 10px', overflowY: 'auto', flex: 1 }}>

          {/* ── 기본 정보 ── */}
          <SectionLabel>기본 정보</SectionLabel>

          <FieldRow label="프로젝트 이름 *">
            <Input
              autoFocus
              value={name}
              onChange={setName}
              placeholder="예: Main Substation 22.9kV"
              error={!canConfirm && name.length > 0}
            />
          </FieldRow>

          <FieldRow label="설명">
            <textarea
              value={desc}
              onChange={e => setDesc(e.target.value)}
              rows={2}
              placeholder="프로젝트 설명 (선택)"
              style={{
                width: '100%', boxSizing: 'border-box', resize: 'vertical',
                padding: '5px 8px', fontSize: 11,
                fontFamily: "'Segoe UI', Arial, sans-serif",
                background: '#fff', border: '1px solid #b0bcc8',
                borderRadius: 2, color: '#0a1a2a', outline: 'none',
              }}
              onFocus={e => { e.target.style.borderColor = '#1a3a8a' }}
              onBlur={e => { e.target.style.borderColor = '#b0bcc8' }}
            />
          </FieldRow>

          {/* ── 계통 설정 ── */}
          <SectionLabel>계통 설정</SectionLabel>

          <FieldRow label="계통 주파수">
            <div style={{ display: 'flex', gap: 8 }}>
              {([50, 60] as const).map(hz => (
                <label key={hz} style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  padding: '4px 14px',
                  background: freq === hz ? '#1e3a7a' : '#fff',
                  border: `1px solid ${freq === hz ? '#1e3a7a' : '#b0bcc8'}`,
                  borderRadius: 2, cursor: 'pointer',
                  fontSize: 11, fontWeight: freq === hz ? 700 : 400,
                  color: freq === hz ? '#fff' : '#2a3a4a',
                  fontFamily: 'Consolas, monospace',
                }}>
                  <input
                    type="radio"
                    name="freq"
                    value={hz}
                    checked={freq === hz}
                    onChange={() => setFreq(hz)}
                    style={{ display: 'none' }}
                  />
                  {hz} Hz
                </label>
              ))}
              <span style={{ fontSize: 9.5, color: '#8a9aaa', alignSelf: 'center' }}>
                {freq === 60 ? '북미 / 일부 선박' : 'IEC 표준 (한국 포함)'}
              </span>
            </div>
          </FieldRow>

          <FieldRow label="협조 마진 (s)">
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <input
                type="number"
                value={coordMargin}
                onChange={e => setCoordMargin(e.target.value)}
                min={0.1} max={1.0} step={0.05}
                style={{
                  width: 80, padding: '4px 7px', fontSize: 10.5,
                  fontFamily: 'Consolas, monospace',
                  background: '#fff', border: '1px solid #b0bcc8',
                  borderRadius: 2, color: '#0a1a2a', outline: 'none',
                }}
                onFocus={e => { e.target.style.borderColor = '#1a3a8a' }}
                onBlur={e => { e.target.style.borderColor = '#b0bcc8' }}
              />
              <span style={{ fontSize: 9.5, color: '#8a9aaa' }}>
                IEC 60255 기본: 0.3s — 범위 0.1~1.0s
              </span>
            </div>
          </FieldRow>

          {/* ── 문서 정보 (EPC 납품) ── */}
          <SectionLabel>문서 정보 (EPC 납품)</SectionLabel>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 12px' }}>
            <FieldRow label="프로젝트 번호">
              <Input value={projectNumber} onChange={setProjectNumber} placeholder="예: 2024-PRJ-001" />
            </FieldRow>
            <FieldRow label="문서 번호">
              <Input value={docNumber} onChange={setDocNumber} placeholder="예: E-CAL-001" />
            </FieldRow>
            <FieldRow label="개정 번호">
              <Input value={revision} onChange={setRevision} placeholder="Rev.0" />
            </FieldRow>
            <FieldRow label="발주처">
              <Input value={client} onChange={setClient} placeholder="발주처명" />
            </FieldRow>
            <FieldRow label="작성">
              <Input value={engineer} onChange={setEngineer} placeholder="작성자 이름" />
            </FieldRow>
            <FieldRow label="검토">
              <Input value={checker} onChange={setChecker} placeholder="검토자 이름" />
            </FieldRow>
            <FieldRow label="승인">
              <Input value={approver} onChange={setApprover} placeholder="승인자 이름" />
            </FieldRow>
          </div>

          {/* ── P2-7: 개정 이력 ── */}
          <SectionLabel>개정 이력 (P2-7)</SectionLabel>

          {revHistory.length > 0 && (
            <div style={{ marginBottom: 8, maxHeight: 120, overflowY: 'auto', border: '1px solid #d0d8e0', borderRadius: 2 }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 9, fontFamily: 'Consolas, monospace' }}>
                <thead>
                  <tr style={{ background: '#eef2f8' }}>
                    {['Rev', '날짜', '작성자', '내용'].map(h => (
                      <th key={h} style={{ padding: '3px 6px', textAlign: 'left', fontWeight: 700, color: '#4a5a7a', borderBottom: '1px solid #d0d8e0' }}>{h}</th>
                    ))}
                    <th style={{ width: 24 }} />
                  </tr>
                </thead>
                <tbody>
                  {revHistory.map((r, i) => (
                    <tr key={i} style={{ background: i % 2 === 0 ? '#fff' : '#fafbfc' }}>
                      <td style={{ padding: '2px 6px', color: '#1a2838', fontWeight: 700 }}>{r.rev}</td>
                      <td style={{ padding: '2px 6px', color: '#4a5a6a' }}>{r.date ? new Date(r.date).toLocaleDateString('ko-KR') : '—'}</td>
                      <td style={{ padding: '2px 6px', color: '#4a5a6a' }}>{r.author || '—'}</td>
                      <td style={{ padding: '2px 6px', color: '#4a5a6a' }}>{r.description}</td>
                      <td style={{ padding: '2px 4px' }}>
                        <button onClick={() => setRevHistory(prev => prev.filter((_, j) => j !== i))}
                          style={{ background: 'none', border: 'none', color: '#c03030', cursor: 'pointer', fontSize: 11, padding: 0 }}>✕</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <input
              value={newRevDesc}
              onChange={e => setNewRevDesc(e.target.value)}
              placeholder="변경 내용 (예: Load flow 파라미터 업데이트)"
              style={{ flex: 1, padding: '3px 6px', fontSize: 9.5, fontFamily: "'Segoe UI', sans-serif", border: '1px solid #b0bcc8', borderRadius: 2, background: '#fff' }}
              onKeyDown={e => {
                if (e.key === 'Enter' && newRevDesc.trim()) {
                  const nextRevNum = revHistory.length
                  setRevHistory(prev => [...prev, {
                    rev:         `Rev.${nextRevNum}`,
                    date:        new Date().toISOString(),
                    author:      engineer,
                    description: newRevDesc.trim(),
                  }])
                  setRevision(`Rev.${nextRevNum}`)
                  setNewRevDesc('')
                }
              }}
            />
            <button
              onClick={() => {
                if (!newRevDesc.trim()) return
                const nextRevNum = revHistory.length
                setRevHistory(prev => [...prev, {
                  rev:         `Rev.${nextRevNum}`,
                  date:        new Date().toISOString(),
                  author:      engineer,
                  description: newRevDesc.trim(),
                }])
                setRevision(`Rev.${nextRevNum}`)
                setNewRevDesc('')
              }}
              disabled={!newRevDesc.trim()}
              style={{ padding: '3px 10px', fontSize: 9.5, cursor: 'pointer', background: '#1e3a7a', border: 'none', borderRadius: 2, color: '#fff', whiteSpace: 'nowrap' }}
            >+ 추가</button>
          </div>
          <div style={{ fontSize: 8.5, color: '#9aabb8', marginTop: 3 }}>Enter 또는 + 추가 버튼으로 개정 이력 추가</div>

          {mode === 'edit' && (
            <div style={{ marginTop: 8, fontSize: 9, color: '#8a9aaa', fontFamily: 'Consolas, monospace', lineHeight: 1.7 }}>
              <div>생성: {new Date(meta.created).toLocaleString('ko-KR')}</div>
              <div>수정: {new Date(meta.modified).toLocaleString('ko-KR')}</div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{
          display: 'flex', gap: 8, justifyContent: 'flex-end',
          padding: '10px 16px 14px',
          borderTop: '1px solid #d0d8e0', flexShrink: 0,
        }}>
          <button
            onClick={onCancel}
            style={{
              padding: '5px 18px', fontSize: 10.5, cursor: 'pointer',
              background: '#e8ecf0', border: '1px solid #a0b0c0',
              borderRadius: 2, color: '#3a4a5a',
              fontFamily: "'Segoe UI', Arial, sans-serif",
            }}
          >취소</button>
          <button
            onClick={handleConfirm}
            disabled={!canConfirm}
            style={{
              padding: '5px 18px', fontSize: 10.5, cursor: canConfirm ? 'pointer' : 'not-allowed',
              background: canConfirm ? 'linear-gradient(to bottom, #1e3a7a, #152d60)' : '#9aa8b8',
              border: '1px solid transparent', borderRadius: 2,
              color: '#fff', fontWeight: 700,
              fontFamily: "'Segoe UI', Arial, sans-serif",
              opacity: canConfirm ? 1 : 0.6,
            }}
          >
            {mode === 'new' ? '만들기' : '저장'}
          </button>
        </div>
      </div>
    </div>
  )
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      fontSize: 9, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase',
      color: '#6a7a8a', borderBottom: '1px solid #d0d8e0', paddingBottom: 3,
      marginBottom: 8, marginTop: 4,
    }}>
      {children}
    </div>
  )
}

function FieldRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 8 }}>
      <label style={{
        display: 'block', fontSize: 9, fontWeight: 700,
        color: '#5a6a7a', marginBottom: 3,
        fontFamily: "'Segoe UI', Arial, sans-serif",
        textTransform: 'uppercase', letterSpacing: '0.06em',
      }}>
        {label}
      </label>
      {children}
    </div>
  )
}

function Input({
  value, onChange, placeholder, autoFocus, error,
}: {
  value: string
  onChange: (v: string) => void
  placeholder?: string
  autoFocus?: boolean
  error?: boolean
}) {
  return (
    <input
      autoFocus={autoFocus}
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      style={{
        width: '100%', boxSizing: 'border-box',
        padding: '4px 7px', fontSize: 10.5,
        fontFamily: 'Consolas, monospace',
        background: '#fff',
        border: `1px solid ${error ? '#e08080' : '#b0bcc8'}`,
        borderRadius: 2, color: '#0a1a2a', outline: 'none',
      }}
      onFocus={e => { e.target.style.borderColor = '#1a3a8a' }}
      onBlur={e => { e.target.style.borderColor = error ? '#e08080' : '#b0bcc8' }}
    />
  )
}
