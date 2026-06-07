/**
 * P2-7: ShortCircuit Web Worker
 * 단락계산을 UI 스레드에서 분리하여 대형 네트워크에서 UI 블로킹 방지
 */
import type { Node, Edge } from 'reactflow'
import type { NodeData, EdgeData, ShortCircuitResults, ArcFlashResults } from '../types'
import { runLocalShortcircuit } from '../engine/shortcircuit'
import { computeRelayResults } from '../engine/protectionCoordination'
import { computeArcFlash } from '../engine/arcFlash'

export interface SCWorkerRequest {
  nodes:          Node<NodeData>[]
  edges:          Edge<EdgeData>[]
  coordMarginS:   number
}

export interface SCWorkerResponse {
  type:         'result' | 'error'
  shortcircuit?: ShortCircuitResults
  arcFlash?:    ArcFlashResults
  message?:     string
}

self.onmessage = (e: MessageEvent<SCWorkerRequest>) => {
  const { nodes, edges, coordMarginS } = e.data
  try {
    const result       = runLocalShortcircuit(nodes, edges)
    const relayResults = computeRelayResults(result, nodes, edges, coordMarginS)
    const arcFlash     = computeArcFlash(result, nodes, edges, relayResults)
    self.postMessage({ type: 'result', shortcircuit: result, arcFlash } satisfies SCWorkerResponse)
  } catch (err: any) {
    self.postMessage({ type: 'error', message: err?.message ?? 'ShortCircuit Worker 오류' } satisfies SCWorkerResponse)
  }
}
