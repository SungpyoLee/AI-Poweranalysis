import { useState, useEffect } from 'react'
import type { LibraryEntry } from '../types'
import { loadLibrary } from '../library'
import type { LibraryType } from '../library'

// ── Preview field definitions per equipment type ──────────────────────────────
interface PreviewField { key: string; label: string; unit: string }

const PREVIEW_FIELDS: Record<LibraryType, PreviewField[]> = {
  transformer: [
    { key: 'sn_mva',           label: 'Rated Power',  unit: 'MVA' },
    { key: 'vn_hv_kv',         label: 'HV Voltage',   unit: 'kV'  },
    { key: 'vn_lv_kv',         label: 'LV Voltage',   unit: 'kV'  },
    { key: 'vk_percent',       label: 'Vk%',          unit: '%'   },
    { key: 'vkr_percent',      label: 'Vkr%',         unit: '%'   },
    { key: 'pfe_kw',           label: 'Iron Loss',    unit: 'kW'  },
    { key: 'i0_percent',       label: 'No-load I%',   unit: '%'   },
    { key: 'tap_min',          label: 'Tap Min',      unit: ''    },
    { key: 'tap_max',          label: 'Tap Max',      unit: ''    },
    { key: 'tap_step_percent', label: 'Tap Step',     unit: '%'   },
  ],
  cable: [
    { key: 'std_type',        label: 'Std Type',     unit: ''        },
    { key: 'r_ohm_per_km',   label: 'R1',           unit: 'Ω/km'    },
    { key: 'x_ohm_per_km',   label: 'X1',           unit: 'Ω/km'    },
    { key: 'c_nf_per_km',    label: 'C1',           unit: 'nF/km'   },
    { key: 'r0_ohm_per_km',  label: 'R0',           unit: 'Ω/km'    },
    { key: 'x0_ohm_per_km',  label: 'X0',           unit: 'Ω/km'    },
    { key: 'max_i_ka',       label: 'Imax',         unit: 'kA'      },
    { key: 'parallel',       label: 'Parallel',     unit: ''        },
  ],
  breaker: [
    { key: 'rated_kv',             label: 'Rated Voltage',  unit: 'kV'  },
    { key: 'rated_kA',             label: 'Rated Current',  unit: 'kA'  },
    { key: 'interrupt_kA',         label: 'Interrupt kA',   unit: 'kA'  },
    { key: 'breaking_capacity_ka', label: 'Breaking Cap.',  unit: 'kA'  },
    { key: 'making_capacity_ka',   label: 'Making Cap.',    unit: 'kA'  },
    { key: 'breaker_type',         label: 'Type',           unit: ''    },
  ],
}

const TITLE: Record<LibraryType, string> = {
  transformer: 'Transformer Library',
  cable:       'Cable Library',
  breaker:     'Breaker Library',
}

// ── Props ─────────────────────────────────────────────────────────────────────
interface Props {
  type:    LibraryType
  onApply: (params: Record<string, unknown>) => void
  onClose: () => void
}

