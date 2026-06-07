import { create } from 'zustand'
import {
  applyNodeChanges as rfApplyNodeChanges,
  applyEdgeChanges as rfApplyEdgeChanges,
  addEdge as rfAddEdge,
} from 'reactflow'
import type { Node, Edge, Connection, NodeChange, EdgeChange } from 'reactflow'
import type { NodeData, EdgeData, Equipment, Cable, EquipmentType, Motor, MotorGroup } from '../types'
import { defaultEquipment, defaultCable } from '../types'
import { computeETAPLayout } from '../utils/etapLayout'
import { EXAMPLE_NODES, EXAMPLE_EDGES } from '../data/exampleNetwork'

let _nodeCounter = 100
let _edgeCounter = 100

const MAX_HISTORY = 50

interface Snapshot {
  nodes: Node<NodeData>[]
  edges: Edge<EdgeData>[]
}

// ── 상태 ──────────────────────────────────────────────────────────────────────
interface EquipmentState {
  nodes:              Node<NodeData>[]
  edges:              Edge<EdgeData>[]
  selectedNodeId:     string | null
  selectedEdgeId:     string | null
  activeMotorGroupId: string | null
  contextMenu:        { pos: { x: number; y: number }; motorIds: string[] } | null
  groupEditMenu:      { pos: { x: number; y: number }; groupId: string }   | null
  highlightedIds:     Set<string>        // #12 Bus 연결 장비 하이라이트
  resultFocusId:      string | null      // ResultsPanel 행 클릭 → 캔버스 포커스
  _past:              Snapshot[]         // #1 undo history
  _future:            Snapshot[]         // #1 redo history
}

// ── 액션 ──────────────────────────────────────────────────────────────────────
interface EquipmentActions {
  applyNodeChanges: (changes: NodeChange[]) => void
  applyEdgeChanges: (changes: EdgeChange[]) => void

  // 노드 CRUD
  dropEquipment:   (type: EquipmentType, position: { x: number; y: number }) => void
  updateEquipment: (nodeId: string, equipment: Equipment) => void
  deleteNode:      (nodeId: string) => void
  deleteNodes:     (nodeIds: string[]) => void  // #8 multi-select

  // 엣지 CRUD
  connectNodes:    (connection: Connection) => void
  updateCable:     (edgeId: string, cable: Cable) => void
  deleteEdge:      (edgeId: string) => void

  // 선택
  selectNode:      (id: string | null) => void
  selectEdge:      (id: string | null) => void
  clearSelection:  () => void

  // 셀렉터
  getSelectedNode: () => Node<NodeData> | null
  getSelectedEdge: () => Edge<EdgeData> | null

  // Bulk
  loadExample:     () => void
  loadNetwork:     (nodes: Node<NodeData>[], edges: Edge<EdgeData>[]) => void
  importNodes:     (nodes: Node<NodeData>[], edges: Edge<EdgeData>[]) => void
  clear:           () => void
  applyETAPLayout: () => void

  // #1 Undo / Redo
  undo:    () => void
  redo:    () => void
  canUndo: () => boolean
  canRedo: () => boolean

  // #12 Bus 연결 하이라이트
  setHighlightedIds: (ids: Set<string>) => void

  // ResultsPanel → 캔버스 포커스
  focusResultNode: (id: string | null) => void

  // Motor Group
  groupMotors:          (motorIds: string[], groupName: string) => void
  ungroupMotors:        (groupId: string) => void
  setActiveMotorGroup:  (id: string | null) => void
  openContextMenu:      (motorIds: string[], pos: { x: number; y: number }) => void
  closeContextMenu:     () => void
  openGroupEditMenu:    (groupId: string, pos: { x: number; y: number }) => void
  closeGroupEditMenu:   () => void
  addMotorsToGroup:     (groupId: string, motorIds: string[]) => void
}

export type EquipmentStore = EquipmentState & EquipmentActions

// ── Helper: 히스토리 스냅샷 저장 ─────────────────────────────────────────────
function pushHistory(state: EquipmentState, past: Snapshot[]): Snapshot[] {
  const entry: Snapshot = { nodes: state.nodes, edges: state.edges }
  const next = [...past, entry]
  return next.length > MAX_HISTORY ? next.slice(next.length - MAX_HISTORY) : next
}

