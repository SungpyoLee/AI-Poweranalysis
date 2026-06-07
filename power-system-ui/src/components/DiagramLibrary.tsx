/**
 * DiagramLibrary — browse, open, rename, duplicate, delete saved SLD templates.
 * Opened from Toolbar "도면 라이브러리" button.
 */

import { useState, useCallback } from 'react'
import { useDiagramLibraryStore, type DiagramTemplate } from '../store/useDiagramLibraryStore'
import type { Node as RFNode, Edge as RFEdge } from 'reactflow'
import type { NodeData, EdgeData } from '../types'

interface Props {
  onLoad:  (nodes: RFNode<NodeData>[], edges: RFEdge<EdgeData>[]) => void
  /** Save current canvas diagram to library */
  onSaveCurrent: (name: string, description: string) => void
  onClose: () => void
}

function fmtDate(iso: string): string {
  try { return new Date(iso).toLocaleDateString('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit' }) }
  catch { return iso.slice(0, 10) }
}

// ── Inline rename input ────────────────────────────────────────────────────────
function RenameInline({ current, onDone }: { current: string; onDone: (v: string) => void }) {
  const [val, setVal] = useState(current)
  return (
    <input
      autoFocus
      value={val}
      onChange={e => setVal(e.target.value)}
      onKeyDown={e => {
        if (e.key === 'Enter') { e.stopPropagation(); onDone(val.trim() || current) }
        if (e.key === 'Escape') { e.stopPropagation(); onDone(current) }
      }}
      onBlur={() => onDone(val.trim() || current)}
      onClick={e => e.stopPropagation()}
      style={{
        fontSize: 11, fontWeight: 700, width: '100%',
        padding: '2px 6px', border: '1px solid #4a7adf',
        borderRadius: 2, outline: 'none', background: '#fff',
        fontFamily: "'Segoe UI', Arial, sans-serif",
        color: '#1a2838',
      }}
    />
  )
}

