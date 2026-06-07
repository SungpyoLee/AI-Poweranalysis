/**
 * tapOptimizer.ts
 * 변압기 탭 자동 최적화 — Load Flow 결과를 기반으로 탭 위치 권장
 *
 * 알고리즘:
 *   1. LV 버스 전압 V_lv 확인
 *   2. 편차 = V_lv - 1.0 pu (+ = 높음, - = 낮음)
 *   3. 탭 위치 보정 = round(-편차 / tap_step_percent × 100)
 *      (탭을 올리면 LV 전압 올라감 → 탭 ↑ = V_lv ↑)
 *   4. 범위 클램프 [tap_min, tap_max]
 */

import type { Node, Edge } from 'reactflow'
import type { NodeData, EdgeData, Transformer, Bus, LoadflowResults } from '../types'
import { findTransformerBuses } from '../utils/graphTraversal'

export interface TapRecommendation {
  trNodeId:        string
  trName:          string
  currentTap:      number
  recommendedTap:  number
  lvBusName:       string
  hvBusName:       string
  vLv_pu:          number   // 현재 LV 전압
  vLvAfter_pu:     number   // 탭 조정 후 예상 전압 (선형 근사)
  tapMin:          number
  tapMax:          number
  tapStep:         number
  changed:         boolean
  reason:          string
}

export interface TapOptimizationResult {
  recommendations: TapRecommendation[]
  countChanged:    number
}

const V_TARGET = 1.0   // pu 목표
const V_BAND   = 0.005 // ±0.5% 내면 조정 불필요

export function optimizeTaps(
  nodes: Node<NodeData>[],
  edges: Edge<EdgeData>[],
  lf:    LoadflowResults,
): TapOptimizationResult {
  const nodeMap = new Map(nodes.map(n => [n.id, n]))
  const trNodes = nodes.filter(nd => nd.type === 'transformer' && nd.data.equipment.in_service)
  const recs: TapRecommendation[] = []

  for (const trNode of trNodes) {
    const eq = trNode.data.equipment as Transformer
    const { hvBusId, lvBusId } = findTransformerBuses(trNode.id, nodes, edges)
    if (!hvBusId || !lvBusId) continue

    const lvBus   = nodeMap.get(lvBusId)?.data.equipment as Bus | undefined
    const hvBus   = nodeMap.get(hvBusId)?.data.equipment as Bus | undefined
    const lfResult = lf.buses[lvBusId]
    if (!lfResult || !lvBus || !hvBus) continue

    const vLv    = lfResult.vm_pu
    const delta  = vLv - V_TARGET            // + = 너무 높음
    const step   = eq.tap_step_percent / 100

    // 필요한 탭 변화량: 탭 +1 → LV 전압 +step_pu
    const tapDelta   = Math.round(-delta / step)
    const tapNew     = Math.max(eq.tap_min, Math.min(eq.tap_max, eq.tap_pos + tapDelta))
    const changed    = tapNew !== eq.tap_pos
    const vLvAfter   = vLv + (tapNew - eq.tap_pos) * step  // 선형 근사

    let reason = ''
    if (Math.abs(delta) <= V_BAND) {
      reason = '전압 정상 범위 — 조정 불필요'
    } else if (tapNew === eq.tap_pos) {
      reason = `탭 범위 한계 (${eq.tap_min} ~ ${eq.tap_max}) — 추가 조치 필요`
    } else if (delta < -V_BAND) {
      reason = `LV 전압 낮음 (${vLv.toFixed(4)} pu) → 탭 ${eq.tap_pos} → ${tapNew} (V↑)`
    } else {
      reason = `LV 전압 높음 (${vLv.toFixed(4)} pu) → 탭 ${eq.tap_pos} → ${tapNew} (V↓)`
    }

    recs.push({
      trNodeId:       trNode.id,
      trName:         eq.name,
      currentTap:     eq.tap_pos,
      recommendedTap: tapNew,
      lvBusName:      lvBus.name,
      hvBusName:      hvBus.name,
      vLv_pu:         vLv,
      vLvAfter_pu:    vLvAfter,
      tapMin:         eq.tap_min,
      tapMax:         eq.tap_max,
      tapStep:        eq.tap_step_percent,
      changed,
      reason,
    })
  }

  return { recommendations: recs, countChanged: recs.filter(r => r.changed).length }
}
