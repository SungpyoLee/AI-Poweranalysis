import type { RelayResult } from '../../../types'
import type { TCCData } from '../../../engine/tcc'
import TCCChart from '../../TCCChart'

export default function TCCTab({ relayResults, tccData }: {
  relayResults: RelayResult[]
  tccData:      TCCData
}) {
  return (
    <div style={{ flex: 1, overflow: 'auto', background: '#f4f6f8', padding: '2px 6px' }}>
      {/* #10 TCC 진입 가이드 */}
      {relayResults.length === 0 && (
        <div style={{
          margin: '12px 8px', padding: '10px 14px',
          background: '#fff8e8', border: '1px solid #d0a800', borderRadius: 3,
          fontSize: 10, fontFamily: "'Segoe UI', 'Malgun Gothic', Arial, sans-serif",
          color: '#5a3800', lineHeight: 1.8,
        }}>
          <div style={{ fontWeight: 700, marginBottom: 4 }}>⚠ TCC Viewer 활성화 절차</div>
          <ol style={{ margin: 0, paddingLeft: 18 }}>
            <li>캔버스에 <b>Breaker</b> 노드를 배치하고 Bus에 연결합니다.</li>
            <li>Breaker 클릭 → Properties → <b>Relay Settings → Enable Relay</b>.</li>
            <li>Pickup Current · Time Dial · 곡선 타입을 설정합니다.</li>
            <li>Toolbar → <b>Short-Circuit</b> 실행.</li>
          </ol>
          <div style={{ marginTop: 6, fontSize: 9.5, color: '#8a7000' }}>
            계전기가 설정된 Breaker가 없거나 Short-Circuit 결과가 없으면 이 탭이 비활성화됩니다.
          </div>
        </div>
      )}
      <TCCChart data={tccData} />
    </div>
  )
}
