import type { EquipmentType } from '../types'
import { PALETTE_ITEMS } from '../types'

// ── Miniature IEC symbols for palette ────────────────────────────────────────
function PaletteSymbol({ type }: { type: EquipmentType }) {
  switch (type) {
    case 'bus':
      return (
        <svg width="40" height="20" viewBox="0 0 40 20">
          <rect x="2" y="7" width="36" height="6" rx="1" fill="#1a1a2e"/>
        </svg>
      )
    case 'transformer':
      return (
        <svg width="40" height="40" viewBox="0 0 40 40">
          <circle cx="20" cy="11" r="9" fill="none" stroke="#0a0a1a" strokeWidth="1.8"/>
          <circle cx="20" cy="29" r="9" fill="none" stroke="#0a0a1a" strokeWidth="1.8"/>
        </svg>
      )
    case 'breaker':
      return (
        <svg width="40" height="40" viewBox="0 0 40 40">
          <line x1="20" y1="2"  x2="20" y2="10" stroke="#0a0a1a" strokeWidth="2" strokeLinecap="round"/>
          <rect x="10" y="10" width="20" height="20" rx="1" fill="#f4f4f8" stroke="#0a0a1a" strokeWidth="1.8"/>
          <line x1="13" y1="13" x2="27" y2="27" stroke="#0a0a1a" strokeWidth="1.4"/>
          <line x1="27" y1="13" x2="13" y2="27" stroke="#0a0a1a" strokeWidth="1.4"/>
          <line x1="20" y1="30" x2="20" y2="38" stroke="#0a0a1a" strokeWidth="2" strokeLinecap="round"/>
        </svg>
      )
    case 'motor':
      return (
        <svg width="40" height="40" viewBox="0 0 40 40">
          <circle cx="20" cy="20" r="17" fill="none" stroke="#0a0a1a" strokeWidth="1.8"/>
          <text x="20" y="26" textAnchor="middle" fill="#0a0a1a" fontSize="14" fontWeight="bold"
            fontFamily="'Segoe UI', Arial, sans-serif">M</text>
        </svg>
      )
    case 'generator':
      return (
        <svg width="40" height="40" viewBox="0 0 40 40">
          <circle cx="20" cy="20" r="17" fill="none" stroke="#0a0a1a" strokeWidth="1.8"/>
          <text x="20" y="20" textAnchor="middle" fill="#0a0a1a" fontSize="11" fontWeight="bold"
            fontFamily="'Segoe UI', Arial, sans-serif">G</text>
          <path d="M8,28 Q11,23 14,28 Q17,33 20,28 Q23,23 26,28 Q29,33 32,28"
            fill="none" stroke="#0a0a1a" strokeWidth="1.4" strokeLinecap="round"/>
        </svg>
      )
    case 'load':
      return (
        <svg width="40" height="40" viewBox="0 0 40 40">
          <line x1="20" y1="2" x2="20" y2="14" stroke="#0a0a1a" strokeWidth="2" strokeLinecap="round"/>
          <polygon points="20,38 8,14 32,14" fill="none" stroke="#0a0a1a" strokeWidth="1.8"
            strokeLinejoin="round"/>
          <line x1="8" y1="38" x2="32" y2="38" stroke="#0a0a1a" strokeWidth="2" strokeLinecap="round"/>
        </svg>
      )
    case 'motorGroup':
      return (
        <svg width="40" height="40" viewBox="0 0 40 40">
          <rect x="2" y="8" width="36" height="24" rx="2" fill="none" stroke="#6b3a00" strokeWidth="1.8"/>
          <circle cx="13" cy="20" r="7" fill="none" stroke="#6b3a00" strokeWidth="1.6"/>
          <circle cx="27" cy="20" r="7" fill="none" stroke="#6b3a00" strokeWidth="1.6"/>
          <text x="13" y="24" textAnchor="middle" fill="#6b3a00" fontSize="10" fontWeight="bold"
            fontFamily="'Segoe UI', Arial, sans-serif">M</text>
          <text x="27" y="24" textAnchor="middle" fill="#6b3a00" fontSize="10" fontWeight="bold"
            fontFamily="'Segoe UI', Arial, sans-serif">M</text>
        </svg>
      )
    case 'transformer3w':
      return (
        <svg width="40" height="48" viewBox="0 0 40 48">
          <circle cx="20" cy="10" r="8" fill="none" stroke="#5a0090" strokeWidth="1.8"/>
          <circle cx="20" cy="24" r="8" fill="none" stroke="#5a0090" strokeWidth="1.8"/>
          <circle cx="20" cy="38" r="8" fill="none" stroke="#5a0090" strokeWidth="1.8"/>
          <text x="20" y="41" textAnchor="middle" fill="#5a0090" fontSize="7" fontWeight="bold"
            fontFamily="'Segoe UI', Arial, sans-serif">✶</text>
        </svg>
      )
    case 'capacitor':
      return (
        <svg width="40" height="44" viewBox="0 0 40 44">
          <line x1="20" y1="2" x2="20" y2="18" stroke="#005a8a" strokeWidth="2" strokeLinecap="round"/>
          <line x1="8" y1="18" x2="32" y2="18" stroke="#005a8a" strokeWidth="2.5" strokeLinecap="round"/>
          <line x1="8" y1="24" x2="32" y2="24" stroke="#005a8a" strokeWidth="2.5" strokeLinecap="round"/>
          <line x1="20" y1="24" x2="20" y2="32" stroke="#005a8a" strokeWidth="2" strokeLinecap="round"/>
          <line x1="12" y1="32" x2="28" y2="32" stroke="#005a8a" strokeWidth="2" strokeLinecap="round"/>
          <line x1="15" y1="36" x2="25" y2="36" stroke="#005a8a" strokeWidth="1.5" strokeLinecap="round"/>
          <line x1="18" y1="40" x2="22" y2="40" stroke="#005a8a" strokeWidth="1" strokeLinecap="round"/>
        </svg>
      )
    case 'reactor':
      return (
        <svg width="40" height="44" viewBox="0 0 40 44">
          <line x1="20" y1="2" x2="20" y2="12" stroke="#5a0030" strokeWidth="2" strokeLinecap="round"/>
          <path d="M12 12 Q20 8 28 12" fill="none" stroke="#5a0030" strokeWidth="2"/>
          <path d="M12 18 Q20 14 28 18" fill="none" stroke="#5a0030" strokeWidth="2"/>
          <path d="M12 24 Q20 20 28 24" fill="none" stroke="#5a0030" strokeWidth="2"/>
          <line x1="20" y1="24" x2="20" y2="32" stroke="#5a0030" strokeWidth="2" strokeLinecap="round"/>
          <line x1="12" y1="32" x2="28" y2="32" stroke="#5a0030" strokeWidth="2" strokeLinecap="round"/>
          <line x1="15" y1="36" x2="25" y2="36" stroke="#5a0030" strokeWidth="1.5" strokeLinecap="round"/>
        </svg>
      )
  }
}

