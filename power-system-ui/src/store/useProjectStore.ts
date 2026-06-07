import { create } from 'zustand'
import { type PFAMeta, defaultMeta, hasAutoSave as checkHasAutoSave } from '../utils/projectIO'

// ── State ─────────────────────────────────────────────────────────────────────
interface ProjectState {
  meta:            PFAMeta
  isDirty:         boolean
  currentFileName: string | null
  showRestoreBanner: boolean   // autosave restore prompt
}

// ── Actions ───────────────────────────────────────────────────────────────────
interface ProjectActions {
  setMeta:              (patch: Partial<PFAMeta>) => void
  markDirty:            () => void
  markSaved:            (fileName: string) => void
  loadMeta:             (meta: PFAMeta, fileName?: string) => void
  newProject:           (name?: string) => void
  checkRestoreBanner:   () => void
  dismissRestoreBanner: () => void
}

export type ProjectStore = ProjectState & ProjectActions

export const useProjectStore = create<ProjectStore>((set) => ({
  meta:              defaultMeta(),
  isDirty:           false,
  currentFileName:   null,
  showRestoreBanner: false,

  setMeta: (patch) =>
    set(s => ({ meta: { ...s.meta, ...patch }, isDirty: true })),

  markDirty: () => set({ isDirty: true }),

  markSaved: (fileName) =>
    set(s => ({
      isDirty:         false,
      currentFileName: fileName,
      meta: { ...s.meta, modified: new Date().toISOString() },
    })),

  loadMeta: (meta, fileName) =>
    set({ meta, isDirty: false, currentFileName: fileName ?? null }),

  newProject: (name = 'Untitled Project') =>
    set({ meta: defaultMeta(name), isDirty: false, currentFileName: null }),

  checkRestoreBanner: () =>
    set({ showRestoreBanner: checkHasAutoSave() }),

  dismissRestoreBanner: () =>
    set({ showRestoreBanner: false }),
}))
