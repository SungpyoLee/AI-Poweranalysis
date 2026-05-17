import { Handle, Position } from 'reactflow'

export default function ExternalGridNode({ data }) {
  const { eg } = data
  const c = '#1a3a8a'
  return (
    <div style={{ width: 60, userSelect: 'none', textAlign: 'center' }}>
      <Handle
        type="source" position={Position.Bottom} id="bottom"
        style={{ background: c, border: '2px solid #fff', width: 8, height: 8, borderRadius: 1 }}
      />
      {/* IEC utility / external grid symbol:
          Square with diagonal cross (grid) + AC sinewave inside */}
      <svg width="60" height="56" viewBox="0 0 60 56">
        {/* Outer square */}
        <rect x="2" y="2" width="56" height="52" rx="2"
          fill="#f0f4fc" stroke={c} strokeWidth="2"/>
        {/* Diagonal cross lines */}
        <line x1="2"  y1="2"  x2="58" y2="54" stroke={c} strokeWidth="1.4" opacity="0.6"/>
        <line x1="58" y1="2"  x2="2"  y2="54" stroke={c} strokeWidth="1.4" opacity="0.6"/>
        {/* AC sinewave */}
        <path
          d="M12,28 Q16,18 20,28 Q24,38 28,28 Q32,18 36,28 Q40,38 44,28 Q46,23 48,28"
          fill="none" stroke={c} strokeWidth="2" strokeLinecap="round"
        />
      </svg>
      <div style={{
        fontSize: 9.5, fontWeight: 700, color: c,
        fontFamily: "'Segoe UI',Arial,sans-serif",
        lineHeight: 1.3, marginTop: 2,
        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
        maxWidth: 60,
      }}>
        {eg.name}
      </div>
    </div>
  )
}
