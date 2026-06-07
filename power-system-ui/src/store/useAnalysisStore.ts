import { create } from 'zustand'
import type {
  LoadflowResults, ShortCircuitResults, ArcFlashResults,
  ContingencyResults, HarmonicResults, CableSizingResults,
  AsymFaultResults,
} from '../types'
import { runLoadflow as apiRunLoadflow } from '../api.ts'
import { buildNetworkPayload } from '../utils/buildNetworkPayload'
import { validateNetwork } from '../utils/networkValidation'
import { useProjectStore } from './useProjectStore'
import { runAsymmetricFault } from '../engine/asymmetricFault'
import type { WorkerResponse } from '../workers/contingencyWorker'
import type { LFWorkerResponse } from '../workers/loadflowWorker'
import type { SCWorkerResponse } from '../workers/shortcircuitWorker'
import { computeHarmonics } from '../engine/harmonics'
import { computeCableSizing } from '../engine/cableSizing'
import { useEquipmentStore } from './useEquipmentStore'
import { useCalcLogStore } from './useCalcLogStore'

// 계산 완료 후 ResultsPanel 탭 자동 전환에 사용
export type CalcType = 'lf' | 'sc' | 'asymFault' | 'contingency' | 'harmonics' | 'cableSizing'

// ── 상태 ──────────────────────────────────────────────────────────────────────
interface AnalysisState {
  loadflow:     LoadflowResults    | null
  shortcircuit: ShortCircuitResults | null
  asymFault:    AsymFaultResults   | null
  arcFlash:     ArcFlashResults    | null
  contingency:  ContingencyResults | null
  harmonics:    HarmonicResults    | null
  cableSizing:  CableSizingResults | null
  loading:      boolean
  loadingLabel: string
  error:        string | null
  lastCalcType: CalcType | null   // 계산 완료 시 ResultsPanel 탭 자동 전환용
}

// ── 액션 ──────────────────────────────────────────────────────────────────────
interface AnalysisActions {
  runLoadflow:       () => Promise<void>
  runLoadflowLocal:  () => Promise<void>
  runShortcircuit:   () => Promise<void>
  runAsymFault:      () => Promise<void>
  runContingency:    () => void
  runHarmonics:      () => Promise<void>
  runCableSizing:    () => Promise<void>
  loadResults:       (results: import('../utils/projectIO').PFAResults) => void
  clearResults:      () => void
  setError:          (msg: string | null) => void
}

export type AnalysisStore = AnalysisState & AnalysisActions

// ── 결과 매핑 헬퍼 (backend API 전용) ────────────────────────────────────────
// API 응답의 pandapower 인덱스를 ReactFlow nodeId로 변환
function mapBusResults(
  rawBuses: Record<string, unknown>[],
  indexToNode: Map<number, string>
): LoadflowResults['buses'] {
  const result: LoadflowResults['buses'] = {}
  rawBuses.forEach((b: any, i) => {
    const nodeId = indexToNode.get(i)
    if (!nodeId) return
    result[nodeId] = {
      nodeId,
      vm_pu:     b.vm_pu     ?? 1.0,
      va_degree: b.va_degree ?? 0,
      p_mw:      b.p_mw      ?? 0,
      q_mvar:    b.q_mvar    ?? 0,
    }
  })
  return result
}

function mapTransformerResults(
  rawTrs: Record<string, unknown>[],
  indexToTr: Map<number, string>
): LoadflowResults['transformers'] {
  const result: LoadflowResults['transformers'] = {}
  rawTrs.forEach((t: any, i) => {
    const nodeId = indexToTr.get(i)
    if (!nodeId) return
    result[nodeId] = {
      nodeId,
      loading_percent: t.loading_percent ?? 0,
      p_hv_mw:         t.p_hv_mw        ?? 0,
      q_hv_mvar:       t.q_hv_mvar      ?? 0,
      p_lv_mw:         t.p_lv_mw        ?? 0,
      q_lv_mvar:       t.q_lv_mvar      ?? 0,
      pl_mw:           t.pl_mw          ?? 0,
    }
  })
  return result
}