interface Props {
  onDragStart: (e: React.DragEvent, type: EquipmentType) => void
  onCollapse?: () => void
}

export default function EquipmentPalette({ onDragStart, onCollapse }: Props) {
  return (
    <aside style={{
      width: '100%',
      background: '#f0f2f5',
      borderRight: '1px solid #c8d0d8',
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden',
      fontFamily: "'Segoe UI', 'Malgun Gothic', Arial, sans-serif",
      userSelect: 'none',
    }}>
      {/* Panel header */}
      <div style={{
        padding: '8px 8px 8px 12px',
        background: 'linear-gradient(to bottom, #1e3a7a 0%, #152d60 100%)',
        color: '#e8f0ff',
        fontSize: 11,
        fontWeight: 700,
        letterSpacing: '0.06em',
        textTransform: 'uppercase',
        display: 'flex',
        alignItems: 'center',
        gap: 7,
        flexShrink: 0,
      }}>
        <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
          <rect x="1" y="1" width="5" height="5" rx="0.5" stroke="white" strokeWidth="1.2"/>
          <rect x="7" y="1" width="5" height="5" rx="0.5" stroke="white" strokeWidth="1.2"/>
          <rect x="1" y="7" width="5" height="5" rx="0.5" stroke="white" strokeWidth="1.2"/>
          <rect x="7" y="7" width="5" height="5" rx="0.5" stroke="white" strokeWidth="1.2"/>
        </svg>
        <span style={{ flex: 1 }}>Equipment</span>
        {onCollapse && (
          <button
            onClick={onCollapse}
            title="패널 접기"
            style={{
              background: 'none', border: 'none', color: '#a0b8e0',
              cursor: 'pointer', padding: '2px 4px', borderRadius: 2,
              fontSize: 14, lineHeight: 1, display: 'flex', alignItems: 'center',
            }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = '#ffffff' }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = '#a0b8e0' }}
          >
            ‹
          </button>
        )}
      </div>

      {/* Cable note */}
      <div style={{
        padding: '6px 10px',
        fontSize: 9.5,
        color: '#5a6a7a',
        background: '#e8ecf0',
        borderBottom: '1px solid #c8d0d8',
        lineHeight: 1.5,
      }}>
        드래그하여 캔버스에 배치<br/>
        <span style={{ color: '#1a3a7a', fontWeight: 600 }}>Cable</span>은 장비 연결 시 자동 생성
      </div>

      {/* Section label */}
      <div style={{
        padding: '8px 10px 4px',
        fontSize: 9,
        fontWeight: 700,
        letterSpacing: '0.1em',
        textTransform: 'uppercase',
        color: '#8898a8',
      }}>
        IEC Equipment
      </div>

      {/* Equipment items */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '0 6px 8px' }}>
        {PALETTE_ITEMS.map(({ type, label, description }) => (
          <div
            key={type}
            draggable
            onDragStart={(e) => onDragStart(e, type)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              padding: '6px 8px',
              marginBottom: 3,
              background: '#ffffff',
              border: '1px solid #d0d8e0',
              borderRadius: 3,
              cursor: 'grab',
              transition: 'border-color 0.1s, box-shadow 0.1s',
            }}
            onMouseEnter={e => {
              const el = e.currentTarget as HTMLElement
              el.style.borderColor = '#1a3a8a'
              el.style.boxShadow = '0 2px 6px rgba(26,58,138,0.15)'
            }}
            onMouseLeave={e => {
              const el = e.currentTarget as HTMLElement
              el.style.borderColor = '#d0d8e0'
              el.style.boxShadow = 'none'
            }}
          >
            {/* Mini symbol */}
            <div style={{
              width: 44, height: 44,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: '#f8f9fb',
              border: '1px solid #e0e8f0',
              borderRadius: 2,
              flexShrink: 0,
            }}>
              <PaletteSymbol type={type} />
            </div>
            {/* Label */}
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#0a1a2a' }}>{label}</div>
              <div style={{ fontSize: 9.5, color: '#6a7a8a', marginTop: 1 }}>{description}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Footer hint */}
      <div style={{
        padding: '6px 10px',
        fontSize: 9,
        color: '#7a8898',
        background: '#e4e8ec',
        borderTop: '1px solid #c8d0d8',
        lineHeight: 1.5,
      }}>
        연결 규칙: Bus ↔ Cable ↔ 장비<br/>
        Bus ↔ Bus 직접 연결 불가
      </div>
    </aside>
  )
}