// ── Component ─────────────────────────────────────────────────────────────────
export default function LibraryModal({ type, onApply, onClose }: Props) {
  const entries       = loadLibrary(type)
  const manufacturers = ['All', ...Array.from(new Set(entries.map(e => e.manufacturer)))]

  const [selectedMfr,   setSelectedMfr]   = useState<string>('All')
  const [selectedEntry, setSelectedEntry] = useState<LibraryEntry | null>(null)

  // Escape key to close
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  const filtered = selectedMfr === 'All'
    ? entries
    : entries.filter(e => e.manufacturer === selectedMfr)

  const handleApply = () => {
    if (!selectedEntry) return
    onApply(selectedEntry.params)
  }

  const handleMfrClick = (mfr: string) => {
    setSelectedMfr(mfr)
    setSelectedEntry(null)
  }

  return (
    // ── Backdrop ──────────────────────────────────────────────────────────────
    <div
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
      style={{
        position: 'fixed', inset: 0,
        background: 'rgba(10, 20, 40, 0.40)',
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {/* ── Modal window ─────────────────────────────────────────────────── */}
      <div style={{
        width: 660, height: 420,
        background: '#f4f6f8',
        border: '1px solid #7a8a9a',
        borderRadius: 3,
        display: 'flex',
        flexDirection: 'column',
        boxShadow: '0 12px 40px rgba(0,0,0,0.30)',
        fontFamily: "'Segoe UI', 'Malgun Gothic', Arial, sans-serif",
        overflow: 'hidden',
      }}>

        {/* ── Header ─────────────────────────────────────────────────────── */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '7px 12px',
          background: 'linear-gradient(to bottom, #1e3a7a 0%, #152d60 100%)',
          flexShrink: 0,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
            <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
              <rect x="1" y="2" width="4" height="10" rx="0.5" stroke="#8ab0e8" strokeWidth="1.1"/>
              <rect x="6" y="1" width="4" height="11" rx="0.5" stroke="#8ab0e8" strokeWidth="1.1"/>
              <rect x="11" y="3" width="1" height="9" rx="0.5" stroke="#8ab0e8" strokeWidth="1.1"/>
            </svg>
            <span style={{ fontSize: 11, fontWeight: 700, color: '#e8f0ff', letterSpacing: '0.04em' }}>
              {TITLE[type]}
            </span>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'none', border: '1px solid transparent', borderRadius: 2,
              color: '#8ab0e8', cursor: 'pointer', fontSize: 12, lineHeight: 1,
              padding: '2px 5px',
            }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = '#8ab0e8' }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = 'transparent' }}
          >
            ✕
          </button>
        </div>

        {/* ── Column label row ────────────────────────────────────────────── */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: '148px 190px 1fr',
          background: '#dce4ec',
          borderBottom: '2px solid #b0bcc8',
          flexShrink: 0,
        }}>
          {(['Manufacturer', 'Model', 'Preview'] as const).map(h => (
            <div key={h} style={{
              padding: '3px 10px',
              fontSize: 8, fontWeight: 700, color: '#5a6a7a',
              letterSpacing: '0.1em', textTransform: 'uppercase',
              borderRight: '1px solid #b0bcc8',
            }}>
              {h}
            </div>
          ))}
        </div>

        {/* ── Three-column body ────────────────────────────────────────────── */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: '148px 190px 1fr',
          flex: 1,
          overflow: 'hidden',
        }}>

          {/* ── Manufacturer list ──────────────────────────────────────────── */}
          <div style={{ borderRight: '1px solid #ccd4dc', overflowY: 'auto', padding: '4px 0' }}>
            {manufacturers.map(mfr => {
              const active = selectedMfr === mfr
              return (
                <button
                  key={mfr}
                  onClick={() => handleMfrClick(mfr)}
                  style={{
                    display: 'block', width: '100%',
                    textAlign: 'left',
                    padding: '5px 10px 5px 12px',
                    background: active ? 'rgba(30,58,122,0.09)' : 'transparent',
                    border: 'none',
                    borderLeft: active ? '3px solid #1e3a7a' : '3px solid transparent',
                    fontSize: 9.5,
                    color: active ? '#1e3a7a' : '#3a4a5a',
                    fontWeight: active ? 700 : 400,
                    cursor: 'pointer',
                    fontFamily: "'Segoe UI', Arial, sans-serif",
                    letterSpacing: '0.01em',
                  }}
                  onMouseEnter={e => { if (!active) (e.currentTarget as HTMLElement).style.background = '#edf2f8' }}
                  onMouseLeave={e => { if (!active) (e.currentTarget as HTMLElement).style.background = 'transparent' }}
                >
                  {mfr === 'All' ? '— All —' : mfr}
                </button>
              )
            })}
          </div>

          {/* ── Model list ────────────────────────────────────────────────── */}
          <div style={{ borderRight: '1px solid #ccd4dc', overflowY: 'auto' }}>
            {filtered.length === 0 && (
              <div style={{ padding: '16px 10px', textAlign: 'center', color: '#9aaabb', fontSize: 9 }}>
                — no entries —
              </div>
            )}
            {filtered.map(entry => {
              const isSelected = selectedEntry?.id === entry.id
              return (
                <div
                  key={entry.id}
                  onClick={() => setSelectedEntry(entry)}
                  style={{
                    padding: '7px 10px',
                    cursor: 'pointer',
                    background: isSelected ? '#c8dcf4' : 'transparent',
                    borderLeft: isSelected ? '3px solid #1a60c0' : '3px solid transparent',
                    borderBottom: '1px solid #e4eaf0',
                    userSelect: 'none',
                  }}
                  onMouseEnter={e => { if (!isSelected) (e.currentTarget as HTMLElement).style.background = '#dde8f4' }}
                  onMouseLeave={e => { if (!isSelected) (e.currentTarget as HTMLElement).style.background = 'transparent' }}
                >
                  <div style={{ fontSize: 9.5, fontWeight: 600, color: '#0a1828', lineHeight: 1.4 }}>
                    {entry.model}
                  </div>
                  <div style={{ fontSize: 8, color: '#7a8898', marginTop: 1, fontFamily: 'Consolas, monospace' }}>
                    {entry.manufacturer}
                    {entry.standard && <span style={{ color: '#9aaabb' }}> · {entry.standard}</span>}
                  </div>
                </div>
              )
            })}
          </div>

          {/* ── Preview panel ──────────────────────────────────────────────── */}
          <div style={{ overflowY: 'auto', padding: '10px 12px' }}>
            {!selectedEntry ? (
              <div style={{
                display: 'flex', flexDirection: 'column',
                alignItems: 'center', justifyContent: 'center',
                height: '100%', gap: 8,
                color: '#9aaabb', fontSize: 9,
                fontFamily: "'Segoe UI', sans-serif", textAlign: 'center',
              }}>
                <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
                  <rect x="2" y="4" width="8" height="20" rx="1" stroke="#c0ccd8" strokeWidth="1.2"/>
                  <rect x="12" y="2" width="8" height="24" rx="1" stroke="#c0ccd8" strokeWidth="1.2"/>
                  <rect x="22" y="6" width="4" height="18" rx="1" stroke="#c0ccd8" strokeWidth="1.2"/>
                </svg>
                모델을 선택하면<br/>파라미터가 표시됩니다
              </div>
            ) : (
              <>
                {/* Entry header */}
                <div style={{ marginBottom: 8 }}>
                  <div style={{ fontSize: 10.5, fontWeight: 700, color: '#0a1828', lineHeight: 1.3 }}>
                    {selectedEntry.model}
                  </div>
                  <div style={{ fontSize: 8.5, color: '#3a5a7a', marginTop: 2 }}>
                    {selectedEntry.manufacturer}
                  </div>
                  <div style={{ display: 'flex', gap: 4, marginTop: 4, flexWrap: 'wrap' }}>
                    {selectedEntry.standard && (
                      <span style={{
                        fontSize: 7.5, padding: '1px 5px',
                        background: '#e8f0f8', border: '1px solid #b0c8e0',
                        borderRadius: 2, color: '#1a4a8a',
                        fontFamily: 'Consolas, monospace',
                      }}>
                        {selectedEntry.standard}
                      </span>
                    )}
                    {selectedEntry.version && (
                      <span style={{
                        fontSize: 7.5, padding: '1px 5px',
                        background: '#f0f0f8', border: '1px solid #c0c0d8',
                        borderRadius: 2, color: '#4a4a8a',
                        fontFamily: 'Consolas, monospace',
                      }}>
                        v{selectedEntry.version}
                      </span>
                    )}
                    {selectedEntry.source === 'builtin' && (
                      <span style={{
                        fontSize: 7.5, padding: '1px 5px',
                        background: '#e8f4ec', border: '1px solid #80b090',
                        borderRadius: 2, color: '#005a20',
                      }}>
                        Built-in
                      </span>
                    )}
                  </div>
                </div>

                {/* Parameter table */}
                <div style={{ borderTop: '1px solid #d4dce4' }}>
                  {PREVIEW_FIELDS[type].map(field => {
                    const val = selectedEntry.params[field.key]
                    if (val === undefined || val === null) return null
                    const display = typeof val === 'boolean'
                      ? (val ? 'Yes' : 'No')
                      : String(val)
                    return (
                      <div key={field.key} style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        padding: '2.5px 0',
                        borderBottom: '1px solid #edf1f5',
                        fontSize: 9,
                      }}>
                        <span style={{
                          color: '#5a6a7a',
                          fontFamily: "'Segoe UI', Arial, sans-serif",
                        }}>
                          {field.label}
                        </span>
                        <span style={{
                          fontFamily: 'Consolas, monospace',
                          fontWeight: 600,
                          color: '#1a2838',
                        }}>
                          {display}{field.unit ? <span style={{ color: '#8a9aaa', fontWeight: 400 }}> {field.unit}</span> : ''}
                        </span>
                      </div>
                    )
                  })}
                </div>
              </>
            )}
          </div>
        </div>

        {/* ── Footer ─────────────────────────────────────────────────────── */}
        <div style={{
          display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 8,
          padding: '7px 12px',
          background: '#e8ecf0',
          borderTop: '1px solid #b0bcc8',
          flexShrink: 0,
        }}>
          {selectedEntry && (
            <span style={{ fontSize: 8.5, color: '#5a6a7a', marginRight: 'auto', fontFamily: 'Consolas, monospace' }}>
              선택: {selectedEntry.model}
            </span>
          )}
          <button
            onClick={onClose}
            style={{
              padding: '4px 18px', fontSize: 9.5,
              background: '#e0e6ec', border: '1px solid #9aaabb',
              borderRadius: 2, cursor: 'pointer',
              color: '#3a4a5a',
              fontFamily: "'Segoe UI', sans-serif",
            }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = '#d4dce6' }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = '#e0e6ec' }}
          >
            Cancel
          </button>
          <button
            onClick={handleApply}
            disabled={!selectedEntry}
            style={{
              padding: '4px 22px', fontSize: 9.5, fontWeight: 700,
              background: selectedEntry ? 'linear-gradient(to bottom, #1e3a7a, #152d60)' : '#b0b8c0',
              border: `1px solid ${selectedEntry ? '#152d60' : '#909898'}`,
              borderRadius: 2,
              cursor: selectedEntry ? 'pointer' : 'not-allowed',
              color: '#ffffff',
              fontFamily: "'Segoe UI', sans-serif",
            }}
            onMouseEnter={e => {
              if (selectedEntry)
                (e.currentTarget as HTMLElement).style.background = 'linear-gradient(to bottom, #2a4e9a, #1e3a7a)'
            }}
            onMouseLeave={e => {
              if (selectedEntry)
                (e.currentTarget as HTMLElement).style.background = 'linear-gradient(to bottom, #1e3a7a, #152d60)'
            }}
          >
            Apply
          </button>
        </div>
      </div>
    </div>
  )
}
