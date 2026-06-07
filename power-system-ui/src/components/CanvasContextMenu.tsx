import { useEffect, useRef } from 'react'

interface MenuItem {
  label:    string
  icon?:    React.ReactNode
  onClick:  () => void
  disabled?: boolean
  danger?:  boolean
}

interface Props {
  x:       number
  y:       number
  items:   MenuItem[]
  onClose: () => void
}

export default function CanvasContextMenu({ x, y, items, onClose }: Props) {
  const ref = useRef<HTMLDivElement>(null)

  // Close on outside click or Escape
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    const handleKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('mousedown', handleClick)
    document.addEventListener('keydown', handleKey)
    return () => {
      document.removeEventListener('mousedown', handleClick)
      document.removeEventListener('keydown', handleKey)
    }
  }, [onClose])

  return (
    <div
      ref={ref}
      style={{
        position: 'fixed', left: x, top: y,
        zIndex: 9500,
        background: '#f4f6f8',
        border: '1px solid #8a9aaa',
        borderRadius: 3,
        boxShadow: '0 4px 16px rgba(0,0,0,0.22)',
        minWidth: 200,
        fontFamily: "'Segoe UI', 'Malgun Gothic', Arial, sans-serif",
        overflow: 'hidden',
        padding: '3px 0',
      }}
    >
      {items.map((item, i) => (
        item.label === '---'
          ? <div key={i} style={{ height: 1, background: '#d0d8e0', margin: '3px 0' }} />
          : (
            <button
              key={i}
              disabled={item.disabled}
              onClick={() => { item.onClick(); onClose() }}
              style={{
                display: 'flex', alignItems: 'center', gap: 8,
                width: '100%', padding: '6px 14px',
                background: 'none', border: 'none', textAlign: 'left',
                cursor: item.disabled ? 'not-allowed' : 'pointer',
                fontSize: 11,
                color: item.disabled
                  ? '#a0b0c0'
                  : item.danger ? '#8a0000' : '#1a2838',
                fontFamily: "'Segoe UI', 'Malgun Gothic', Arial, sans-serif",
                opacity: item.disabled ? 0.5 : 1,
              }}
              onMouseEnter={e => {
                if (!item.disabled)
                  (e.currentTarget as HTMLButtonElement).style.background =
                    item.danger ? '#fce8e8' : 'rgba(26,58,138,0.07)'
              }}
              onMouseLeave={e => {
                (e.currentTarget as HTMLButtonElement).style.background = 'none'
              }}
            >
              {item.icon && <span style={{ width: 16, flexShrink: 0 }}>{item.icon}</span>}
              {item.label}
            </button>
          )
      ))}
    </div>
  )
}
