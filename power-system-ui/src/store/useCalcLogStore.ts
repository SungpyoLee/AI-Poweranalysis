/**
 * P2-2: 계산 감사 로그 스토어
 * 계산 실행 이력을 저장하여 EPC 납품 추적 및 감사 대응에 활용
 */
import { create } from 'zustand'
import type { CalcLogEntry } from '../utils/projectIO'
import { useProjectStore } from './useProjectStore'

interface CalcLogState {
  entries: CalcLogEntry[]
}

interface CalcLogActions {
  addEntry: (type: CalcLogEntry['calcType'], summary: string, converged?: boolean) => void
  clearLog:  () => void
  loadLog:   (entries: CalcLogEntry[]) => void
}

export type CalcLogStore = CalcLogState & CalcLogActions

export const useCalcLogStore = create<CalcLogStore>((set) => ({
  entries: [],

  addEntry: (calcType, summary, converged) => {
    const { meta } = useProjectStore.getState()
    const entry: CalcLogEntry = {
      timestamp: new Date().toISOString(),
      calcType,
      summary,
      converged,
      engineer: meta.engineer || undefined,
    }
    set(s => ({ entries: [entry, ...s.entries].slice(0, 200) }))  // 최근 200개 유지
  },

  clearLog: () => set({ entries: [] }),

  loadLog: (entries) => set({ entries }),
}))
