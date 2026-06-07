/**
 * P2-7: LoadFlow Web Worker
 * 조류계산을 UI 스레드에서 분리하여 대형 네트워크에서 UI 블로킹 방지
 */
import type { Node, Edge } from 'reactflow'
import type { NodeData, EdgeData, LoadflowResults } from '../types'
import { runLocalLoadflow } from '../engine/loadflow'

export interface LFWorkerRequest {
  nodes:        Node<NodeData>[]
  edges:        Edge<EdgeData>[]
  frequency_hz: number
}

export interface LFWorkerResponse {
  type:    'result' | 'error'
  result?: LoadflowResults
  message?: string
  elapsed_ms?: number
}

self.onmessage = (e: MessageEvent<LFWorkerRequest>) => {
  const { nodes, edges, frequency_hz } = e.data
  const t0 = performance.now()
  try {
    const result = runLocalLoadflow(nodes, edges, frequency_hz)
    const elapsed_ms = performance.now() - t0
    self.postMessage({ type: 'result', result, elapsed_ms } satisfies LFWorkerResponse)
  } catch (err: any) {
    self.postMessage({ type: 'error', message: err?.message ?? 'LoadFlow Worker 오류' } satisfies LFWorkerResponse)
  }
}
