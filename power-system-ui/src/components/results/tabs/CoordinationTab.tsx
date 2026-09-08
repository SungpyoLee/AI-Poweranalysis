import { DataTable, COORDINATION_COLS, marginColor, type RowData } from '../shared'

function coordinationCellStyle(colKey: string, row: RowData): React.CSSProperties | undefined {
  const pass    = row._pass    as boolean | undefined
  const capOk   = row._cap_ok  as boolean | undefined
  const capMgn  = row._cap_margin as number | undefined
  const allPass = (pass !== false) && (capOk !== false)

  if (colKey === 'status') {
    return allPass
      ? { color: '#006020', fontWeight: 700 }
      : { color: '#b02000', fontWeight: 700 }
  }
  if (colKey === 'cap_margin_percent' && capMgn !== undefined) {
    return { color: marginColor(capMgn), fontWeight: 600 }
  }
  if (colKey === 'breaking_capacity_ka' && capOk === false) {
    return { color: '#b02000', fontWeight: 700 }
  }
  if (!pass && colKey !== 'breakerName' && colKey !== 'busName') {
    return { color: '#b02000' }
  }
  if (colKey === 'relay_operating_time_s' && row.inst_label === '⚡ Yes') {
    return { color: '#6a006a', fontWeight: 700 }
  }
  return undefined
}

export default function CoordinationTab({
  rows, selectedNodeId, onRowClick,
}: {
  rows:           RowData[]
  selectedNodeId: string | null
  onRowClick:     (id: string) => void
}) {
  return (
    <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
      <DataTable
        title="Protection Coordination  ·  IEC 60255  ·  Margin threshold 0.3 s"
        cols={COORDINATION_COLS}
        rows={rows}
        selectedId={selectedNodeId}
        onRowClick={onRowClick}
        cellStyle={coordinationCellStyle}
      />
    </div>
  )
}
