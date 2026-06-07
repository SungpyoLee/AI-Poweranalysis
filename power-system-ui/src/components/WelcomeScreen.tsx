import { getRecentProjects, parsePFA, formatModified } from '../utils/projectIO'
import type { RecentEntry, PFAFile } from '../utils/projectIO'

interface Props {
  onNew:         () => void
  onOpen:        () => void
  onLoadExample: () => void
  onLoadRecent:  (pfa: PFAFile, fileName: string) => void
  onDismiss:     () => void
}

export default function WelcomeScreen({ onNew, onOpen, onLoadExample, onLoadRecent, onDismiss }: Props) {
  const recent = getRecentProjects()

  function handleRecent(entry: RecentEntry) {
    try {
      const pfa = parsePFA(entry.data)
      onLoadRecent(pfa, entry.fileName)
    } catch {
      // corrupt entry — ignore
    }
  }

  const FONT = "'Segoe UI', 'Malgun Gothic', Arial, sans-serif"

  const actions = [
    {
      label: '새 프로젝트',
      desc:  '빈 프로젝트 생성',
      onClick: onNew,
      bg: 'linear-gradient(135deg, #1e3a7a, #152d60)',
      icon: (
        <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
          <rect x="4" y="3" width="11" height="15" rx="1" stroke="white" strokeWidth="1.4"/>
          <path d="M11 3v5h5" stroke="white" strokeWidth="1.2" strokeLinejoin="round"/>
          <rect x="11" y="3" width="5" height="5" rx="0.5" fill="rgba(255,255,255,0.2)"/>
          <path d="M13 11.5h4M15 9.5v4" stroke="white" strokeWidth="1.3" strokeLinecap="round"/>
        </svg>
      ),
    },
    {
      label: '파일 열기',
      desc:  '.pfa 프로젝트 불러오기',
      onClick: onOpen,
      bg: 'linear-gradient(135deg, #1a4a2a, #0e3018)',
      icon: (
        <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
          <path d="M3 7h5l2 2h9v10H3V7z" stroke="white" strokeWidth="1.4" strokeLinejoin="round"/>
          <path d="M3 7V4h5" stroke="white" strokeWidth="1.2" strokeLinejoin="round"/>
        </svg>
      ),
    },
    {
      label: '예제 로드',
      desc:  '22.9kV 샘플 계통',
      onClick: onLoadExample,
      bg: 'linear-gradient(135deg, #6b3a00, #4a2800)',
      icon: (
        <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
          <circle cx="11" cy="11" r="9" stroke="white" strokeWidth="1.4"/>
          <path d="M9 7.5l7 3.5-7 3.5V7.5z" fill="white"/>
        </svg>
      ),
    },
  ]

  return (
    <div style={{
      position: 'absolute', inset: 0,
      background: 'rgba(8, 16, 36, 0.82)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 50,
      fontFamily: FONT,
    }}>
      <div style={{
        background: '#f0f3f7',
        border: '1px solid #7a8a9a',
        borderRadius: 6,
        boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
        width: 700, maxWidth: 'calc(100vw - 48px)',
        overflow: 'hidden',
        display: 'flex', flexDirection: 'column',
      }}>

        {/* ── Header ─────────────────────────────────────────────── */}
        <div style={{
          background: 'linear-gradient(135deg, #1e3a7a 0%, #152d60 55%, #0a1a3a 100%)',
          padding: '22px 28px',
          display: 'flex', alignItems: 'center', gap: 16,
          flexShrink: 0,
        }}>
          <div style={{
            width: 44, height: 44, borderRadius: 8,
            background: 'rgba(255,255,255,0.1)',
            border: '1px solid rgba(255,255,255,0.2)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexShrink: 0,
          }}>
            <svg width="24" height="24" viewBox="0 0 24 24">
              <circle cx="12" cy="12" r="10" fill="none" stroke="#60a0e8" strokeWidth="1.5"/>
              <path d="M4,12 h16 M12,4 v16" stroke="#60a0e8" strokeWidth="1.5"/>
              <circle cx="12" cy="12" r="3.5" fill="#60a0e8"/>
            </svg>
          </div>
          <div>
            <div style={{ fontSize: 18, fontWeight: 700, color: '#ffffff', letterSpacing: '0.02em' }}>
              PowerFlow Analyzer
            </div>
            <div style={{ fontSize: 10.5, color: '#7aaae8', marginTop: 2, letterSpacing: '0.04em' }}>
              Industrial Power System Analysis · IEC 60909
            </div>
          </div>
        </div>

        {/* ── Body ───────────────────────────────────────────────── */}
        <div style={{ display: 'flex', minHeight: 0 }}>

          {/* Left — Actions */}
          <div style={{
            flex: 1, padding: '22px 20px 16px',
            borderRight: '1px solid #d0d8e4',
          }}>
            <div style={{
              fontSize: 9, fontWeight: 700, letterSpacing: '0.12em',
              textTransform: 'uppercase', color: '#8a9aaa', marginBottom: 12,
            }}>
              시작하기
            </div>

            {actions.map(({ label, desc, onClick, bg, icon }) => (
              <button
                key={label}
                onClick={onClick}
                style={{
                  width: '100%', display: 'flex', alignItems: 'center', gap: 12,
                  padding: '10px 12px', marginBottom: 8,
                  background: '#ffffff',
                  border: '1px solid #d0d8e4',
                  borderRadius: 4, cursor: 'pointer', textAlign: 'left',
                  fontFamily: FONT,
                  transition: 'none',
                }}
                onMouseEnter={e => {
                  const el = e.currentTarget
                  el.style.borderColor = '#1a3a7a'
                  el.style.boxShadow = '0 2px 8px rgba(26,58,122,0.15)'
                }}
                onMouseLeave={e => {
                  const el = e.currentTarget
                  el.style.borderColor = '#d0d8e4'
                  el.style.boxShadow = 'none'
                }}
              >
                <div style={{
                  width: 38, height: 38, borderRadius: 4, background: bg,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  flexShrink: 0,
                }}>
                  {icon}
                </div>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: '#0a1a2a' }}>{label}</div>
                  <div style={{ fontSize: 9.5, color: '#6a7a8a', marginTop: 1 }}>{desc}</div>
                </div>
                <div style={{ marginLeft: 'auto', color: '#c0ccd8', fontSize: 16 }}>›</div>
              </button>
            ))}

            {/* Feature chips */}
            <div style={{ marginTop: 14, display: 'flex', flexWrap: 'wrap', gap: 5 }}>
              {['Load Flow', 'Short-Circuit', 'Arc Flash', 'Harmonics', 'Cable Sizing', 'N-1 Contingency', 'Protection'].map(f => (
                <span key={f} style={{
                  padding: '2px 8px',
                  background: '#e8ecf4', border: '1px solid #c8d4e0',
                  borderRadius: 2, fontSize: 9, color: '#4a5a7a',
                  fontWeight: 600, letterSpacing: '0.04em',
                }}>
                  {f}
                </span>
              ))}
            </div>
          </div>

          {/* Right — Recent Files */}
          <div style={{ width: 230, padding: '22px 18px 16px', flexShrink: 0 }}>
            <div style={{
              fontSize: 9, fontWeight: 700, letterSpacing: '0.12em',
              textTransform: 'uppercase', color: '#8a9aaa', marginBottom: 12,
            }}>
              최근 파일
            </div>

            {recent.length === 0 ? (
              <div style={{
                padding: '20px 0', textAlign: 'center',
                color: '#b0bcc8', fontSize: 10.5, lineHeight: 1.7,
              }}>
                최근 파일 없음<br/>
                <span style={{ fontSize: 9, color: '#c8d4e0' }}>
                  저장한 프로젝트가 여기에 표시됩니다
                </span>
              </div>
            ) : (
              <div>
                {recent.map((entry, i) => (
                  <button
                    key={entry.id}
                    onClick={() => handleRecent(entry)}
                    style={{
                      width: '100%', display: 'flex', flexDirection: 'column',
                      padding: '8px 10px',
                      background: '#ffffff',
                      border: '1px solid #d8e0e8',
                      borderRadius: 3, cursor: 'pointer', textAlign: 'left',
                      fontFamily: FONT,
                      marginBottom: i < recent.length - 1 ? 6 : 0,
                    }}
                    onMouseEnter={e => {
                      e.currentTarget.style.borderColor = '#1a3a7a'
                      e.currentTarget.style.background = '#f4f8ff'
                    }}
                    onMouseLeave={e => {
                      e.currentTarget.style.borderColor = '#d8e0e8'
                      e.currentTarget.style.background = '#ffffff'
                    }}
                  >
                    <div style={{
                      display: 'flex', alignItems: 'center', gap: 7, marginBottom: 2,
                    }}>
                      <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
                        <rect x="1" y="1" width="7" height="9" rx="0.8" stroke="#6080b0" strokeWidth="1"/>
                        <path d="M6 1v3h3" stroke="#6080b0" strokeWidth="0.8"/>
                      </svg>
                      <span style={{
                        fontSize: 11, fontWeight: 700, color: '#0a1a2a',
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                        maxWidth: 150,
                      }}>
                        {entry.name}
                      </span>
                    </div>
                    <div style={{
                      fontSize: 8.5, color: '#8a9aaa',
                      fontFamily: 'Consolas, monospace',
                    }}>
                      {formatModified(entry.modified)}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* ── Footer ─────────────────────────────────────────────── */}
        <div style={{
          padding: '10px 20px 12px',
          borderTop: '1px solid #d0d8e4',
          background: '#eaecf0',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          flexShrink: 0,
        }}>
          <div style={{ fontSize: 9.5, color: '#8a9aaa' }}>
            PowerFlow Analyzer · pandapower · IEC 60909
          </div>
          <button
            onClick={onDismiss}
            style={{
              padding: '4px 14px', fontSize: 10.5, cursor: 'pointer',
              background: 'none', border: '1px solid #b0bcc8',
              borderRadius: 2, color: '#4a5a6a', fontFamily: FONT,
            }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = '#6080a0' }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = '#b0bcc8' }}
          >
            빈 캔버스로 시작
          </button>
        </div>
      </div>
    </div>
  )
}
