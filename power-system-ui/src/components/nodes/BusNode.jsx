import { Handle, Position } from 'reactflow'

export default function BusNode({ data }) {
  const { bus, result, sc, cycles } = data

  const vm = result?.vm_pu
  const busColor =
    vm === undefined ? '#1a3a8a'
    : vm < 0.95       ? '#b00000'
    : vm > 1.05       ? '#8a5500'
    : '#006428'

  const hs = {
    background: busColor,
    border: '2px solid #ffffff',
    width: 8,
    height: 8,
    borderRadius: 1,
    boxShadow: '0 0 0 1px ' + busColor,
  }

  const hasSc     = sc     != null
  const hasCycles = cycles != null
  const ikss_ka   = hasCycles ? cycles.ikss_ka : sc?.ikss_ka
  const sk_mva    = hasCycles ? cycles.sk_mva  : sc?.sk_mva

  return (
    <div style={{ width: 260, userSelect: 'none', fontFamily: "'Segoe UI','Malgun Gothic',Arial,sans-serif" }}>
      <Handle type="target" position={Position.Top}    id="top"      style={hs} />
      <Handle type="source" position={Position.Bottom} id="bottom"   style={hs} />
      <Handle type="target" position={Position.Bottom} id="bottom-t" style={{ ...hs, opacity: 0 }} />
      <Handle type="source" position={Position.Left}   id="left"     style={hs} />
      <Handle type="target" position={Position.Left}   id="left-t"   style={{ ...hs, opacity: 0 }} />
      <Handle type="source" position={Position.Right}  id="right"    style={hs} />
      <Handle type="target" position={Position.Right}  id="right-t"  style={{ ...hs, opacity: 0 }} />

      {/* Name + kV label — compact row above busbar */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'baseline',
        paddingLeft: 3,
        paddingRight: 3,
        marginBottom: 3,
      }}>
        <span style={{
          fontSize: 10, fontWeight: 700, color: '#0e1e30',
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
          maxWidth: 190,
        }}>
          {bus.name}
        </span>
        <span style={{
          fontSize: 9.5, color: busColor,
          fontFamily: "'Consolas','Courier New',monospace",
          fontWeight: 600, marginLeft: 6, whiteSpace: 'nowrap',
        }}>
          {bus.vn_kv} kV
        </span>
      </div>

      {/* ── BUSBAR LINE (dominant visual element) ───────────────────── */}
      <div style={{
        height: 9,
        background: busColor,
        borderRadius: 0,
      }} />

      {/* Load-flow results — right below busbar */}
      {result && (
        <div style={{
          paddingTop: 3, paddingLeft: 3,
          display: 'flex', gap: 10,
          fontSize: 9.5,
          fontFamily: "'Consolas','Courier New',monospace",
        }}>
          <span style={{ color: busColor, fontWeight: 700 }}>{result.vm_pu.toFixed(4)} pu</span>
          <span style={{ color: '#4a6080' }}>
            {result.va_degree >= 0 ? '+' : ''}{result.va_degree.toFixed(2)}°
          </span>
        </div>
      )}

      {/* Short-circuit data */}
      {(hasSc || hasCycles) && (
        <div style={{ paddingTop: 2, paddingLeft: 3, borderTop: result ? '1px dashed #d0d8e8' : 'none', marginTop: result ? 3 : 0 }}>
          <div style={{
            display: 'flex', gap: 8,
            fontSize: 9.5, fontFamily: "'Consolas','Courier New',monospace",
          }}>
            <span style={{ color: '#900000', fontWeight: 700 }}>Ik&#x2033;&nbsp;{ikss_ka.toFixed(3)} kA</span>
            <span style={{ color: '#5a2020' }}>Sk&nbsp;{sk_mva.toFixed(1)} MVA</span>
          </div>
          {hasCycles && (
            <div style={{
              display: 'flex', gap: 6, marginTop: 1,
              fontSize: 8.5, fontFamily: "'Consolas','Courier New',monospace",
            }}>
              <span style={{ color: '#900000' }}>½cy&nbsp;{cycles.i_half_cycle_ka.toFixed(3)}</span>
              <span style={{ color: '#7a4000' }}>3cy&nbsp;{cycles.i_3cycle_ka.toFixed(3)}</span>
              <span style={{ color: '#585000' }}>5cy&nbsp;{cycles.i_5cycle_ka.toFixed(3)}</span>
              <span style={{ color: '#3a5068' }}>X/R&nbsp;{cycles.xr_ratio.toFixed(1)}</span>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
