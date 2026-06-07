import { useToastStore } from '../store/useToastStore'

const BG: Record<string, string> = {
  error:   '#fde8e8',
  warn:    '#fff8e0',
  success: '#e8f8ee',
  info:    '#e8f0ff',
}
const BORDER: Record<string, string> = {
  error:   '#e08080',
  warn:    '#d0a800',
  success: '#80c0a0',
  info:    '#7aaae8',
}
const COLOR: Record<string, string> = {
  error:   '#8a0000',
  warn:    '#6a4800',
  success: '#005a20',
  info:    '#1a3a7a',
}
const ICON: Record<string, string> = {
  error: '✕', warn: '⚠', success: '✓', info: 'ℹ',
}

export default function ToastContainer() {
  const { toasts, dismiss } = useToastStore()
  if (toasts.length === 0) return null

  return (
    <div style={{
      position: 'fixed', bottom: 32, left: '50%',
      transform: 'translateX(-50%)',
      zIndex: 99999,
      display: 'flex', flexDirection: 'column', gap: 6,
      alignItems: 'center',
      pointerEvents: 'none',
    }}>
      {toasts.map(t => (
        <div
          key={t.id}
          style={{
            pointerEvents: 'all',
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '7px 14px',
            background: BG[t.type],
            border: `1px solid ${BORDER[t.type]}`,
            borderRadius: 4,
            boxShadow: '0 3px 12px rgba(0,0,0,0.18)',
            fontSize: 11,
            fontFamily: "'Segoe UI', 'Malgun Gothic', Arial, sans-serif",
            color: COLOR[t.type],
            fontWeight: 600,
            minWidth: 200,
            maxWidth: 420,
            animation: 'pfa-toast-in 0.18s ease',
          }}
        >
          <span style={{
            width: 18, height: 18, borderRadius: '50%',
            background: BORDER[t.type], color: '#fff',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 10, fontWeight: 700, flexShrink: 0,
          }}>
            {ICON[t.type]}
          </span>
          <span style={{ flex: 1 }}>{t.message}</span>
          <button
            onClick={() => dismiss(t.id)}
            style={{
              background: 'none', border: 'none', color: COLOR[t.type],
              cursor: 'pointer', fontSize: 14, lineHeight: 1, opacity: 0.7,
              padding: '0 2px', flexShrink: 0,
            }}
          >✕</button>
        </div>
      ))}
      <style>{`
        @keyframes pfa-toast-in {
          from { opacity: 0; transform: translateY(8px) scale(0.97); }
          to   { opacity: 1; transform: translateY(0)  scale(1); }
        }
      `}</style>
    </div>
  )
}
