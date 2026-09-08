import type { ArcFlashResults, ArcFlashRiskLevel } from '../../../types'
import { DataTable, ARC_FLASH_COLS, arcRiskColor, arcRiskBg, type RowData } from '../shared'

function arcFlashCellStyle(colKey: string, row: RowData): React.CSSProperties | undefined {
  const risk = row._risk as ArcFlashRiskLevel | undefined
  if (!risk) return undefined
  if (colKey === 'risk_level') {
    return { color: arcRiskColor(risk), fontWeight: 700, background: arcRiskBg(risk) }
  }
  if (colKey === 'incident_energy_cal' || colKey === 'ppe_label') {
    return { color: arcRiskColor(risk), fontWeight: 600 }
  }
  return undefined
}

export default function ArcFlashTab({
  arcFlash, rows, selectedNodeId, onRowClick,
}: {
  arcFlash:       ArcFlashResults | null
  rows:           RowData[]
  selectedNodeId: string | null
  onRowClick:     (id: string) => void
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
      {arcFlash && (
        <div style={{
          padding: '6px 12px', background: '#fffbe8',
          borderBottom: '1px solid #d8b800', flexShrink: 0,
          fontFamily: "'Segoe UI','Malgun Gothic',Arial,sans-serif",
          fontSize: 9, color: '#5a3800', lineHeight: 1.6,
        }}>
          <strong style={{ color: '#8a5000' }}>
            ⚠ [{arcFlash.method === 'IEEE_1584_2018_enhanced' ? 'IEEE 1584-2018 Enhanced' : 'IEEE 1584-2002'}]&nbsp;
          </strong>
          {arcFlash.disclaimer}
        </div>
      )}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        <DataTable
          title="Arc Flash Analysis  ·  IEEE 1584  ·  HIGH ≥ 8 cal/cm²  ·  EXTREME ≥ 25 cal/cm²"
          cols={ARC_FLASH_COLS}
          rows={rows}
          selectedId={selectedNodeId}
          onRowClick={onRowClick}
          cellStyle={arcFlashCellStyle}
        />
      </div>
    </div>
  )
}
