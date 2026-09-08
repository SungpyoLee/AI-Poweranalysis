import type { ContingencyResult } from '../../../types'
import { DataTable, CONTINGENCY_COLS, type RowData } from '../shared'

function contingencyCellStyle(colKey: string, row: RowData): React.CSSProperties | undefined {
  const sev = row._severity as ContingencyResult['severity'] | undefined
  if (!sev) return undefined
  const clr = sev === 'PASS' ? '#006020' : sev === 'WARNING' ? '#8a5a00' : '#b02000'
  const bg  = sev === 'PASS' ? '#e6f4ec' : sev === 'WARNING' ? '#fff5dc' : '#fde8e8'
  if (colKey === 'severity') return { color: clr, fontWeight: 700, background: bg }
  if (sev === 'FAIL' && colKey !== 'equipmentName' && colKey !== 'equipmentType') {
    return { color: '#b02000' }
  }
  if (sev === 'WARNING' && (colKey === 'minV' || colKey === 'maxLoading' || colKey === 'uvCount' || colKey === 'overloadCount')) {
    return { color: '#8a5a00', fontWeight: 600 }
  }
  return undefined
}

export default function ContingencyTab({
  rows, selectedNodeId, onRowClick,
}: {
  rows:           RowData[]
  selectedNodeId: string | null
  onRowClick:     (id: string) => void
}) {
  return (
    <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
      <DataTable
        title="N-1 Contingency Analysis  ·  V < 0.95 pu = U/V  ·  Loading > 100% = Overload  ·  Island = FAIL"
        cols={CONTINGENCY_COLS}
        rows={rows}
        selectedId={selectedNodeId}
        onRowClick={onRowClick}
        cellStyle={contingencyCellStyle}
      />
    </div>
  )
}