// ── 스토어 구현 ───────────────────────────────────────────────────────────────
export const useAnalysisStore = create<AnalysisStore>((set, get) => ({
  loadflow:     null,
  shortcircuit: null,
  asymFault:    null,
  arcFlash:     null,
  contingency:  null,
  harmonics:    null,
  cableSizing:  null,
  loading:      false,
  loadingLabel: '',
  error:        null,
  lastCalcType: null,

  runLoadflow: async () => {
    const { nodes, edges } = useEquipmentStore.getState()
    if (nodes.length === 0) return

    set({ loading: true, loadingLabel: 'Load Flow', error: null })
    try {
      // Step 3에서 buildNetworkPayload가 검증 포함 완전 구현으로 교체됨
      const { payload, idMaps } = buildNetworkPayload(nodes, edges)
      const raw = await apiRunLoadflow(payload)

      set({
        loadflow: {
          converged:    raw.converged ?? false,
          buses:        mapBusResults(raw.buses ?? [], idMaps.indexToNode),
          transformers: mapTransformerResults(raw.transformers ?? [], idMaps.indexToTr),
          lines:        {},
          generators:   {},
          motors:       {},
        },
        loading: false,
      })
    } catch (e: any) {
      set({ error: e.message ?? 'Load Flow 계산 실패', loading: false })
    }
  },

  runShortcircuit: async () => {
    const { nodes, edges } = useEquipmentStore.getState()
    const { meta }         = useProjectStore.getState()
    if (nodes.length === 0) return

    set({ loading: true, loadingLabel: 'Short-Circuit', error: null })
    const coordMarginS = meta.coordination_margin_s ?? 0.3

    // P2-7: Web Worker 사용 — UI 스레드 블로킹 방지
    const worker = new Worker(
      new URL('../workers/shortcircuitWorker.ts', import.meta.url),
      { type: 'module' },
    )
    worker.onmessage = (e: MessageEvent<SCWorkerResponse>) => {
      const msg = e.data
      worker.terminate()
      if (msg.type === 'result' && msg.shortcircuit) {
        const result = msg.shortcircuit
        const busCount = Object.keys(result.buses).length
        const maxIk = busCount > 0
          ? Math.max(...Object.values(result.buses).map(b => b.ikss_ka)).toFixed(3)
          : '—'
        useCalcLogStore.getState().addEntry(
          'ShortCircuit',
          `${busCount} buses · Ik"_max=${maxIk} kA · margin=${coordMarginS}s`,
        )
        set({ shortcircuit: result, arcFlash: msg.arcFlash ?? null, loading: false, lastCalcType: 'sc' })
      } else {
        set({ error: msg.message ?? 'Short-Circuit 계산 실패', loading: false })
      }
    }
    worker.onerror = (err) => {
      worker.terminate()
      set({ error: err.message ?? 'ShortCircuit Worker 오류', loading: false })
    }
    worker.postMessage({ nodes, edges, coordMarginS })
  },



  // ① 비대칭 고장 (1LG / LL / 2LG)
  runAsymFault: async () => {
    const { nodes, edges } = useEquipmentStore.getState()
    if (nodes.length === 0) return
    set({ loading: true, loadingLabel: 'Asym. Fault', error: null })
    try {
      const result = runAsymmetricFault(nodes, edges)
      set({ asymFault: result, loading: false, lastCalcType: 'asymFault' })
    } catch (e: any) {
      set({ error: e.message ?? '비대칭 고장 계산 실패', loading: false })
    }
  },

  runLoadflowLocal: async () => {
    const { nodes, edges, setHighlightedIds } = useEquipmentStore.getState()
    const { meta } = useProjectStore.getState()
    if (nodes.length === 0) return

    set({ loading: true, loadingLabel: 'Load Flow (Local)', error: null })

    const validation = validateNetwork(nodes, edges)
    if (!validation.valid) {
      const errorNodeIds = validation.issues
        .filter(i => i.severity === 'error')
        .flatMap(i => i.nodeIds ?? [])
      if (errorNodeIds.length > 0) setHighlightedIds(new Set(errorNodeIds))
      const msgs = validation.issues.filter(i => i.severity === 'error').map(i => i.message)
      set({ error: '검증 실패: ' + msgs.join(' | '), loading: false })
      return
    }
    setHighlightedIds(new Set())

    // P2-7: Web Worker 사용 — UI 스레드 블로킹 방지
    const worker = new Worker(
      new URL('../workers/loadflowWorker.ts', import.meta.url),
      { type: 'module' },
    )
    worker.onmessage = (e: MessageEvent<LFWorkerResponse>) => {
      const msg = e.data
      worker.terminate()
      if (msg.type === 'result' && msg.result) {
        const result = msg.result
        const busCount = Object.keys(result.buses).length
        const vmin = busCount > 0
          ? Math.min(...Object.values(result.buses).map(b => b.vm_pu)).toFixed(4)
          : '—'
        useCalcLogStore.getState().addEntry(
          'LoadFlow',
          `${busCount} buses · Vmin=${vmin} pu · ${result.meta?.iterationCount ?? '?'} iter`,
          result.converged,
        )
        set({ loadflow: result, loading: false })
      } else {
        set({ error: msg.message ?? 'Load Flow 계산 실패', loading: false })
      }
    }
    worker.onerror = (err) => {
      worker.terminate()
      set({ error: err.message ?? 'LoadFlow Worker 오류', loading: false })
    }
    worker.postMessage({ nodes, edges, frequency_hz: meta.frequency_hz ?? 60 })
  },

  runContingency: () => {
    const { nodes, edges } = useEquipmentStore.getState()
    if (nodes.length === 0) return

    set({ loading: true, loadingLabel: 'N-1 Contingency (background)', error: null })

    const worker = new Worker(
      new URL('../workers/contingencyWorker.ts', import.meta.url),
      { type: 'module' },
    )

    worker.onmessage = (e: MessageEvent<WorkerResponse>) => {
      const msg = e.data
      if (msg.type === 'result') {
        set({ contingency: msg.result, loading: false, lastCalcType: 'contingency' })
        worker.terminate()
      } else if (msg.type === 'error') {
        set({ error: msg.message, loading: false })
        worker.terminate()
      }
    }

    worker.onerror = (err) => {
      set({ error: err.message ?? 'N-1 Worker 오류', loading: false })
      worker.terminate()
    }

    worker.postMessage({ nodes, edges })
  },

  runHarmonics: async () => {
    const { nodes, edges } = useEquipmentStore.getState()
    if (nodes.length === 0) return
    set({ loading: true, loadingLabel: 'Harmonics', error: null })
    try {
      const loadflow = get().loadflow
      const result   = computeHarmonics(nodes, edges, loadflow)
      const srcCount = result.sources.length
      const worst = Object.values(result.buses).reduce((max, b) => Math.max(max, b.thdv_percent), 0)
      useCalcLogStore.getState().addEntry('Harmonics', `${srcCount} sources · worst THDv=${worst.toFixed(2)}%`)
      set({ harmonics: result, loading: false, lastCalcType: 'harmonics' })
    } catch (e: any) {
      set({ error: e.message ?? 'Harmonic 계산 실패', loading: false })
    }
  },

  runCableSizing: async () => {
    const { nodes, edges } = useEquipmentStore.getState()
    if (edges.filter(e => e.data?.cable).length === 0) return
    set({ loading: true, loadingLabel: 'Cable Sizing', error: null })
    try {
      const { loadflow, shortcircuit } = get()
      const result = computeCableSizing(nodes, edges, loadflow, shortcircuit)
      const cableCount = Object.keys(result.cables).length
      const failCount  = Object.values(result.cables).filter(c => c.severity === 'FAIL').length
      useCalcLogStore.getState().addEntry('CableSizing', `${cableCount} cables · ${failCount} FAIL`)
      set({ cableSizing: result, loading: false, lastCalcType: 'cableSizing' })
    } catch (e: any) {
      set({ error: e.message ?? 'Cable Sizing 계산 실패', loading: false })
    }
  },

  loadResults: (results) => set({
    loadflow:     results.loadflow     ?? null,
    shortcircuit: results.shortcircuit ?? null,
    arcFlash:     results.arcFlash     ?? null,
    contingency:  results.contingency  ?? null,
    harmonics:    results.harmonics    ?? null,
    cableSizing:  results.cableSizing  ?? null,
  }),

  clearResults: () => set({ loadflow: null, shortcircuit: null, asymFault: null, arcFlash: null, contingency: null, harmonics: null, cableSizing: null, error: null, lastCalcType: null }),
  setError:     (msg) => set({ error: msg }),
}))
