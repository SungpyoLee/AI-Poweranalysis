import { useState } from 'react'
import {
  type RecentEntry, type PFAFile,
  getRecentProjects, removeFromRecent, clearRecent, parsePFA, formatModified,
} from '../utils/projectIO'

interface Props {
  onLoad:  (pfa: PFAFile, fileName: string) => void
  onClose: () => void
}

export default function RecentProjectsPanel({ onLoad, onClose }: Props) {
  const [entries, setEntries] = useState<RecentEntry[]>(() => getRecentProjects())
  const [error, setError] = useState<string | null>(null)

  const handleLoad = (entry: RecentEntry) => {
    try {
      const pfa = parsePFA(entry.data)
      onLoad(pfa, entry.fileName)
    } catch (e: any) {
      setError(`"${entry.name}" 을(를) 불러올 수 없습니다: ${e.message}`)
    }
  }

  const handleRemove = (id: string) => {
    removeFromRecent(id)
    setEntries(getRecentProjects())
  }

  const handleClearAll = () => {
    clearRecent()
    setEntries([])
  }

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 9000,
        background: 'rgba(0,0,0,0.45)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div style={{
        background: '#f4f6f8',
        border: '1px solid #8a9aaa',
        borderRadius: 3,
        boxShadow: '0 8px 28px rgba(0,0,0,0.25)',
        width: 520, maxHeight: '80vh',
        display: 'flex', flexDirection: 'column',
        fontFamily: "'Segoe UI', 'Malgun Gothic', Arial, sans-serif",
        overflow: 'hidden',
      }}
        onKeyDown={e => e.key === 'Escape' && onClose()}
      >
        {/* Header */}
        <div style={{
          background: 'linear-gradient(to bottom, #1e3a7a 0%, #152d60 100%)',
          padding: '10px 16px',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          flexShrink: 0,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <rect x="1" y="2" width="5" height="10" rx="0.5" stroke="#60a0e8" strokeWidth="1.2"/>
              <rect x="7" y="1" width="5" height="11" rx="0.5" stroke="#60a0e8" strokeWidth="1.2"/>
            </svg>
            <span style={{ fontSize: 12, fontWeight: 700, color: '#e8f0ff', letterSpacing: '0.04em' }}>
              최근 프로젝트
            </span>
          </div>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', color: '#8ab0e8', cursor: 'pointer', fontSize: 16, lineHeight: 1 }}
          >
            ✕
          </button>
        </div>

        {/* Error bar */}
        {error && (
          <div style={{
            background: '#fce8e8', borderBottom: '1px solid #e09090',
            padding: '6px 16px', fontSize: 10, color: '#800000',
            display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0,
          }}>
            <span style={{ flex: 1 }}>{error}</span>
            <button onClick={() => setError(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#800000', fontSize: 13 }}>✕</button>
          </div>
        )}

        {/* List */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '8px 0' }}>
          {entries.length === 0 ? (
            <div style={{
              padding: '32px 16px', textAlign: 'center',
              color: '#8a9aaa', fontSize: 11,
            }}>
              최근 저장된 프로젝트가 없습니다.
              <br />
              <span style={{ fontSize: 9.5, color: '#b0bcc8' }}>저장 후 여기에 표시됩니다.</span>
            </div>
          ) : entries.map((entry, i) => (
            <div
              key={entry.id}
              style={{
                display: 'flex', alignItems: 'center',
                padding: '8px 16px',
                borderBottom: i < entries.length - 1 ? '1px solid #dde4ea' : 'none',
                background: '#fff',
                marginBottom: 1,
              }}
            >
              {/* File icon */}
              <svg width="22" height="26" viewBox="0 0 22 26" fill="none" style={{ flexShrink: 0, marginRight: 10 }}>
                <rect x="1" y="1" width="14" height="20" rx="1" fill="#eef2f8" stroke="#8aaac8" strokeWidth="1.2"/>
                <path d="M11 1v6h4" fill="none" stroke="#8aaac8" strokeWidth="1.2" strokeLinejoin="round"/>
                <rect x="11" y="1" width="4" height="6" rx="0.5" fill="#c8d8e8"/>
                <path d="M4 10h8M4 13h8M4 16h5" stroke="#8aaac8" strokeWidth="0.9" strokeLinecap="round"/>
                <text x="0" y="26" fontSize="9" fill="#1a3a7a" fontFamily="Consolas" fontWeight="bold">PFA</text>
              </svg>

              {/* Info */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 11.5, fontWeight: 700, color: '#1a2838', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {entry.name}
                </div>
                <div style={{ fontSize: 9, color: '#8a9aaa', fontFamily: 'Consolas, monospace', marginTop: 2 }}>
                  {entry.fileName}  ·  {formatModified(entry.modified)}
                </div>
              </div>

              {/* Actions */}
              <div style={{ display: 'flex', gap: 6, marginLeft: 12, flexShrink: 0 }}>
                <button
                  onClick={() => handleLoad(entry)}
                  style={{
                    padding: '3px 12px', fontSize: 10, cursor: 'pointer',
                    background: 'linear-gradient(to bottom, #e8f0fa, #dce6f4)',
                    border: '1px solid #8aaac8', borderRadius: 2,
                    color: '#1a3a7a', fontWeight: 600,
                  }}
                >
                  열기
                </button>
                <button
                  onClick={() => handleRemove(entry.id)}
                  title="목록에서 제거"
                  style={{
                    padding: '3px 7px', fontSize: 10, cursor: 'pointer',
                    background: '#fde8e8', border: '1px solid #e08080',
                    borderRadius: 2, color: '#8a0000',
                  }}
                >
                  ✕
                </button>
              </div>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          padding: '8px 16px 12px',
          borderTop: '1px solid #d0d8e0',
          flexShrink: 0,
        }}>
          <button
            onClick={handleClearAll}
            disabled={entries.length === 0}
            style={{
              padding: '4px 12px', fontSize: 9.5, cursor: entries.length > 0 ? 'pointer' : 'not-allowed',
              background: 'none', border: '1px solid #c0c8d0', borderRadius: 2,
              color: entries.length > 0 ? '#5a6a7a' : '#b0bcc8',
            }}
          >
            모두 지우기
          </button>
          <span style={{ fontSize: 9, color: '#b0bcc8', fontFamily: 'Consolas, monospace' }}>
            최대 {5}개 보관
          </span>
        </div>
      </div>
    </div>
  )
}
