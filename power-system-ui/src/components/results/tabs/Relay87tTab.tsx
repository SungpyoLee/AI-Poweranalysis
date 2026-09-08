import type { DifferentialRelayResult } from '../../../types'
import { DataTable, RELAY_87T_COLS, type RowData } from '../shared'

export default function Relay87tTab({
  relay87tResults, selectedNodeId, onRowClick,
}: {
  relay87tResults: DifferentialRelayResult[]
  selectedNodeId:  string | null
  onRowClick:      (id: string) => void
}) {
  const rows: RowData[] = relay87tResults.map(r => ({
    id: r.breakerId,
    breakerName:        r.breakerName,
    transformerName:    r.transformerName,
    rated_current_hv_a: r.rated_current_hv_a,
    rated_current_lv_a: r.rated_current_lv_a,
    diff_current_pct:   r.diff_current_pct,
    restrain_current_a: r.restrain_current_a,
    inrush_label:       r.inrush_blocked ? '차단' : '정상',
    status:             r.trips ? 'TRIP!' : (r.pass ? 'PASS' : 'CHECK'),
  }))

  return (
    <div style={{ flex: 1, overflow: 'auto' }}>
      <DataTable
        title="87T 차동계전기 — IEC 60255-151 / IEEE C37.91"
        cols={RELAY_87T_COLS}
        rows={rows}
        selectedId={selectedNodeId}
        onRowClick={onRowClick}
        cellStyle={(col, row) => {
          if (col === 'status') {
            const s = row.status as string
            if (s === 'TRIP!') return { color: '#8a0000', fontWeight: 700, background: '#fde8e8' }
            if (s === 'PASS')  return { color: '#005a20', fontWeight: 700, background: '#e6f4ec' }
            return { color: '#7a5a00', fontWeight: 700, background: '#fff5dc' }
          }
        }}
      />
      <div style={{ padding: '6px 12px', fontSize: 9.5, color: '#7a8898', fontFamily: "'Segoe UI', sans-serif", borderTop: '1px solid #ccd4dc' }}>
        ※ 차동전류는 조류계산 결과의 변압기 입출력 불균형으로 근사 계산됩니다. CT 비율 및 실제 계전기 설정은 전문 엔지니어 검토가 필요합니다.
      </div>
    </div>
  )
}
