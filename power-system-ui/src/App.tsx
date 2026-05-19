import { useState, useCallback } from 'react'
import {
  Node, Edge, Connection, NodeChange, EdgeChange,
  addEdge, applyNodeChanges, applyEdgeChanges,
  ReactFlowProvider,
} from 'reactflow'
import 'reactflow/dist/style.css'

import Toolbar from './components/Toolbar'
import EquipmentPalette from './components/EquipmentPalette'
import PropertyPanel from './components/PropertyPanel'
import SLDCanvas from './components/SLDCanvas'

import BusNode from './nodes/BusNode'
import TransformerNode from './nodes/TransformerNode'
import BreakerNode from './nodes/BreakerNode'
import MotorNode from './nodes/MotorNode'
import GeneratorNode from './nodes/GeneratorNode'
import CableEdge from './edges/CableEdge'

import type { NodeData, EdgeData, EquipmentType, CableProperties } from './types'
import { defaultProps, defaultCableProps } from './types'
import { runLoadflow, runShortcircuit } from './api'
import { computeETAPLayout } from './utils/etapLayout'

// ── ReactFlow node/edge type registries ──────────────────────────────────────
const NODE_TYPES = {
  bus:         BusNode,
  transformer: TransformerNode,
  breaker:     BreakerNode,
  motor:       MotorNode,
  generator:   GeneratorNode,
} as const

const EDGE_TYPES = {
  cable: CableEdge,
} as const

// ── Example network (industrial plant 3-level SLD) ───────────────────────────
// Topology: 154kV Bus → [Gen, CB-T1→TR-1→22.9kV Bus → [CB-1→M1, CB-2→M2, CB-T2→TR-2→0.4kV Bus → [CB-3→M3, CB-4→M4]]]
const _RAW_NODES: Node<NodeData>[] = [
  { id: 'bus-hv',  type: 'bus', position: { x: 0, y: 0 },
    data: { equipmentType: 'bus', props: { name: '154kV Main Bus', vn_kv: 154, busType: 'Slack' } } },
  { id: 'gen-1',   type: 'generator', position: { x: 0, y: 0 },
    data: { equipmentType: 'generator', props: { name: 'G-1', p_mw: 30, vn_kv: 11, pf: 0.9, vm_pu: 1.02 } } },
  { id: 'cb-t1',   type: 'breaker', position: { x: 0, y: 0 },
    data: { equipmentType: 'breaker', props: { name: 'CB-T1', rated_kA: 40, is_closed: true, interrupt_kA: 40 } } },
  { id: 'tr-1',    type: 'transformer', position: { x: 0, y: 0 },
    data: { equipmentType: 'transformer', props: { name: 'TR-1', sn_mva: 30, vn_hv_kv: 154, vn_lv_kv: 22.9, vk_percent: 12, xr_ratio: 10 } } },
  { id: 'bus-mv',  type: 'bus', position: { x: 0, y: 0 },
    data: { equipmentType: 'bus', props: { name: '22.9kV Bus', vn_kv: 22.9, busType: 'PQ' } } },
  { id: 'cb-1',    type: 'breaker', position: { x: 0, y: 0 },
    data: { equipmentType: 'breaker', props: { name: 'CB-1', rated_kA: 25, is_closed: true, interrupt_kA: 25 } } },
  { id: 'mot-1',   type: 'motor', position: { x: 0, y: 0 },
    data: { equipmentType: 'motor', props: { name: 'M-1', p_kw: 2000, vn_kv: 22.9, pf: 0.85, efficiency: 94 } } },
  { id: 'cb-2',    type: 'breaker', position: { x: 0, y: 0 },
    data: { equipmentType: 'breaker', props: { name: 'CB-2', rated_kA: 25, is_closed: true, interrupt_kA: 25 } } },
  { id: 'mot-2',   type: 'motor', position: { x: 0, y: 0 },
    data: { equipmentType: 'motor', props: { name: 'M-2', p_kw: 1500, vn_kv: 22.9, pf: 0.85, efficiency: 93 } } },
  { id: 'cb-t2',   type: 'breaker', position: { x: 0, y: 0 },
    data: { equipmentType: 'breaker', props: { name: 'CB-T2', rated_kA: 25, is_closed: true, interrupt_kA: 25 } } },
  { id: 'tr-2',    type: 'transformer', position: { x: 0, y: 0 },
    data: { equipmentType: 'transformer', props: { name: 'TR-2', sn_mva: 2, vn_hv_kv: 22.9, vn_lv_kv: 0.4, vk_percent: 6, xr_ratio: 6 } } },
  { id: 'bus-lv',  type: 'bus', position: { x: 0, y: 0 },
    data: { equipmentType: 'bus', props: { name: '0.4kV MCC Bus', vn_kv: 0.4, busType: 'PQ' } } },
  { id: 'cb-3',    type: 'breaker', position: { x: 0, y: 0 },
    data: { equipmentType: 'breaker', props: { name: 'CB-3', rated_kA: 10, is_closed: true, interrupt_kA: 10 } } },
  { id: 'mot-3',   type: 'motor', position: { x: 0, y: 0 },
    data: { equipmentType: 'motor', props: { name: 'M-3', p_kw: 75, vn_kv: 0.4, pf: 0.85, efficiency: 90 } } },
  { id: 'cb-4',    type: 'breaker', position: { x: 0, y: 0 },
    data: { equipmentType: 'breaker', props: { name: 'CB-4', rated_kA: 10, is_closed: true, interrupt_kA: 10 } } },
  { id: 'mot-4',   type: 'motor', position: { x: 0, y: 0 },
    data: { equipmentType: 'motor', props: { name: 'M-4', p_kw: 45, vn_kv: 0.4, pf: 0.85, efficiency: 90 } } },
]

