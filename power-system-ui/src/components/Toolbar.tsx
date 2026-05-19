interface Props {
  onLoadExample: () => void
  onClear: () => void
  onAutoLayout: () => void
  onRunLoadflow: () => void
  onRunShortcircuit: () => void
  loading: boolean
  loadingLabel: string
  converged: boolean | null
  nodeCount: number
  edgeCount: number
}

function RibbonBtn({
  icon, label, onClick, disabled = false, color,
}: {
  icon: React.ReactNode
  label: string
  onClick: () => void
  disabled?: boolean
  color?: string
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 3,
        padding: '4px 10px',
        background: 'transparent',
        border: '1px solid transparent',
        borderRadius: 2,
        cursor: disabled ? 'not-allowed' : 'pointer',
        fontSize: 9.5,
        color: disabled ? '#9aa8b8' : (color ?? '#1a2030'),
        fontFamily: "'Segoe UI', 'Malgun Gothic', Arial, sans-serif",
        minWidth: 48,
        opacity: disabled ? 0.5 : 1,
        transition: 'background 0.1s, border-color 0.1s',
      }}
      onMouseEnter={e => {
        if (!disabled) {
          const el = e.currentTarget
          el.style.background = 'rgba(255,255,255,0.7)'
          el.style.borderColor = '#8aaabb'
        }
      }}
      onMouseLeave={e => {
        const el = e.currentTarget
        el.style.background = 'transparent'
        el.style.borderColor = 'transparent'
      }}
    >
      {icon}
      <span style={{ whiteSpace: 'nowrap' }}>{label}</span>
    </button>
  )
}

function RibbonGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', padding: '0 4px' }}>
      <div style={{ display: 'flex', gap: 1, alignItems: 'flex-start', flex: 1, paddingBottom: 3 }}>
        {children}
      </div>
      <div style={{
        fontSize: 8,
        color: '#6a7a8a',
        textAlign: 'center',
        letterSpacing: '0.1em',
        textTransform: 'uppercase',
        borderTop: '1px solid #b0bcc8',
        padding: '2px 8px 3px',
      }}>
        {label}
      </div>
    </div>
  )
}

