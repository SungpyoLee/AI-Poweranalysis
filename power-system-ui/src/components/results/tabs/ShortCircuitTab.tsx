import { DataTable, BUS_SC_COLS, type RowData } from '../shared'

export default function ShortCircuitTab({
  rows, selectedNodeId, onRowClick,
}: {
  rows:           RowData[]
  selectedNodeId: string | null
  onRowClick:     (id: string) => void
}) {
  return (
    <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
      <DataTable
        title="Buses — Short Circuit"
        cols={BUS_SC_COLS}
        rows={rows}
        selectedId={selectedNodeId}
        onRowClick={onRowClick}
      />
    </div>
  )
}
