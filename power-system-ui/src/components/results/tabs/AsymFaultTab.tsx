import type { Node as RFNode } from 'reactflow'
import type { NodeData, Bus, AsymFaultResults } from '../../../types'

export default function AsymFaultTab({ nodes, asymFault }: {
  nodes:     RFNode<NodeData>[]
  asymFault: AsymFaultResults
}) {
  return (
    <div style={{ flex: 1, overflowY: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 9.5, fontFamily: 'Consolas,monospace' }}>
        <thead>
          <tr style={{ background: '#d4dae2', position: 'sticky', top: 0 }}>
            {['Bus', 'kV', 'Ik3" (kA)', 'Ik1-LG (kA)', 'IkLL (kA)', 'Ik2LG (kA)', 'Z1 (pu)', 'Z0 (pu)', '최악 유형'].map(h => (
              <th key={h} style={{ padding: '4px 8px', textAlign: 'left', fontSize: 9, fontWeight: 700,
                color: '#2a3a4a', textTransform: 'uppercase', letterSpacing: '0.04em', borderBottom: '2px solid #b0bcc8' }}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {nodes.filter(n => n.type === 'bus').map((n, ri) => {
            const r = asymFault.buses[n.id]
            const busEq = n.data.equipment as Bus
            if (!r) return null
            const worstColor = r.worst_type !== '3P' ? '#b02000' : '#005a20'
            return (
              <tr key={n.id} style={{ background: ri % 2 ? '#f0f4f8' : '#fff', borderBottom: '1px solid #e8ecf0' }}>
                <td style={{ padding: '3px 8px', fontWeight: 700 }}>{busEq.name}</td>
                <td style={{ padding: '3px 8px' }}>{busEq.vn_kv}</td>
                <td style={{ padding: '3px 8px', color: '#7a0000', fontWeight: 700 }}>{r.ik3_ka.toFixed(3)}</td>
                <td style={{ padding: '3px 8px', color: '#4a0070' }}>{r.ik1_ka.toFixed(3)}</td>
                <td style={{ padding: '3px 8px', color: '#00507a' }}>{r.ik2_ka.toFixed(3)}</td>
                <td style={{ padding: '3px 8px', color: '#005a2a' }}>{r.ik2g_ka.toFixed(3)}</td>
                <td style={{ padding: '3px 8px', color: '#5a5a5a' }}>{r.z1_pu.toFixed(5)}</td>
                <td style={{ padding: '3px 8px', color: '#5a5a5a' }}>{r.z0_pu.toFixed(5)}</td>
                <td style={{ padding: '3px 8px', fontWeight: 700, color: worstColor }}>
                  {r.worst_type} ({r.worst_ka.toFixed(3)} kA)
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
      <div style={{ padding: '6px 10px', fontSize: 9, color: '#8a9aaa', fontFamily: "'Segoe UI',sans-serif" }}>
        IEC 60909 · 비대칭 고장 | 1LG=1선지락 · LL=선간 · 2LG=2선지락 · Z2≈Z1 가정 · 변압기 DYn11 가정
      </div>
    </div>
  )
}
