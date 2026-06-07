import { useEffect, useRef } from 'react'
import { useEquipmentStore } from '../store/useEquipmentStore'
import { useAnalysisStore } from '../store/useAnalysisStore'
import { useProjectStore } from '../store/useProjectStore'
import { autoSave, buildPFA } from '../utils/projectIO'

const DEBOUNCE_MS = 2000

export function useAutoSave() {
  const nodes      = useEquipmentStore(s => s.nodes)
  const edges      = useEquipmentStore(s => s.edges)
  const meta       = useProjectStore(s => s.meta)
  const markDirty  = useProjectStore(s => s.markDirty)

  const loadflow      = useAnalysisStore(s => s.loadflow)
  const shortcircuit  = useAnalysisStore(s => s.shortcircuit)
  const arcFlash      = useAnalysisStore(s => s.arcFlash)
  const contingency   = useAnalysisStore(s => s.contingency)
  const harmonics     = useAnalysisStore(s => s.harmonics)
  const cableSizing   = useAnalysisStore(s => s.cableSizing)

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    markDirty()

    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => {
      const pfa = buildPFA(meta, nodes, edges, {
        loadflow:     loadflow     ?? null,
        shortcircuit: shortcircuit ?? null,
        arcFlash:     arcFlash     ?? null,
        contingency:  contingency  ?? null,
        harmonics:    harmonics    ?? null,
        cableSizing:  cableSizing  ?? null,
      })
      autoSave(pfa)
    }, DEBOUNCE_MS)

    return () => { if (timerRef.current) clearTimeout(timerRef.current) }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodes, edges])
}
