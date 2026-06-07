/**
 * TapOptimizerPanel — 변압기 탭 자동 최적화 결과 패널
 * Load Flow 완료 후 각 변압기에 권장 탭 위치를 제시하고 적용 버튼 제공
 */

import { useCallback, useMemo, useState } from 'react'
import { useEquipmentStore } from '../store/useEquipmentStore'
import { useAnalysisStore }  from '../store/useAnalysisStore'
import { optimizeTaps, type TapRecommendation } from '../engine/tapOptimizer'
import type { Transformer } from '../types'
import { showToast } from '../store/useToastStore'

const FONT = "'Segoe UI', 'Malgun Gothic', Arial, sans-serif"

interface Props { onClose: () => void }

export default function TapOptimizerPanel({ onClose }: Props) {
  const nodes   = useEquipmentStore(s => s.nodes)
  const edges   = useEquipmentStore(s => s.edges)
  const update  = useEquipmentStore(s => s.updateEquipment)
  const lf      = useAnalysisStore(s => s.loadflow)
  const runLF   = useAnalysisStore(s => s.runLoadflowLocal)

  const result = useMemo(() =>
    lf ? optimizeTaps(nodes, edges, lf) : null,
  [nodes, edges, lf])

  const [applied, setApplied] = useState<Set<string>>(new Set())

  const applyOne = useCallback((rec: TapRecommendation) => {
    const nd = nodes.find(n => n.id === rec.trNodeId)
    if (!nd) return
    const eq = nd.data.equipment as Transformer
    update(rec.trNodeId, { ...eq, tap_pos: rec.recommendedTap })
    setApplied(prev => new Set([...prev, rec.trNodeId]))
    showToast(`${rec.trName} 탭 ${rec.currentTap} → ${rec.recommendedTap} 적용`, 'success')
  }, [nodes, update])

  const applyAll = useCallback(() => {
    if (!result) return
    for (const rec of result.recommendations) {
      if (rec.changed && !applied.has(rec.trNodeId)) applyOne(rec)
    }
    showToast('모든 탭 최적화 적용 완료. Load Flow를 재실행하세요.', 'success', 4000)
  }, [result, applied, applyOne])

  const vmColor = (v: number) =>
    v >= 0.95 && v <= 1.05 ? '#005a20'
    : v >= 0.90 && v <= 1.10 ? '#8a5a00'
    : '#b02000'

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9400,
      background: 'rgba(0,0,0,0.42)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div style={{
        background: '#f4f6f8', border: '1px solid #8a9aaa', borderRadius: 4,
        boxShadow: '0 10px 36px rgba(0,0,0,0.28)',
        width: 700, maxHeight: '85vh',
        display: 'flex', flexDirection: 'column',
        fontFamily: FONT, overflow: 'hidden',
      }}>
        {/* 헤더 */}
        <div style={{
          background: 'linear-gradient(to bottom, #1e3a7a, #152d60)',
          padding: '10px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
              <circle cx="7.5" cy="7.5" r="6.5" stroke="#60e8a0" strokeWidth="1.2"/>
              <path d="M7.5 4v3.5l2.5 1.5" stroke="#60e8a0" strokeWidth="1.2" strokeLinecap="round"/>
              <circle cx="12" cy="3" r="2.5" fill="#ffcc44"/>
              <path d="M11 3h2M12 2v2" stroke="#1a2a40" strokeWidth="0.9" strokeLinecap="round"/>
            </svg>
            <span style={{ fontSize: 12, fontWeight: 700, color: '#e8f0ff' }}>변압기 탭 자동 최적화</span>
            {result && result.countChanged > 0 && (
              <span style={{ fontSize: 9, background: '#ffcc44', color: '#3a2a00',
                padding: '1px 7px', borderRadius: 10, fontWeight: 700 }}>
                {result.countChanged}개 조정 권고
              </span>
            )}
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#8ab0e8', cursor: 'pointer', fontSize: 16 }}>✕</button>
        </div>

        {/* 본문 */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '14px 16px' }}>
          {!lf ? (
            <div style={{
              padding: '32px', textAlign: 'center', color: '#8a9aaa', fontSize: 11,
            }}>
              <div style={{ fontSize: 28, marginBottom: 10 }}>⚡</div>
              <div>Load Flow를 먼저 실행하세요.</div>
              <button
                onClick={() => { runLF(); onClose() }}
                style={{
                  marginTop: 12, padding: '6px 18px', fontSize: 10.5, cursor: 'pointer',
                  background: 'linear-gradient(to bottom, #1e3a7a, #152d60)',
                  border: 'none', borderRadius: 3, color: '#fff', fontWeight: 700,
                }}
              >LF (Local) 실행</button>
            </div>
          ) : !result || result.recommendations.length === 0 ? (
            <div style={{ padding: 24, textAlign: 'center', color: '#8a9aaa', fontSize: 11 }}>
              변압기 없음
            </div>
          ) : (
            <>
              <p style={{ fontSize: 10, color: '#5a6a7a', marginBottom: 12, lineHeight: 1.7 }}>
                Load Flow 결과 기반으로 LV 버스 전압을 <strong>1.0 pu ±0.5%</strong> 로 맞추는 탭 위치를 권장합니다.
                탭 1단 ≈ {result.recommendations[0]?.tapStep ?? 2.5}% 전압 변화.
              </p>

              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 10.5 }}>
                <thead>
                  <tr style={{ background: '#d4dae2' }}>
                    {['변압기', 'LV Bus', '현재 V (pu)', '현재 탭', '권장 탭', '예상 V (pu)', '상태', '적용'].map(h => (
                      <th key={h} style={{
                        padding: '5px 8px', textAlign: 'left', fontSize: 9.5,
                        fontWeight: 700, color: '#2a3a4a', textTransform: 'uppercase',
                        letterSpacing: '0.04em', whiteSpace: 'nowrap',
                        borderBottom: '2px solid #b0bcc8',
                      }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {result.recommendations.map(rec => {
                    const isApplied = applied.has(rec.trNodeId)
                    return (
                      <tr key={rec.trNodeId} style={{
                        borderBottom: '1px solid #e8ecf0',
                        background: isApplied ? '#e8f8ee' : undefined,
                      }}>
                        <td style={{ padding: '5px 8px', fontWeight: 700 }}>{rec.trName}</td>
                        <td style={{ padding: '5px 8px' }}>{rec.lvBusName}</td>
                        <td style={{ padding: '5px 8px', fontFamily: 'Consolas,monospace',
                          color: vmColor(rec.vLv_pu), fontWeight: 700 }}>
                          {rec.vLv_pu.toFixed(4)}
                        </td>
                        <td style={{ padding: '5px 8px', fontFamily: 'Consolas,monospace' }}>
                          {rec.currentTap}
                        </td>
                        <td style={{ padding: '5px 8px', fontFamily: 'Consolas,monospace',
                          fontWeight: rec.changed ? 700 : 400,
                          color: rec.changed ? '#1a3a7a' : undefined,
                        }}>
                          {rec.recommendedTap}
                          {rec.changed && (
                            <span style={{ fontSize: 8.5, color: rec.recommendedTap > rec.currentTap ? '#005a20' : '#8a0000', marginLeft: 4 }}>
                              {rec.recommendedTap > rec.currentTap ? '▲' : '▼'}
                              {Math.abs(rec.recommendedTap - rec.currentTap)}
                            </span>
                          )}
                        </td>
                        <td style={{ padding: '5px 8px', fontFamily: 'Consolas,monospace',
                          color: vmColor(rec.vLvAfter_pu), fontWeight: 700 }}>
                          {rec.vLvAfter_pu.toFixed(4)}
                        </td>
                        <td style={{ padding: '5px 8px', fontSize: 9.5 }}>
                          {isApplied ? (
                            <span style={{ color: '#005a20', fontWeight: 700 }}>✓ 적용됨</span>
                          ) : rec.changed ? (
                            <span style={{ color: '#8a5a00', fontWeight: 700 }}>⚠ 조정 권고</span>
                          ) : (
                            <span style={{ color: '#5a8a5a' }}>정상</span>
                          )}
                        </td>
                        <td style={{ padding: '5px 8px' }}>
                          {rec.changed && !isApplied && (
                            <button
                              onClick={() => applyOne(rec)}
                              style={{
                                padding: '2px 10px', fontSize: 9.5, cursor: 'pointer',
                                background: 'linear-gradient(to bottom, #1e3a7a, #152d60)',
                                border: 'none', borderRadius: 2, color: '#fff', fontWeight: 600,
                              }}
                            >적용</button>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </>
          )}
        </div>

        {/* 하단 버튼 */}
        {result && result.countChanged > 0 && (
          <div style={{
            padding: '10px 16px', borderTop: '1px solid #d0d8e0', flexShrink: 0,
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          }}>
            <span style={{ fontSize: 9.5, color: '#7a8898' }}>
              탭 적용 후 Load Flow를 재실행하면 정확한 결과를 확인할 수 있습니다.
            </span>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={onClose} style={{
                padding: '5px 14px', fontSize: 10.5, cursor: 'pointer',
                background: '#e8ecf0', border: '1px solid #a0b0c0', borderRadius: 2, color: '#3a4a5a',
              }}>닫기</button>
              <button onClick={applyAll} style={{
                padding: '5px 16px', fontSize: 10.5, fontWeight: 700, cursor: 'pointer',
                background: 'linear-gradient(to bottom, #1e3a7a, #152d60)',
                border: 'none', borderRadius: 3, color: '#fff',
              }}>전체 적용</button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
