import { Handle, Position } from 'reactflow'

export default function CBNode({ data }) {
  const { cb } = data
  const closed = cb?.is_closed !== false
  const c = '#1a3a6c'

  const hs = {
    background: c,
    border: '1.5px solid #ffffff',
    width: 6,
    height: 6,
    borderRadius: 1,
  }

  return (
    <div style={{ width: 20, userSelect: 'none', textAlign: 'center' }}>
      <Handle type="target" position={Position.Top}    id="top"    style={hs} />
      <Handle type="source" position={Position.Bottom} id="bottom" style={hs} />
      <Handle type="target" position={Position.Left}   id="left"   style={{ ...hs, opacity: 0 }} />
      <Handle type="source" position={Position.Right}  id="right"  style={{ ...hs, opacity: 0 }} />

      {/* IEC circuit breaker symbol: rectangle with X (closed) or gap (open) */}
      <svg width="20" height="32" viewBox="0 0 20 32">
        {/* Top wire */}
        <line x1="10" y1="0" x2="10" y2="6" stroke={c} strokeWidth="1.8" strokeLinecap="round"/>
        {/* Body box */}
        <rect x="2" y="6" width="16" height="20" rx="1"
          fill={closed ? '#eef2fc' : '#fff6f0'}
          stroke={c} strokeWidth="1.6"/>
        {closed ? (
          /* Closed: X (contacts closed) */
          <>
            <line x1="5"  y1="9"  x2="15" y2="23" stroke={c} strokeWidth="1.3"/>
            <line x1="15" y1="9"  x2="5"  y2="23" stroke={c} strokeWidth="1.3"/>
          </>
        ) : (
          /* Open: gap lines */
          <>
            <line x1="10" y1="8"  x2="10" y2="13" stroke="#c04000" strokeWidth="1.5"/>
            <line x1="10" y1="18" x2="10" y2="23" stroke="#c04000" strokeWidth="1.5"/>
          </>
        )}
        {/* Bottom wire */}
        <line x1="10" y1="26" x2="10" y2="32" stroke={c} strokeWidth="1.8" strokeLinecap="round"/>
      </svg>

      {cb?.name && (
        <div style={{
          fontSize: 7.5,
          color: '#3a5068',
          fontFamily: "'Consolas','Courier New',monospace",
          lineHeight: 1.2,
          marginTop: 1,
          whiteSpace: 'nowrap',
        }}>
          {cb.name}
        </div>
      )}
    </div>
  )
}
