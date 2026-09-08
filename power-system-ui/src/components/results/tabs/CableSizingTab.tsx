import type { CableSizingResult } from '../../../types'
import { DataTable, CABLE_SIZING_COLS, type RowData } from '../shared'

function cableSizingCellStyle(colKey: string, row: RowData): React.CSSProperties | undefined {
  const sev     = row._severity as CableSizingResult['severity'] | undefined
  const passAmp = row._passAmp  as boolean | undefined
  const passDv  = row._passDv   as boolean | undefined
  const dv      = row._dv       as number  | undefined
  const dvLim   = row._dvLimit  as number  | undefined

  if (colKey === 'status') {
    if (sev === 'PASS')    return { color: '#006020', fontWeight: 700 }
    if (sev === 'WARNING') return { color: '#8a5a00', fontWeight: 700, background: '#fff5dc' }
    return { color: '#b02000', fontWeight: 700, background: '#fde8e8' }
  }
  if (colKey === 'loadCurrentA' && passAmp === false) {
    return { color: '#b02000', fontWeight: 700 }
  }
  if (colKey === 'ampacityA' && passAmp === false) {
    return { color: '#b02000', fontWeight: 700 }
  }
  if (colKey === 'voltageDropPercent' && dv !== undefined && dvLim !== undefined) {
    if (!passDv) return { color: '#b02000', fontWeight: 700 }
    if (dv > dvLim * 0.8) return { color: '#8a5a00', fontWeight: 600 }
  }
  if (colKey === 'recommendedModel') {
    if (sev === 'FAIL')    return { color: '#b02000', fontWeight: 700 }
    if (sev === 'WARNING') return { color: '#8a5a00', fontWeight: 600 }
  }
  return undefined
}

export default function CableSizingTab({
  rows, selectedEdgeId, onRowClick,
}: {
  rows:           RowData[]
  selectedEdgeId: string | null
  onRowClick:     (id: string) => void
}) {
  return (
    <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
      <DataTable
        title="IEC 60364 Cable Sizing  ·  Ampacity / Voltage Drop (LV 3%, MV 5%) / Short-Circuit Withstand"
        cols={CABLE_SIZING_COLS}
        rows={rows}
        selectedId={selectedEdgeId}
        onRowClick={onRowClick}
        cellStyle={cableSizingCellStyle}
      />
    </div>
  )
}
