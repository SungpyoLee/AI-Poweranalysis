import type { HarmonicResults } from '../../../types'
import { DataTable, HARMONIC_BUS_COLS, type RowData } from '../shared'
import HarmonicChart from '../../HarmonicChart'

function harmonicsBusCellStyle(colKey: string, row: RowData): React.CSSProperties | undefined {
  const pass  = row._pass  as boolean | undefined
  const thdv  = row._thdv  as number  | undefined
  const limit = row._limit as number  | undefined
  if (colKey === 'status') {
    return pass
      ? { color: '#006020', fontWeight: 700 }
      : { color: '#b02000', fontWeight: 700 }
  }
  if (colKey === 'thdv_percent' && thdv !== undefined && limit !== undefined) {
    if (thdv > limit)          return { color: '#b02000', fontWeight: 700 }
    if (thdv > limit * 0.6)    return { color: '#8a5a00', fontWeight: 600 }
    return { color: '#006020' }
  }
  return undefined
}

export default function HarmonicsTab({
  rows, selectedNodeId, onRowClick, harmonics,
}: {
  rows:           RowData[]
  selectedNodeId: string | null
  onRowClick:     (id: string) => void
  harmonics:      HarmonicResults | null
}) {
  return (
    <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
      <DataTable
        title="IEEE 519-2014 Harmonic Voltage Distortion"
        cols={HARMONIC_BUS_COLS}
        rows={rows}
        selectedId={selectedNodeId}
        onRowClick={onRowClick}
        cellStyle={harmonicsBusCellStyle}
      />
      <HarmonicChart result={harmonics?.buses[selectedNodeId ?? ''] ?? null} />
    </div>
  )
}
