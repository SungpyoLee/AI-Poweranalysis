/**
 * Diagram Library store — saves/loads SLD templates.
 *
 * Storage: localStorage key "pfa-diagrams" (JSON array, max 100 items)
 * Interface: DiagramRepository — swap for IndexedDB/Supabase/PostgreSQL later.
 */

import { create } from 'zustand'
import type { Node as RFNode, Edge as RFEdge } from 'reactflow'
import type { NodeData, EdgeData } from '../types'

// ── Types ──────────────────────────────────────────────────────────────────────

export interface DiagramTemplate {
  id:          string
  name:        string
  description: string
  createdAt:   string   // ISO-8601
  updatedAt:   string
  nodes:       RFNode<NodeData>[]
  edges:       RFEdge<EdgeData>[]
}

// Repository interface (allows future backend swap)
interface DiagramRepository {
  save(t: DiagramTemplate):                  void
  load(id: string):                          DiagramTemplate | null
  delete(id: string):                        void
  list():                                    DiagramTemplate[]
}

// ── localStorage implementation ────────────────────────────────────────────────

const LS_KEY = 'pfa-diagrams'
const MAX_ITEMS = 100

const localRepo: DiagramRepository = {
  save(t) {
    const items = localRepo.list()
    const idx   = items.findIndex(i => i.id === t.id)
    if (idx >= 0) items[idx] = t
    else          items.unshift(t)
    if (items.length > MAX_ITEMS) items.splice(MAX_ITEMS)
    try { localStorage.setItem(LS_KEY, JSON.stringify(items)) } catch { /* quota */ }
  },
  load(id) {
    return localRepo.list().find(i => i.id === id) ?? null
  },
  delete(id) {
    const items = localRepo.list().filter(i => i.id !== id)
    localStorage.setItem(LS_KEY, JSON.stringify(items))
  },
  list() {
    try {
      const raw = localStorage.getItem(LS_KEY)
      return raw ? (JSON.parse(raw) as DiagramTemplate[]) : []
    } catch { return [] }
  },
}

// ── Store ──────────────────────────────────────────────────────────────────────

interface LibraryState {
  templates:   DiagramTemplate[]
  searchQuery: string
}

interface LibraryActions {
  /** Save current diagram as a new template */
  saveTemplate(
    name: string,
    description: string,
    nodes: RFNode<NodeData>[],
    edges: RFEdge<EdgeData>[],
  ): DiagramTemplate

  /** Overwrite an existing template's nodes/edges */
  overwriteTemplate(
    id: string,
    nodes: RFNode<NodeData>[],
    edges: RFEdge<EdgeData>[],
  ): void

  renameTemplate(id: string, name: string, description?: string): void
  duplicateTemplate(id: string): DiagramTemplate | null
  deleteTemplate(id: string): void

  /** Reload list from localStorage (e.g. after external change) */
  refresh(): void
  setSearch(q: string): void

  /** Filtered view of templates */
  filtered(): DiagramTemplate[]
}

export type DiagramLibraryStore = LibraryState & LibraryActions

function uuid(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

export const useDiagramLibraryStore = create<DiagramLibraryStore>((set, get) => ({
  templates:   localRepo.list(),
  searchQuery: '',

  saveTemplate(name, description, nodes, edges) {
    const now = new Date().toISOString()
    const t: DiagramTemplate = {
      id: uuid(), name, description, createdAt: now, updatedAt: now, nodes, edges,
    }
    localRepo.save(t)
    set({ templates: localRepo.list() })
    return t
  },

  overwriteTemplate(id, nodes, edges) {
    const t = localRepo.load(id)
    if (!t) return
    localRepo.save({ ...t, nodes, edges, updatedAt: new Date().toISOString() })
    set({ templates: localRepo.list() })
  },

  renameTemplate(id, name, description) {
    const t = localRepo.load(id)
    if (!t) return
    localRepo.save({
      ...t,
      name,
      description: description ?? t.description,
      updatedAt: new Date().toISOString(),
    })
    set({ templates: localRepo.list() })
  },

  duplicateTemplate(id) {
    const t = localRepo.load(id)
    if (!t) return null
    const now = new Date().toISOString()
    const copy: DiagramTemplate = {
      ...t,
      id:          uuid(),
      name:        `${t.name} (복사본)`,
      createdAt:   now,
      updatedAt:   now,
    }
    localRepo.save(copy)
    set({ templates: localRepo.list() })
    return copy
  },

  deleteTemplate(id) {
    localRepo.delete(id)
    set({ templates: localRepo.list() })
  },

  refresh() {
    set({ templates: localRepo.list() })
  },

  setSearch(q) {
    set({ searchQuery: q })
  },

  filtered() {
    const { templates, searchQuery: q } = get()
    if (!q.trim()) return templates
    const lq = q.toLowerCase()
    return templates.filter(
      t => t.name.toLowerCase().includes(lq) || t.description.toLowerCase().includes(lq),
    )
  },
}))
