import { DataTable, MOTOR_START_COLS, startStatusColor, type RowData } from '../shared'

function motorStartCellStyle(colKey: string, row: RowData): React.CSSProperties | undefined {
  const v = row.terminal_voltage_pu as number | undefined
  if (v === undefined) return undefined
  if (colKey === 'terminal_voltage_pu' || colKey === 'voltage_drop_percent') {
    return { color: startStatusColor(v), fontWeight: 700 }
  }
  if (colKey === 'status') {
    return { color: startStatusColor(v), fontWeight: 700 }
  }
  return undefined
}

export default function MotorStartTab({
  rows, selectedNodeId, onRowClick,
}: {
  rows:           RowData[]
  selectedNodeId: string | null
  onRowClick:     (id: string) => void
}) {
  return (
    <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
      <DataTable
        title="Motor Starting Analysis  ·  PASS ≥ 0.85 pu  ·  WARNING ≥ 0.80 pu"
        cols={MOTOR_START_COLS}
        rows={rows}
        selectedId={selectedNodeId}
        onRowClick={onRowClick}
        cellStyle={motorStartCellStyle}
      />
    </div>
  )
}
