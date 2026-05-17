import { Handle, Position } from 'reactflow'

export default function GeneratorNode({ data }) {
  const { gen } = data
  const c = '#005a20'
  return (
    <div style={{ width: 60, userSelect: 'none', textAlign: 'center' }}>
      <Handle
        type="target" position={Position.Top} id="top"
        style={{ background: c, border: '2px solid #fff', width: 8, height: 8, borderRadius: 1 }}
      />
      {/* IEC generator symbol: circle with G + sinewave */}
      <svg width="60" height="60" viewBox="0 0 60 60">
        <circle cx="30" cy="30" r="26" fill="#f0faf4" stroke={c} strokeWidth="2.2"/>
        <text x="30" y="26" textAnchor="middle" fill={c} fontSize="14" fontWeight="bold"
          fontFamily="'Segoe UI',Arial,sans-serif">G</text>
        <path
          d="M12,38 Q16,30 20,38 Q24,46 28,38 Q32,30 36,38 Q40,46 44,38 Q46,34 48,38"
          fill="none" stroke={c} strokeWidth="1.8" strokeLinecap="round"
        />
      </svg>
      <div style={{ fontSize: 9.5, fontWeight: 700, color: '#004018', fontFamily: "'Segoe UI',Arial,sans-serif", lineHeight: 1.2 }}>
        {gen.name}
      </div>
      <div style={{ fontSize: 9.5, fontFamily: "'Consolas','Courier New',monospace", color: c }}>
        {gen.p_mw} MW
      </div>
    </div>
  )
}