function cable(name: string, len: number, r: number, x: number, iMax: number) {
  return { props: { name, length_km: len, r_ohm_per_km: r, x_ohm_per_km: x, max_i_ka: iMax } }
}
const _RAW_EDGES: Edge<EdgeData>[] = [
  { id: 'e-hv-gen',   source: 'bus-hv', target: 'gen-1',  type: 'cable', data: cable('GC-1', 0.05, 0.05, 0.05, 2.0) },
  { id: 'e-hv-cbt1',  source: 'bus-hv', target: 'cb-t1',  type: 'cable', data: cable('HV-F1', 0.1, 0.08, 0.08, 1.0) },
  { id: 'e-cbt1-tr1', source: 'cb-t1',  target: 'tr-1',   type: 'cable', data: cable('TC-1', 0.05, 0.05, 0.05, 1.0) },
  { id: 'e-tr1-mv',   source: 'tr-1',   target: 'bus-mv', type: 'cable', data: cable('TC-1b', 0.05, 0.05, 0.05, 1.0) },
  { id: 'e-mv-cb1',   source: 'bus-mv', target: 'cb-1',   type: 'cable', data: cable('MV-F1', 0.3, 0.164, 0.1, 0.8) },
  { id: 'e-cb1-m1',   source: 'cb-1',   target: 'mot-1',  type: 'cable', data: cable('MC-1', 0.1, 0.164, 0.1, 0.8) },
  { id: 'e-mv-cb2',   source: 'bus-mv', target: 'cb-2',   type: 'cable', data: cable('MV-F2', 0.3, 0.164, 0.1, 0.6) },
  { id: 'e-cb2-m2',   source: 'cb-2',   target: 'mot-2',  type: 'cable', data: cable('MC-2', 0.1, 0.164, 0.1, 0.6) },
  { id: 'e-mv-cbt2',  source: 'bus-mv', target: 'cb-t2',  type: 'cable', data: cable('MV-F3', 0.2, 0.164, 0.1, 0.5) },
  { id: 'e-cbt2-tr2', source: 'cb-t2',  target: 'tr-2',   type: 'cable', data: cable('TC-2', 0.05, 0.05, 0.05, 0.5) },
  { id: 'e-tr2-lv',   source: 'tr-2',   target: 'bus-lv', type: 'cable', data: cable('TC-2b', 0.05, 0.08, 0.08, 0.5) },
  { id: 'e-lv-cb3',   source: 'bus-lv', target: 'cb-3',   type: 'cable', data: cable('LV-F1', 0.05, 0.2, 0.08, 0.3) },
  { id: 'e-cb3-m3',   source: 'cb-3',   target: 'mot-3',  type: 'cable', data: cable('MC-3', 0.05, 0.2, 0.08, 0.3) },
  { id: 'e-lv-cb4',   source: 'bus-lv', target: 'cb-4',   type: 'cable', data: cable('LV-F2', 0.05, 0.2, 0.08, 0.2) },
  { id: 'e-cb4-m4',   source: 'cb-4',   target: 'mot-4',  type: 'cable', data: cable('MC-4', 0.05, 0.2, 0.08, 0.2) },
]

