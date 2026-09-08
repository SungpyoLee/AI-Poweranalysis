import { DataTable, BUS_LF_COLS, TR_LF_COLS, CABLE_LF_COLS, MOTOR_LF_COLS, vmColor, type RowData } from '../shared'

export default function LoadFlowTab({
  busRows, trRows, cableRows, motorRows, selectedNodeId, selectedEdgeId, onRowClick,
}: {
  busRows:        RowData[]
  trRows:         RowData[]
  cableRows:      RowData[]
  motorRows:      RowData[]
  selectedNodeId: string | null
  selectedEdgeId: string | null
  onRowClick:     (id: string) => void
}) {
  function busLFCellStyle(colKey: string, row: RowData): React.CSSProperties | undefined {
    if (colKey === 'vm_pu' && row.vm_pu !== undefined) {
      return { color: vmColor(row.vm_pu as number), fontWeight: 700 }
    }
    if (colKey === 'ikss_ka' && row.ikss_ka !== undefined) {
      return { color: '#6a006a' }
    }
    return undefined
  }

  return (
    <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
      <DataTable
        title="Buses"
        cols={BUS_LF_COLS}
        rows={busRows}
        selectedId={selectedNodeId}
        onRowClick={onRowClick}
        cellStyle={busLFCellStyle}
      />
      <DataTable
        title="Transformers"
        cols={TR_LF_COLS}
        rows={trRows}
        selectedId={selectedNodeId}
        onRowClick={onRowClick}
      />
      <DataTable
        title="Cables"
        cols={CABLE_LF_COLS}
        rows={cableRows}
        selectedId={selectedEdgeId}
        onRowClick={onRowClick}
      />
      {motorRows.length > 0 && (
        <DataTable
          title="Motors"
          cols={MOTOR_LF_COLS}
          rows={motorRows}
          selectedId={selectedNodeId}
          onRowClick={onRowClick}
        />
      )}
    </div>
  )
}