// ── 스토어 ───────────────────────────────────────────────────────────────────
export const useEquipmentStore = create<EquipmentStore>((set, get) => ({
  nodes:              [],
  edges:              [],
  selectedNodeId:     null,
  selectedEdgeId:     null,
  activeMotorGroupId: null,
  contextMenu:        null,
  groupEditMenu:      null,
  highlightedIds:     new Set<string>(),
  resultFocusId:      null,
  _past:              [],
  _future:            [],

  // ── ReactFlow 내부 변경 ──────────────────────────────────────────────────────
  applyNodeChanges: (changes) => set(s => {
    const safeChanges = changes.filter(c => c.type !== 'remove')
    return { nodes: rfApplyNodeChanges(safeChanges, s.nodes) }
  }),

  applyEdgeChanges: (changes) => set(s => {
    const safeChanges = changes.filter(c => c.type !== 'remove')
    return { edges: rfApplyEdgeChanges(safeChanges, s.edges) }
  }),

  // ── 노드 CRUD ────────────────────────────────────────────────────────────────
  dropEquipment: (type, position) => {
    const id = `${type}-${++_nodeCounter}`
    const newNode: Node<NodeData> = {
      id, type, position,
      data: { equipment: defaultEquipment(type, id) },
    }
    set(s => ({
      _past:          pushHistory(s, s._past),
      _future:        [],
      nodes:          [...s.nodes, newNode],
      selectedNodeId: id,          // #6 신규 노드 자동 선택
      selectedEdgeId: null,
    }))
  },

  updateEquipment: (nodeId, equipment) => set(s => ({
    _past:   pushHistory(s, s._past),
    _future: [],
    nodes:   s.nodes.map(n =>
      n.id === nodeId ? { ...n, data: { ...n.data, equipment } } : n
    ),
  })),

  deleteNode: (nodeId) => set(s => {
    const affectedEdgeIds = new Set(
      s.edges
        .filter(e => e.source === nodeId || e.target === nodeId)
        .map(e => e.id)
    )
    return {
      _past:          pushHistory(s, s._past),
      _future:        [],
      nodes:          s.nodes.filter(n => n.id !== nodeId),
      edges:          s.edges.filter(e => !affectedEdgeIds.has(e.id)),
      selectedNodeId: s.selectedNodeId === nodeId ? null : s.selectedNodeId,
      selectedEdgeId: affectedEdgeIds.has(s.selectedEdgeId ?? '') ? null : s.selectedEdgeId,
    }
  }),

  // #8 Multi-select delete
  deleteNodes: (nodeIds) => {
    if (nodeIds.length === 0) return
    set(s => {
      const idSet = new Set(nodeIds)
      const affectedEdgeIds = new Set(
        s.edges
          .filter(e => idSet.has(e.source) || idSet.has(e.target))
          .map(e => e.id)
      )
      return {
        _past:          pushHistory(s, s._past),
        _future:        [],
        nodes:          s.nodes.filter(n => !idSet.has(n.id)),
        edges:          s.edges.filter(e => !affectedEdgeIds.has(e.id)),
        selectedNodeId: idSet.has(s.selectedNodeId ?? '') ? null : s.selectedNodeId,
        selectedEdgeId: affectedEdgeIds.has(s.selectedEdgeId ?? '') ? null : s.selectedEdgeId,
      }
    })
  },

  // ── 엣지 CRUD ────────────────────────────────────────────────────────────────
  connectNodes: (connection) => {
    const id = `e-${++_edgeCounter}`
    set(s => ({
      _past:   pushHistory(s, s._past),
      _future: [],
      edges:   rfAddEdge(
        { ...connection, id, type: 'cable', data: { cable: defaultCable(id) } } as Edge<EdgeData>,
        s.edges
      ),
    }))
  },

  updateCable: (edgeId, cable) => set(s => ({
    _past:   pushHistory(s, s._past),
    _future: [],
    edges:   s.edges.map(e => e.id === edgeId ? { ...e, data: { cable } } : e),
  })),

  deleteEdge: (edgeId) => set(s => ({
    _past:          pushHistory(s, s._past),
    _future:        [],
    edges:          s.edges.filter(e => e.id !== edgeId),
    selectedEdgeId: s.selectedEdgeId === edgeId ? null : s.selectedEdgeId,
  })),

  // ── 선택 ─────────────────────────────────────────────────────────────────────
  selectNode: (id) => set(s => {
    // #12 Bus 연결 하이라이트 계산
    let highlighted = new Set<string>()
    if (id) {
      const node = s.nodes.find(n => n.id === id)
      if (node?.type === 'bus') {
        s.edges.forEach(e => {
          if (e.source === id) highlighted.add(e.target)
          if (e.target === id) highlighted.add(e.source)
        })
      }
    }
    return { selectedNodeId: id, selectedEdgeId: null, highlightedIds: highlighted }
  }),
  selectEdge:        (id) => set({ selectedEdgeId: id, selectedNodeId: null, highlightedIds: new Set() }),
  clearSelection:    ()   => set({ selectedNodeId: null, selectedEdgeId: null, highlightedIds: new Set() }),

  getSelectedNode: () => {
    const { nodes, selectedNodeId } = get()
    return nodes.find(n => n.id === selectedNodeId) ?? null
  },

  getSelectedEdge: () => {
    const { edges, selectedEdgeId } = get()
    return edges.find(e => e.id === selectedEdgeId) ?? null
  },

  // ── Bulk 작업 ─────────────────────────────────────────────────────────────────
  loadExample: () => set({
    _past:          [],
    _future:        [],
    nodes:          [...EXAMPLE_NODES],
    edges:          [...EXAMPLE_EDGES] as Edge<EdgeData>[],
    selectedNodeId: null,
    selectedEdgeId: null,
    highlightedIds: new Set(),
  }),

  loadNetwork: (nodes, edges) => set({
    _past:          [],
    _future:        [],
    nodes,
    edges,
    selectedNodeId: null,
    selectedEdgeId: null,
    highlightedIds: new Set(),
  }),

  importNodes: (newNodes, newEdges) => set(s => ({
    _past:   pushHistory(s, s._past),
    _future: [],
    nodes:   [...s.nodes, ...newNodes],
    edges:   [...s.edges, ...newEdges],
  })),

  clear: () => set({
    _past:          [],
    _future:        [],
    nodes:          [],
    edges:          [],
    selectedNodeId: null,
    selectedEdgeId: null,
    highlightedIds: new Set(),
  }),

  applyETAPLayout: () => {
    const { nodes, edges } = get()
    if (nodes.length === 0) return
    const { nodes: ln, edges: le } = computeETAPLayout(nodes, edges)
    set(s => ({
      _past:          pushHistory(s, s._past),
      _future:        [],
      nodes:          ln,
      edges:          le as Edge<EdgeData>[],
      selectedNodeId: null,
      selectedEdgeId: null,
      highlightedIds: new Set(),
    }))
  },

  // ── #1 Undo / Redo ────────────────────────────────────────────────────────────
  undo: () => set(s => {
    if (s._past.length === 0) return s
    const snapshot = s._past[s._past.length - 1]
    return {
      _past:          s._past.slice(0, -1),
      _future:        [{ nodes: s.nodes, edges: s.edges }, ...s._future].slice(0, MAX_HISTORY),
      nodes:          snapshot.nodes,
      edges:          snapshot.edges,
      selectedNodeId: null,
      selectedEdgeId: null,
      highlightedIds: new Set(),
    }
  }),

  redo: () => set(s => {
    if (s._future.length === 0) return s
    const snapshot = s._future[0]
    return {
      _past:          [...s._past, { nodes: s.nodes, edges: s.edges }].slice(-MAX_HISTORY),
      _future:        s._future.slice(1),
      nodes:          snapshot.nodes,
      edges:          snapshot.edges,
      selectedNodeId: null,
      selectedEdgeId: null,
      highlightedIds: new Set(),
    }
  }),

  canUndo: () => get()._past.length > 0,
  canRedo: () => get()._future.length > 0,

  // ── #12 하이라이트 ────────────────────────────────────────────────────────────
  setHighlightedIds: (ids) => set({ highlightedIds: ids }),

  // ── ResultsPanel → 캔버스 포커스 ─────────────────────────────────────────────
  focusResultNode: (id) => set(s => ({
    resultFocusId:  id,
    selectedNodeId: id ?? s.selectedNodeId,
    selectedEdgeId: null,
    highlightedIds: id ? (() => {
      const highlighted = new Set<string>()
      const node = s.nodes.find(n => n.id === id)
      if (node?.type === 'bus') {
        s.edges.forEach(e => {
          if (e.source === id) highlighted.add(e.target)
          if (e.target === id) highlighted.add(e.source)
        })
      }
      return highlighted
    })() : new Set<string>(),
  })),

  // ── Motor Group ───────────────────────────────────────────────────────────────
  groupMotors: (motorIds, groupName) => {
    if (motorIds.length === 0) return
    const { nodes, edges } = get()

    const motorNodes = nodes.filter(n => motorIds.includes(n.id))
    const cx = motorNodes.reduce((s, n) => s + n.position.x, 0) / motorNodes.length
    const cy = motorNodes.reduce((s, n) => s + n.position.y, 0) / motorNodes.length
    const GRID = 20
    const pos = {
      x: Math.round(cx / GRID) * GRID,
      y: Math.round(cy / GRID) * GRID,
    }

    const groupId = `motorGroup-${Date.now()}`
    const groupEquipment: MotorGroup = {
      equipmentType: 'motorGroup',
      id: groupId, name: groupName, description: '', in_service: true,
      motorIds,
    }
    const groupNode: Node<NodeData> = {
      id: groupId, type: 'motorGroup', position: pos,
      data: { equipment: groupEquipment },
    }

    const edgeIdsToHide = new Set<string>()
    const updatedNodes = nodes.map(n => {
      if (!motorIds.includes(n.id)) return n
      const motor = n.data.equipment as Motor
      return { ...n, hidden: true, data: { ...n.data, equipment: { ...motor, groupId } } }
    })
    edges.forEach(e => {
      if (motorIds.includes(e.source) || motorIds.includes(e.target)) edgeIdsToHide.add(e.id)
    })
    const updatedEdges = edges.map(e => edgeIdsToHide.has(e.id) ? { ...e, hidden: true } : e)

    set(s => ({
      _past:          pushHistory(s, s._past),
      _future:        [],
      nodes:          [...updatedNodes, groupNode],
      edges:          updatedEdges,
      selectedNodeId: null,
      selectedEdgeId: null,
      contextMenu:    null,
      highlightedIds: new Set(),
    }))
  },

  ungroupMotors: (groupId) => {
    const { nodes, edges } = get()
    const groupNode = nodes.find(n => n.id === groupId)
    if (!groupNode) return
    const group = groupNode.data.equipment as MotorGroup
    const motorIds = new Set(group.motorIds)

    const updatedNodes = nodes
      .filter(n => n.id !== groupId)
      .map(n => {
        if (!motorIds.has(n.id)) return n
        const motor = n.data.equipment as Motor
        const { groupId: _gid, ...rest } = motor as Motor & { groupId?: string }
        return { ...n, hidden: false, data: { ...n.data, equipment: { ...rest } } }
      })

    const updatedEdges = edges.map(e =>
      (motorIds.has(e.source) || motorIds.has(e.target)) ? { ...e, hidden: false } : e
    )

    set(s => ({
      _past:          pushHistory(s, s._past),
      _future:        [],
      nodes:          updatedNodes,
      edges:          updatedEdges,
      selectedNodeId: null,
      highlightedIds: new Set(),
    }))
  },

  setActiveMotorGroup:  (id) => set({ activeMotorGroupId: id }),
  openContextMenu:      (motorIds, pos) => set({ contextMenu: { motorIds, pos } }),
  closeContextMenu:     () => set({ contextMenu: null }),
  openGroupEditMenu:    (groupId, pos) => set({ groupEditMenu: { groupId, pos } }),
  closeGroupEditMenu:   () => set({ groupEditMenu: null }),

  addMotorsToGroup: (groupId, newMotorIds) => {
    if (newMotorIds.length === 0) return
    const { nodes, edges } = get()

    const edgeIdsToHide = new Set<string>()
    const updatedNodes = nodes.map(n => {
      if (n.id === groupId) {
        const group = n.data.equipment as MotorGroup
        return {
          ...n,
          data: { ...n.data, equipment: { ...group, motorIds: [...group.motorIds, ...newMotorIds] } },
        }
      }
      if (newMotorIds.includes(n.id)) {
        const motor = n.data.equipment as Motor
        return { ...n, hidden: true, data: { ...n.data, equipment: { ...motor, groupId } } }
      }
      return n
    })
    edges.forEach(e => {
      if (newMotorIds.includes(e.source) || newMotorIds.includes(e.target)) edgeIdsToHide.add(e.id)
    })
    const updatedEdges = edges.map(e => edgeIdsToHide.has(e.id) ? { ...e, hidden: true } : e)

    set(s => ({
      _past:          pushHistory(s, s._past),
      _future:        [],
      nodes:          updatedNodes,
      edges:          updatedEdges,
      groupEditMenu:  null,
    }))
  },
}))