// Apply ETAP layout to example at module load time
const { nodes: EXAMPLE_NODES, edges: EXAMPLE_EDGES } = computeETAPLayout(_RAW_NODES, _RAW_EDGES)

let _nodeId = 100

// ── App ──────────────────────────────────────────────────────────────────────
function AppInner() {
  const [nodes, setNodes] = useState<Node<NodeData>[]>([])
  const [edges, setEdges] = useState<Edge<EdgeData>[]>([])
  const [selectedNode, setSelectedNode] = useState<Node<NodeData> | null>(null)
  const [selectedEdge, setSelectedEdge] = useState<Edge<EdgeData> | null>(null)
  const [loading, setLoading]           = useState(false)
  const [loadingLabel, setLoadingLabel] = useState('')
  const [converged, setConverged]       = useState<boolean | null>(null)
  const [error, setError]               = useState<string | null>(null)

  // ── Palette drag ────────────────────────────────────────────────────────────
  const onDragStart = useCallback((e: React.DragEvent, type: EquipmentType) => {
    e.dataTransfer.setData('application/reactflow', type)
    e.dataTransfer.effectAllowed = 'move'
  }, [])

  // ── Drop on canvas ──────────────────────────────────────────────────────────
  const onDropEquipment = useCallback((type: EquipmentType, position: { x: number; y: number }) => {
    const id = `${type}-${++_nodeId}`
    const newNode: Node<NodeData> = {
      id,
      type,
      position,
      data: { equipmentType: type, props: defaultProps(type) },
    }
    setNodes(ns => [...ns, newNode])
  }, [])

  // ── ReactFlow change handlers ───────────────────────────────────────────────
  const onNodesChange = useCallback((changes: NodeChange[]) => {
    setNodes(ns => applyNodeChanges(changes.filter(c => c.type !== 'remove'), ns))
    setSelectedNode(prev => {
      if (!prev) return null
      const removed = changes.find(c => c.type === 'remove' && (c as any).id === prev.id)
      return removed ? null : prev
    })
  }, [])

  const onEdgesChange = useCallback((changes: EdgeChange[]) => {
    setEdges(es => applyEdgeChanges(changes.filter(c => c.type !== 'remove'), es))
  }, [])

  const onConnect = useCallback((conn: Connection) => {
    const cable = defaultCableProps()
    setEdges(es => addEdge({
      ...conn,
      type: 'cable',
      data: { props: cable },
    } as Edge<EdgeData>, es))
  }, [])

  // ── Selection ───────────────────────────────────────────────────────────────
  const onNodeClick = useCallback((node: Node<NodeData>) => {
    setSelectedNode(node)
    setSelectedEdge(null)
  }, [])

  const onEdgeClick = useCallback((edge: Edge<EdgeData>) => {
    setSelectedEdge(edge)
    setSelectedNode(null)
  }, [])

  const onPaneClick = useCallback(() => {
    setSelectedNode(null)
    setSelectedEdge(null)
  }, [])

  // ── Property updates ────────────────────────────────────────────────────────
  const onUpdateNode = useCallback((id: string, props: NodeData['props']) => {
    setNodes(ns => ns.map(n => n.id === id ? { ...n, data: { ...n.data, props } } : n))
    setSelectedNode(prev => prev?.id === id ? { ...prev, data: { ...prev.data, props } } : prev)
  }, [])

  const onUpdateEdge = useCallback((id: string, props: CableProperties) => {
    setEdges(es => es.map(e => e.id === id ? { ...e, data: { props } } : e))
    setSelectedEdge(prev => prev?.id === id ? { ...prev, data: { props } } : prev)
  }, [])

  const onDeleteNode = useCallback((id: string) => {
    setNodes(ns => ns.filter(n => n.id !== id))
    setEdges(es => es.filter(e => e.source !== id && e.target !== id))
    setSelectedNode(null)
  }, [])

  const onDeleteEdge = useCallback((id: string) => {
    setEdges(es => es.filter(e => e.id !== id))
    setSelectedEdge(null)
  }, [])

  // ── Auto Layout ─────────────────────────────────────────────────────────────
  const handleAutoLayout = useCallback(() => {
    const { nodes: ln, edges: le } = computeETAPLayout(nodes, edges)
    setNodes(ln)
    setEdges(le as Edge<EdgeData>[])
    setSelectedNode(null)
    setSelectedEdge(null)
  }, [nodes, edges])

  // ── Toolbar actions ─────────────────────────────────────────────────────────
  const handleLoadExample = useCallback(() => {
    setNodes(EXAMPLE_NODES)
    setEdges(EXAMPLE_EDGES)
    setSelectedNode(null)
    setSelectedEdge(null)
    setConverged(null)
    setError(null)
  }, [])

  const handleClear = useCallback(() => {
    setNodes([])
    setEdges([])
    setSelectedNode(null)
    setSelectedEdge(null)
    setConverged(null)
    setError(null)
  }, [])

  const handleRunLoadflow = useCallback(async () => {
    if (nodes.length === 0) return
    setLoading(true); setLoadingLabel('Load Flow'); setError(null)
    try {
      const result = await runLoadflow(buildNetworkPayload(nodes, edges))
      setConverged(result.converged)
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [nodes, edges])

  const handleRunShortcircuit = useCallback(async () => {
    if (nodes.length === 0) return
    setLoading(true); setLoadingLabel('Short-Circuit'); setError(null)
    try {
      await runShortcircuit(buildNetworkPayload(nodes, edges))
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [nodes, edges])

  return (
    <div style={{
      display: 'grid',
      gridTemplateRows: 'auto 1fr auto',
      gridTemplateColumns: '180px 1fr 260px',
      height: '100vh',
      overflow: 'hidden',
      fontFamily: "'Segoe UI', 'Malgun Gothic', Arial, sans-serif",
    }}>
      {/* ── Toolbar (full width) ─── */}
      <div style={{ gridColumn: '1 / -1' }}>
        <Toolbar
          onLoadExample={handleLoadExample}
          onClear={handleClear}
          onAutoLayout={handleAutoLayout}
          onRunLoadflow={handleRunLoadflow}
          onRunShortcircuit={handleRunShortcircuit}
          loading={loading}
          loadingLabel={loadingLabel}
          converged={converged}
          nodeCount={nodes.length}
          edgeCount={edges.length}
        />
        {error && (
          <div style={{
            background: '#fce8e8', borderBottom: '1px solid #e09090',
            padding: '4px 12px', fontSize: 11, color: '#800000',
            display: 'flex', alignItems: 'center', gap: 8,
          }}>
            <span style={{ background: '#c02020', color: '#fff', padding: '1px 6px', borderRadius: 1, fontSize: 10, fontWeight: 700 }}>
              ERROR
            </span>
            <span style={{ flex: 1 }}>{error}</span>
            <button onClick={() => setError(null)} style={{ background: 'none', border: 'none', color: '#800000', cursor: 'pointer', fontSize: 14 }}>✕</button>
          </div>
        )}
      </div>

      {/* ── Equipment Palette ─── */}
      <EquipmentPalette onDragStart={onDragStart} />

      {/* ── Canvas ─── */}
      <SLDCanvas
        nodes={nodes}
        edges={edges}
        nodeTypes={NODE_TYPES}
        edgeTypes={EDGE_TYPES}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onNodeClick={onNodeClick}
        onEdgeClick={onEdgeClick}
        onPaneClick={onPaneClick}
        onDropEquipment={onDropEquipment}
      />

      {/* ── Property Panel ─── */}
      <PropertyPanel
        selectedNode={selectedNode}
        selectedEdge={selectedEdge}
        onUpdateNode={onUpdateNode}
        onUpdateEdge={onUpdateEdge}
        onDeleteNode={onDeleteNode}
        onDeleteEdge={onDeleteEdge}
      />

      {/* ── Status bar (full width) ─── */}
      <div style={{
        gridColumn: '1 / -1',
        display: 'flex',
        alignItems: 'center',
        height: 22,
        background: 'linear-gradient(to bottom, #c4ccd6 0%, #b4bec8 100%)',
        borderTop: '1px solid #8a9aaa',
        fontSize: 10,
        fontFamily: 'Consolas, monospace',
        color: '#4a5a6a',
        padding: '0 10px',
        gap: 0,
      }}>
        {[
          ['Buses',       nodes.filter(n => n.type === 'bus').length],
          ['Transformers', nodes.filter(n => n.type === 'transformer').length],
          ['Breakers',    nodes.filter(n => n.type === 'breaker').length],
          ['Motors',      nodes.filter(n => n.type === 'motor').length],
          ['Generators',  nodes.filter(n => n.type === 'generator').length],
          ['Cables',      edges.length],
        ].map(([label, val]) => (
          <div key={label as string} style={{ padding: '0 10px', borderRight: '1px solid #9aaabb', display: 'flex', gap: 5 }}>
            <span style={{ color: '#7a8898' }}>{label}</span>
            <span style={{ fontWeight: 600, color: '#1a2838' }}>{val}</span>
          </div>
        ))}
        <div style={{ marginLeft: 'auto', color: '#8a9aab' }}>
          IEC 60909 · Grid Snap {20}px · PowerFlow Analyzer
        </div>
      </div>
    </div>
  )
}

// ── Network payload builder (maps React state → API format) ─────────────────
function buildNetworkPayload(nodes: Node<NodeData>[], edges: Edge<EdgeData>[]) {
  const buses = nodes.filter(n => n.type === 'bus').map((n, i) => ({
    id: i + 1,
    name: (n.data.props as any).name,
    vn_kv: (n.data.props as any).vn_kv,
    type: (n.data.props as any).busType === 'Slack' ? 'b' : 'b',
    _nodeId: n.id,
  }))
  const busIdMap = Object.fromEntries(buses.map((b, i) => [b._nodeId, i + 1]))

  return {
    name: 'PowerFlow Network',
    f_hz: 60,
    buses: buses.map(({ _nodeId, ...b }) => b),
    external_grids: nodes.filter(n => n.type === 'bus' && (n.data.props as any).busType === 'Slack').map(n => ({
      bus_id: busIdMap[n.id], name: 'Grid', vm_pu: 1.0, va_degree: 0,
      s_sc_max_mva: 2000, s_sc_min_mva: 1500, rx_max: 0.1, rx_min: 0.1,
    })),
    loads: nodes.filter(n => n.type === 'motor').map(n => ({
      bus_id: busIdMap[findConnectedBus(n.id, edges, nodes)],
      name: (n.data.props as any).name,
      p_mw: (n.data.props as any).p_kw / 1000,
      q_mvar: (n.data.props as any).p_kw / 1000 * Math.tan(Math.acos((n.data.props as any).pf)),
    })).filter(l => l.bus_id),
    generators: nodes.filter(n => n.type === 'generator').map(n => ({
      bus_id: busIdMap[findConnectedBus(n.id, edges, nodes)],
      name: (n.data.props as any).name,
      p_mw: (n.data.props as any).p_mw,
      vm_pu: (n.data.props as any).vm_pu,
      max_q_mvar: 999, min_q_mvar: -999,
    })).filter(g => g.bus_id),
    lines: edges.filter(e => {
      const src = nodes.find(n => n.id === e.source)
      const tgt = nodes.find(n => n.id === e.target)
      return src?.type === 'bus' && tgt?.type === 'bus'
    }).map(e => ({
      from_bus_id: busIdMap[e.source],
      to_bus_id:   busIdMap[e.target],
      name: (e.data as any)?.props?.name ?? e.id,
      length_km: (e.data as any)?.props?.length_km ?? 1,
      r_ohm_per_km: (e.data as any)?.props?.r_ohm_per_km ?? 0.164,
      x_ohm_per_km: (e.data as any)?.props?.x_ohm_per_km ?? 0.1,
      c_nf_per_km: 0,
      max_i_ka: (e.data as any)?.props?.max_i_ka ?? 0.5,
    })),
    transformers: nodes.filter(n => n.type === 'transformer').map(n => {
      const connectedBuses = findConnectedBuses(n.id, edges, nodes)
      if (connectedBuses.length < 2) return null
      const p = n.data.props as any
      return {
        hv_bus_id: busIdMap[connectedBuses[0]],
        lv_bus_id: busIdMap[connectedBuses[1]],
        name: p.name,
        sn_mva: p.sn_mva,
        vn_hv_kv: p.vn_hv_kv,
        vn_lv_kv: p.vn_lv_kv,
        vk_percent: p.vk_percent,
        vkr_percent: 0.5,
        pfe_kw: 0,
        i0_percent: 0,
      }
    }).filter(Boolean),
  }
}

function findConnectedBus(nodeId: string, edges: Edge[], nodes: Node[]): string {
  const connected = edges
    .filter(e => e.source === nodeId || e.target === nodeId)
    .map(e => e.source === nodeId ? e.target : e.source)
    .find(id => nodes.find(n => n.id === id && n.type === 'bus'))
  return connected ?? ''
}

function findConnectedBuses(nodeId: string, edges: Edge[], nodes: Node[]): string[] {
  return edges
    .filter(e => e.source === nodeId || e.target === nodeId)
    .map(e => e.source === nodeId ? e.target : e.source)
    .filter(id => nodes.find(n => n.id === id && n.type === 'bus'))
}

export default function App() {
  return (
    <ReactFlowProvider>
      <AppInner />
    </ReactFlowProvider>
  )
}
