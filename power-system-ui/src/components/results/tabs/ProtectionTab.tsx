import { DataTable, PROTECTION_COLS, marginColor, type RowData } from '../shared'

function protectionCellStyle(colKey: string, row: RowData): React.CSSProperties | undefined {
  if (colKey === 'status') {
    return row.status === 'PASS'
      ? { color: '#006020', fontWeight: 700 }
      : { color: '#b02000', fontWeight: 700 }
  }
  if (colKey === 'breaking_margin_percent' && row.breaking_margin_percent !== undefined) {
    return { color: marginColor(row.breaking_margin_percent as number), fontWeight: 600 }
  }
  if (colKey === 'making_margin_percent' && row.making_margin_percent !== undefined) {
    return { color: marginColor(row.making_margin_percent as number), fontWeight: 600 }
  }
  return undefined
}

export default function ProtectionTab({
  rows, selectedNodeId, onRowClick,
}: {
  rows:           RowData[]
  selectedNodeId: string | null
  onRowClick:     (id: string) => void
}) {
  return (
    <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
      <DataTable
        title="Protection Coordination — IEC 62271"
        cols={PROTECTION_COLS}
        rows={rows}
        selectedId={selectedNodeId}
        onRowClick={onRowClick}
        cellStyle={protectionCellStyle}
      />
    </div>
  )
}