export default function Toolbar({
  onLoadExample, onClear, onAutoLayout,
  onRunLoadflow, onRunShortcircuit,
  loading, loadingLabel, converged, nodeCount, edgeCount,
}: Props) {
  return (
    <header style={{
      display: 'flex',
      alignItems: 'stretch',
      background: 'linear-gradient(to bottom, #e4e8ed 0%, #d8dde4 100%)',
      borderBottom: '2px solid #8a9aaa',
      flexShrink: 0,
      minHeight: 64,
      fontFamily: "'Segoe UI', 'Malgun Gothic', Arial, sans-serif",
    }}>
      {/* Logo */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 9,
        padding: '0 16px 0 12px',
        borderRight: '1px solid #a8b4c0',
        background: 'linear-gradient(to bottom, #1e3a7a 0%, #152d60 100%)',
        minWidth: 160,
      }}>
        <svg width="22" height="22" viewBox="0 0 22 22">
          <circle cx="11" cy="11" r="10" fill="none" stroke="#60a0e8" strokeWidth="1.5"/>
          <path d="M4,11 h14 M11,4 v14" stroke="#60a0e8" strokeWidth="1.5"/>
          <circle cx="11" cy="11" r="3.5" fill="#60a0e8"/>
        </svg>
        <div>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#ffffff', letterSpacing: '0.04em' }}>
            PowerFlow
          </div>
          <div style={{ fontSize: 8.5, color: '#8ab0e8', letterSpacing: '0.06em' }}>
            ANALYZER
          </div>
        </div>
      </div>

      {/* Ribbon groups */}
      <div style={{ display: 'flex', alignItems: 'stretch', padding: '4px 4px 0' }}>

        <RibbonGroup label="파 일">
          <RibbonBtn
            onClick={onLoadExample}
            label="예제 로드"
            icon={
              <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
                <rect x="3" y="2" width="9" height="13" rx="1" stroke="currentColor" strokeWidth="1.4"/>
                <rect x="7" y="5" width="10" height="14" rx="1" fill="white" stroke="currentColor" strokeWidth="1.4"/>
                <path d="M10 9h5M10 11.5h5M10 14h3" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round"/>
              </svg>
            }
          />
          <RibbonBtn
            onClick={onClear}
            label="초기화"
            icon={
              <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
                <rect x="3" y="3" width="16" height="16" rx="1.5" stroke="currentColor" strokeWidth="1.4"/>
                <path d="M7 7l8 8M15 7L7 15" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
              </svg>
            }
          />
        </RibbonGroup>

        <div style={{ width: 1, background: '#a8b4c0', margin: '6px 3px 10px' }} />

        <RibbonGroup label="레 이 아 웃">
          <RibbonBtn
            onClick={onAutoLayout}
            label="Auto Layout"
            color="#003a5a"
            icon={
              <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
                <rect x="2" y="2" width="7" height="4" rx="1" stroke="currentColor" strokeWidth="1.3"/>
                <rect x="7" y="9" width="7" height="4" rx="1" stroke="currentColor" strokeWidth="1.3"/>
                <rect x="2" y="16" width="7" height="4" rx="1" stroke="currentColor" strokeWidth="1.3"/>
                <rect x="13" y="16" width="7" height="4" rx="1" stroke="currentColor" strokeWidth="1.3"/>
                <path d="M5.5 6v3M10.5 6v3M10.5 13v3M16.5 13v3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
              </svg>
            }
          />
        </RibbonGroup>

        <div style={{ width: 1, background: '#a8b4c0', margin: '6px 3px 10px' }} />

        <RibbonGroup label="해 석 계 산">
          <RibbonBtn
            onClick={onRunLoadflow}
            disabled={loading || nodeCount === 0}
            label={loading && loadingLabel === 'Load Flow' ? '계산 중…' : 'Load Flow'}
            color="#003d14"
            icon={
              <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
                <circle cx="11" cy="11" r="9" stroke="currentColor" strokeWidth="1.4"/>
                <path d="M9 7.5l7 3.5-7 3.5V7.5z" fill="currentColor"/>
              </svg>
            }
          />
          <RibbonBtn
            onClick={onRunShortcircuit}
            disabled={loading || nodeCount === 0}
            label={loading && loadingLabel === 'Short-Circuit' ? '계산 중…' : 'Short-Circuit'}
            color="#4a0050"
            icon={
              <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
                <path d="M12 2L3 13h8l-1 7 9-11h-8l1-7z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
              </svg>
            }
          />
        </RibbonGroup>

        <div style={{ width: 1, background: '#a8b4c0', margin: '6px 3px 10px' }} />

        <RibbonGroup label="도 움 말">
          <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 3, padding: '2px 8px', fontSize: 9.5, color: '#5a6a7a', lineHeight: 1.6 }}>
            <span>① Palette에서 드래그 → 캔버스 배치</span>
            <span>② 장비 핸들 클릭 → Cable 연결</span>
            <span>③ 장비 클릭 → Properties 편집</span>
          </div>
        </RibbonGroup>
      </div>

      {/* Right side: status */}
      <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 12, padding: '0 16px' }}>
        {loading && (
          <span style={{ fontSize: 10, color: '#7a5000', fontFamily: 'Consolas, monospace' }}>
            ◌ {loadingLabel}…
          </span>
        )}
        {!loading && converged !== null && (
          <span style={{
            padding: '2px 10px',
            fontSize: 10, fontWeight: 700, borderRadius: 2, border: '1px solid',
            background: converged ? '#e8f4ee' : '#fce8e8',
            borderColor: converged ? '#80c0a0' : '#e08080',
            color: converged ? '#006030' : '#8a0000',
          }}>
            LF {converged ? '수렴 ✓' : '미수렴 ✗'}
          </span>
        )}
        <div style={{ fontSize: 9.5, color: '#7a8898', fontFamily: 'Consolas, monospace', textAlign: 'right', lineHeight: 1.6 }}>
          <div>Nodes: {nodeCount}</div>
          <div>Cables: {edgeCount}</div>
        </div>
      </div>
    </header>
  )
}
