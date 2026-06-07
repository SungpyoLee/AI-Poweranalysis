/**
 * useStudyCaseStore — 스터디 케이스 스냅샷 저장/비교
 *
 * 사용법:
 *   - "현재 결과를 Baseline으로 저장" → saveBaseline(name)
 *   - ResultsPanel 'studyCase' 탭에서 Baseline ↔ Current 비교
 */

import { create } from 'zustand'
import type { Node, Edge } from 'reactflow'
import type { LoadflowResults, ShortCircuitResults, NodeData, EdgeData } from '../types'

// P2-3: 네트워크 스냅샷 포함 — 케이스 분기 후 복원 가능
export interface StudyCaseSnapshot {
  id:            string
  name:          string
  savedAt:       string   // ISO 8601
  loadflow?:     LoadflowResults
  shortcircuit?: ShortCircuitResults
  notes:         string
  // P2-3: 네트워크 상태 스냅샷 (복원 가능)
  nodes?:        Node<NodeData>[]
  edges?:        Edge<EdgeData>[]
  hasSLDSnapshot: boolean   // 네트워크 상태 포함 여부
}

interface StudyCaseState {
  cases:      StudyCaseSnapshot[]
  baselineId: string | null
}

interface StudyCaseActions {
  saveCase:      (name: string, lf?: LoadflowResults | null, sc?: ShortCircuitResults | null, notes?: string, nodes?: Node<NodeData>[], edges?: Edge<EdgeData>[]) => void
  deleteCase:    (id: string) => void
  setBaseline:   (id: string | null) => void
  getBaseline:   () => StudyCaseSnapshot | null
  restoreCase:   (id: string) => { nodes: Node<NodeData>[]; edges: Edge<EdgeData>[] } | null
  clearAll:      () => void
}

export type StudyCaseStore = StudyCaseState & StudyCaseActions

let _seq = 1

export const useStudyCaseStore = create<StudyCaseStore>((set, get) => ({
  cases:      [],
  baselineId: null,

  saveCase: (name, lf, sc, notes = '', nodes, edges) => {
    const id = `sc-${Date.now()}-${_seq++}`
    const snap: StudyCaseSnapshot = {
      id, name, notes,
      savedAt:        new Date().toISOString(),
      loadflow:       lf     ?? undefined,
      shortcircuit:   sc     ?? undefined,
      nodes:          nodes  ?? undefined,
      edges:          edges  ?? undefined,
      hasSLDSnapshot: !!(nodes && edges),
    }
    set(s => ({
      cases:      [...s.cases, snap],
      baselineId: s.cases.length === 0 ? id : s.baselineId,
    }))
  },

  deleteCase: (id) => set(s => ({
    cases:      s.cases.filter(c => c.id !== id),
    baselineId: s.baselineId === id ? null : s.baselineId,
  })),

  setBaseline:  (id) => set({ baselineId: id }),
  getBaseline:  () => {
    const { cases, baselineId } = get()
    return cases.find(c => c.id === baselineId) ?? null
  },
  // P2-3: 케이스에 저장된 네트워크 상태 복원
  restoreCase: (id) => {
    const { cases } = get()
    const snap = cases.find(c => c.id === id)
    if (!snap?.nodes || !snap?.edges) return null
    return { nodes: snap.nodes, edges: snap.edges }
  },
  clearAll: () => set({ cases: [], baselineId: null }),
}))
