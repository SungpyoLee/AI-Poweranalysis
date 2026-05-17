import { Handle, Position } from 'reactflow'

export default function LoadNode({ data }) {
  const { load } = data
  const c = '#7a3000'
  return (
    <div style={{ width: 54, userSelect: 'none', textAlign: 'center' }}>
      <Handle
        type="target" position={Position.Top} id="top"
        style={{ background: c, border: '2px solid #fff', width: 8, height: 8, borderRadius: 1 }}
      />
      {/* IEC load symbol: downward-pointing open triangle + ground bar */}
      <svg width="54" height="46" viewBox="0 0 54 46">
        <polygon points="4,4 50,4 27,42"
          fill="#fff8f2" stroke={c} strokeWidth="2.2" strokeLinejoin="round"/>
        <line x1="15" y1="42" x2="39" y2="42" stroke={c} strokeWidth="2.2" strokeLinecap="round"/>
      </svg>
      <div style={{ fontSize: 9.5, fontWeight: 700, color: '#5a2000', fontFamily: "'Segoe UI',Arial,sans-serif", lineHeight: 1.2 }}>
        {load.name}
      </div>
      <div style={{ fontSize: 9.5, fontFamily: "'Consolas','Courier New',monospace", color: c }}>
        {load.p_mw} MW
      </div>
      {load.q_mvar !== 0 && (
        <div style={{ fontSize: 9, fontFamily: "'Consolas','Courier New',monospace", color: '#a05030' }}>
          {load.q_mvar} MVAr
        </div>
      )}
    </div>
  )
}
