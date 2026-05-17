import { Handle, Position } from 'reactflow'

export default function TransformerNode({ data }) {
  const { trafo, result } = data
  const loading = result?.loading_percent
  const color =
    loading === undefined || loading === null ? '#5a1090'
    : loading > 90 ? '#900000'
    : loading > 70 ? '#7a5000'
    : '#5a1090'

  const hs = {
    background: color,
    border: '2px solid #fff',
    width: 8,
    height: 8,
    borderRadius: 1,
  }

  return (
    <div style={{ width: 60, userSelect: 'none', textAlign: 'center' }}>
      <Handle type="target" position={Position.Top}    id="top"    style={hs} />
      <Handle type="source" position={Position.Bottom} id="bottom" style={hs} />

      {/* IEC 2-winding transformer: two tangent circles on white canvas */}
      <svg width="60" height="80" viewBox="0 0 60 80">
        {/* Top winding circle (HV) */}
        <circle cx="30" cy="21" r="18" fill="#f8f4ff" stroke={color} strokeWidth="2.2"/>
        {/* Bottom winding circle (LV) */}
        <circle cx="30" cy="59" r="18" fill="#f8f4ff" stroke={color} strokeWidth="2.2"/>
        {/* Horizontal dividing line */}
        <line x1="8" y1="40" x2="52" y2="40" stroke={color} strokeWidth="0.8" strokeDasharray="3 3" opacity="0.5"/>
      </svg>

      {/* Labels */}
      <div style={{ fontSize: 9.5, color: '#3a1060', fontFamily: "'Consolas','Courier New',monospace" }}>
        {trafo.sn_mva} MVA
      </div>
      <div style={{ fontSize: 9, color, fontFamily: "'Consolas','Courier New',monospace" }}>
        {trafo.vn_hv_kv}/{trafo.vn_lv_kv} kV
      </div>
      {loading !== undefined && loading !== null && (
        <div style={{ fontSize: 10, fontWeight: 700, fontFamily: "'Consolas','Courier New',monospace", color, marginTop: 1 }}>
          {loading.toFixed(1)}%
        </div>
      )}
    </div>
  )
}
