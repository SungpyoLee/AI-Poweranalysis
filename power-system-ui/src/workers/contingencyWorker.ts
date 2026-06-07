/**
 * N-1 Contingency Web Worker
 * UI 스레드 블로킹 없이 연속성 분석을 백그라운드에서 실행합니다.
 */
import type { Node, Edge } from 'reactflow'
import type { NodeData, EdgeData, ContingencyResults } from '../types'
import { runContingencyAnalysis } from '../engine/contingency'

export type WorkerRequest = {
  nodes: Node<NodeData>[]
  edges: Edge<EdgeData>[]
}

export type WorkerResponse =
  | { type: 'progress'; label: string; done: number; total: number }
  | { type: 'result';   result: ContingencyResults }
  | { type: 'error';    message: string }

self.onmessage = (e: MessageEvent<WorkerRequest>) => {
  try {
    const { nodes, edges } = e.data
    const result = runContingencyAnalysis(nodes, edges)
    self.postMessage({ type: 'result', result } satisfies WorkerResponse)
  } catch (err) {
    self.postMessage({ type: 'error', message: String(err) } satisfies WorkerResponse)
  }
}