// ── Save current dialog ───────────────────────────────────────────────────────
function SaveCurrentDialog({ onSave, onCancel }: { onSave: (name: string, desc: string) => void; onCancel: () => void }) {
  const [name, setName] = useState('')
  const [desc, setDesc] = useState('')
  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9500,
      background: 'rgba(0,0,0,0.4)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}
      onClick={e => { if (e.target === e.currentTarget) onCancel() }}
    >
      <div style={{
        background: '#f4f6f8', border: '1px solid #8a9aaa', borderRadius: 3,
        boxShadow: '0 8px 28px rgba(0,0,0,0.25)', width: 340,
        fontFamily: "'Segoe UI', 'Malgun Gothic', Arial, sans-serif",
      }}>
        <div style={{
          background: 'linear-gradient(to bottom, #1e3a7a, #152d60)',
          padding: '10px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: '#e8f0ff' }}>현재 도면 저장</span>
          <button onClick={onCancel} style={{ background: 'none', border: 'none', color: '#8ab0e8', cursor: 'pointer', fontSize: 16 }}>✕</button>
        </div>
        <div style={{ padding: '16px' }}>
          {[
            ['이름 *', name, setName, '예: 154kV Incoming Substation'],
            ['설명', desc, setDesc, '예: 22.9kV 주 수변전 단선도'],
          ].map(([label, val, setter, ph]) => (
            <div key={label as string} style={{ marginBottom: 12 }}>
              <label style={{ display: 'block', fontSize: 9.5, fontWeight: 700, color: '#5a6a7a', marginBottom: 5,
                textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                {label as string}
              </label>
              <input
                autoFocus={label === '이름 *'}
                value={val as string}
                onChange={e => (setter as (v: string) => void)(e.target.value)}
                placeholder={ph as string}
                style={{
                  width: '100%', boxSizing: 'border-box', padding: '6px 8px', fontSize: 10.5,
                  background: '#fff', border: '1px solid #b0bcc8', borderRadius: 2,
                  color: '#0a1a2a', outline: 'none', fontFamily: 'inherit',
                }}
                onFocus={e => { e.target.style.borderColor = '#1a3a8a' }}
                onBlur={e => { e.target.style.borderColor = '#b0bcc8' }}
              />
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', padding: '0 16px 14px' }}>
          <button onClick={onCancel} style={{
            padding: '5px 16px', fontSize: 10.5, cursor: 'pointer',
            background: '#e8ecf0', border: '1px solid #a0b0c0', borderRadius: 2, color: '#3a4a5a',
          }}>취소</button>
          <button
            onClick={() => name.trim() && onSave(name.trim(), desc.trim())}
            disabled={!name.trim()}
            style={{
              padding: '5px 16px', fontSize: 10.5, cursor: name.trim() ? 'pointer' : 'not-allowed',
              background: name.trim() ? 'linear-gradient(to bottom, #1e3a7a, #152d60)' : '#9aa8b8',
              border: 'none', borderRadius: 2, color: '#fff', fontWeight: 700, opacity: name.trim() ? 1 : 0.6,
            }}>
            저장
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Template card ─────────────────────────────────────────────────────────────
function TemplateCard({
  tpl, onLoad, onDuplicate, onRename, onDelete,
}: {
  tpl:         DiagramTemplate
  onLoad:      () => void
  onDuplicate: () => void
  onRename:    (name: string) => void
  onDelete:    () => void
}) {
  const [renaming, setRenaming] = useState(false)
  const [confirm,  setConfirm]  = useState(false)

  return (
    <div style={{
      borderBottom: '1px solid #e4eaf0', padding: '10px 16px',
      display: 'flex', alignItems: 'center', gap: 10,
      transition: 'background 0.1s', cursor: 'default',
    }}
      onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.background = '#f0f5fb' }}
      onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.background = 'transparent' }}
    >
      {/* Icon */}
      <div style={{
        width: 36, height: 36, borderRadius: 3, flexShrink: 0,
        background: 'linear-gradient(135deg, #1e3a7a 0%, #3a60c0 100%)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
          <rect x="1" y="1" width="16" height="16" rx="1.5" stroke="#60a0e8" strokeWidth="1.2"/>
          <path d="M4 9h10M9 4v10" stroke="#60a0e8" strokeWidth="1" strokeLinecap="round"/>
          <circle cx="9" cy="9" r="3" stroke="#60a0e8" strokeWidth="1"/>
        </svg>
      </div>

      {/* Meta */}
      <div style={{ flex: 1, minWidth: 0 }}>
        {renaming
          ? <RenameInline current={tpl.name} onDone={v => { onRename(v); setRenaming(false) }} />
          : <div style={{
              fontSize: 11, fontWeight: 700, color: '#1a2838',
              whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
              fontFamily: "'Segoe UI', Arial, sans-serif",
            }}>
              {tpl.name}
            </div>
        }
        <div style={{ fontSize: 9, color: '#7a8898', marginTop: 2, fontFamily: "'Segoe UI', Arial, sans-serif" }}>
          {tpl.description && <span style={{ marginRight: 8 }}>{tpl.description}</span>}
          {tpl.nodes.length}노드 · {tpl.edges.length}케이블 · {fmtDate(tpl.updatedAt)}
        </div>
      </div>

      {/* Actions */}
      <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
        {[
          { label: '열기',   color: '#1e3a7a', bg: '#e8f0ff', action: onLoad },
          { label: '복제',   color: '#2a5a2a', bg: '#e8f4ee', action: onDuplicate },
          { label: '이름변경', color: '#5a4000', bg: '#fff8e0', action: () => setRenaming(true) },
        ].map(btn => (
          <button key={btn.label} onClick={btn.action} style={{
            padding: '3px 8px', fontSize: 9, cursor: 'pointer',
            background: btn.bg, border: `1px solid ${btn.color}40`,
            borderRadius: 2, color: btn.color, fontWeight: 600,
            fontFamily: "'Segoe UI', Arial, sans-serif",
          }}>
            {btn.label}
          </button>
        ))}
        {confirm
          ? (
            <div style={{ display: 'flex', gap: 3 }}>
              <button onClick={onDelete} style={{
                padding: '3px 8px', fontSize: 9, cursor: 'pointer',
                background: '#c04040', border: 'none', borderRadius: 2, color: '#fff', fontWeight: 700,
              }}>확인</button>
              <button onClick={() => setConfirm(false)} style={{
                padding: '3px 6px', fontSize: 9, cursor: 'pointer',
                background: '#e8ecf0', border: '1px solid #a0b0c0', borderRadius: 2, color: '#3a4a5a',
              }}>취소</button>
            </div>
          )
          : (
            <button onClick={() => setConfirm(true)} style={{
              padding: '3px 8px', fontSize: 9, cursor: 'pointer',
              background: '#fee8e8', border: '1px solid #e0808040',
              borderRadius: 2, color: '#8a0000', fontWeight: 600,
              fontFamily: "'Segoe UI', Arial, sans-serif",
            }}>
              삭제
            </button>
          )
        }
      </div>
    </div>
  )
}

// ── Main component ─────────────────────────────────────────────────────────────
export default function DiagramLibrary({ onLoad, onSaveCurrent, onClose }: Props) {
  const store        = useDiagramLibraryStore()
  const [saving, setSaving] = useState(false)

  const templates = store.filtered()
  const handleLoad = useCallback((tpl: DiagramTemplate) => {
    onLoad(tpl.nodes, tpl.edges)
    onClose()
  }, [onLoad, onClose])

  return (
    <>
      <div style={{
        position: 'fixed', inset: 0, zIndex: 9200,
        background: 'rgba(0,0,0,0.42)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
        onClick={e => { if (e.target === e.currentTarget) onClose() }}
      >
        <div style={{
          background: '#f4f6f8', border: '1px solid #8a9aaa', borderRadius: 4,
          boxShadow: '0 10px 36px rgba(0,0,0,0.28)',
          width: 660, maxHeight: '82vh',
          display: 'flex', flexDirection: 'column',
          fontFamily: "'Segoe UI', 'Malgun Gothic', Arial, sans-serif",
          overflow: 'hidden',
        }}>

          {/* Header */}
          <div style={{
            background: 'linear-gradient(to bottom, #1e3a7a 0%, #152d60 100%)',
            padding: '10px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <rect x="1" y="1" width="12" height="12" rx="1.5" stroke="#60a0e8" strokeWidth="1.2"/>
                <rect x="3" y="3" width="8" height="3" rx="0.5" fill="#60a0e8" opacity="0.5"/>
                <rect x="3" y="8" width="8" height="2" rx="0.5" fill="#60a0e8" opacity="0.5"/>
              </svg>
              <span style={{ fontSize: 12, fontWeight: 700, color: '#e8f0ff', letterSpacing: '0.04em' }}>
                도면 라이브러리
              </span>
              <span style={{ fontSize: 9, background: '#2a4a9a', color: '#a0c0ff',
                padding: '1px 7px', borderRadius: 10, marginLeft: 2 }}>
                {store.templates.length}개
              </span>
            </div>
            <button onClick={onClose}
              style={{ background: 'none', border: 'none', color: '#8ab0e8', cursor: 'pointer', fontSize: 16 }}>
              ✕
            </button>
          </div>

          {/* Toolbar row */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '8px 14px', background: '#f0f4f8', borderBottom: '1px solid #d0d8e4', flexShrink: 0,
          }}>
            <input
              value={store.searchQuery}
              onChange={e => store.setSearch(e.target.value)}
              placeholder="🔍  이름·설명 검색"
              style={{
                flex: 1, padding: '5px 10px', fontSize: 10.5,
                background: '#fff', border: '1px solid #b0bcc8', borderRadius: 2,
                outline: 'none', fontFamily: "'Segoe UI', Arial, sans-serif", color: '#1a2838',
              }}
              onFocus={e => { e.target.style.borderColor = '#1a3a8a' }}
              onBlur={e => { e.target.style.borderColor = '#b0bcc8' }}
            />
            <button
              onClick={() => setSaving(true)}
              style={{
                padding: '5px 14px', fontSize: 10, cursor: 'pointer',
                background: 'linear-gradient(to bottom, #1e3a7a, #152d60)',
                border: 'none', borderRadius: 2, color: '#fff', fontWeight: 600, flexShrink: 0,
              }}
            >
              + 현재 도면 저장
            </button>
          </div>

          {/* Template list */}
          <div style={{ flex: 1, overflowY: 'auto' }}>
            {templates.length === 0 ? (
              <div style={{ padding: '48px 24px', textAlign: 'center', color: '#8a9aaa' }}>
                <div style={{ fontSize: 32, marginBottom: 10 }}>📂</div>
                <div style={{ fontSize: 11, fontWeight: 600 }}>
                  {store.searchQuery ? '검색 결과 없음' : '저장된 도면이 없습니다'}
                </div>
                <div style={{ fontSize: 9.5, marginTop: 6, lineHeight: 1.7 }}>
                  {store.searchQuery
                    ? '다른 검색어를 시도하세요.'
                    : '"현재 도면 저장" 버튼을 누르거나 SLD 가져오기 후 저장하세요.'}
                </div>
              </div>
            ) : (
              templates.map(tpl => (
                <TemplateCard
                  key={tpl.id}
                  tpl={tpl}
                  onLoad={()          => handleLoad(tpl)}
                  onDuplicate={()     => store.duplicateTemplate(tpl.id)}
                  onRename={name      => store.renameTemplate(tpl.id, name)}
                  onDelete={()        => store.deleteTemplate(tpl.id)}
                />
              ))
            )}
          </div>

          {/* Footer */}
          <div style={{
            padding: '6px 14px', borderTop: '1px solid #d0d8e0',
            fontSize: 8.5, color: '#9aaabb', flexShrink: 0,
            fontFamily: 'Consolas, monospace',
          }}>
            localStorage · pfa-diagrams · 최대 100개
          </div>
        </div>
      </div>

      {saving && (
        <SaveCurrentDialog
          onSave={(name, desc) => { onSaveCurrent(name, desc); setSaving(false) }}
          onCancel={() => setSaving(false)}
        />
      )}
    </>
  )
}
