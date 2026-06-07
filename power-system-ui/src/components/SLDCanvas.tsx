import { useCallback, useEffect, useRef, useState } from 'react'
import ReactFlow, {
  Background, BackgroundVariant, Controls, MiniMap,
  Node, Edge, Connection, NodeChange, EdgeChange,
  useReactFlow,
} from 'reactflow'
import type { NodeData, EdgeData, EquipmentType } from '../types'
import { CONNECTION_RULES } from '../types'
import { useEquipmentStore } from '../store/useEquipmentStore'
import { showToast } from '../store/useToastStore'

const GRID = 20

interface Props {
  nodes: Node<NodeData>[]
  edges: Edge<EdgeData>[]
  nodeTypes: Record<string, React.ComponentType<any>>
  edgeTypes:  Record<string, React.ComponentType<any>>
  onNodesChange:       (changes: NodeChange[]) => void
  onEdgesChange:       (changes: EdgeChange[]) => void
  onConnect:           (conn: Connection) => void
  onNodeClick:         (node: Node<NodeData>) => void
  onEdgeClick:         (edge: Edge<EdgeData>) => void
  onPaneClick:         () => void
  onDropEquipment:        (type: EquipmentType, position: { x: number; y: number }) => void
  onNodeDoubleClick:      (nodeId: string, nodeType: string) => void
  onNodeContextMenu:      (nodeId: string, nodeType: string, pos: { x: number; y: number }, selectedIds: string[]) => void
  onBulkVoltageChange?:   (nodeIds: string[], vn_kv: number) => void
}

const VOLTAGE_OPTIONS = [0.38, 0.69, 3.3, 6.6, 11, 22.9, 33, 66, 110, 154]

export default function SLDCanvas({
  nodes, edges, nodeTypes, edgeTypes,
  onNodesChange, onEdgesChange, onConnect,
  onNodeClick, onEdgeClick, onPaneClick,
  onDropEquipment, onNodeDoubleClick, onNodeContextMenu,
  onBulkVoltageChange,
}: Props) {
  const reactFlowWrapper = useRef<HTMLDivElement>(null)
  const { screenToFlowPosition, fitView, setCenter } = useReactFlow()
  const deleteNodes      = useEquipmentStore(s => s.deleteNodes)
  const resultFocusId    = useEquipmentStore(s => s.resultFocusId)
  const focusResultNode  = useEquipmentStore(s => s.focusResultNode)

  // ResultsPanel 행 클릭 → 해당 노드로 캔버스 패닝
  useEffect(() => {
    if (!resultFocusId) return
    const target = nodes.find(n => n.id === resultFocusId)
    if (target) {
      const cx = target.position.x + (target.width ?? 60) / 2
      const cy = target.position.y + (target.height ?? 40) / 2
      setCenter(cx, cy, { zoom: 1.2, duration: 600 })
    }
    // 포커스 후 초기화 (중복 발동 방지)
    const t = setTimeout(() => focusResultNode(null), 700)
    return () => clearTimeout(t)
  }, [resultFocusId]) // eslint-disable-line react-hooks/exhaustive-deps

  const [bulkVoltage, setBulkVoltage] = useState(0.38)

  // #3 연결 실패 감지용 ref
  const lastValidFailed = useRef(false)

  const isValidConnection = useCallback((connection: Connection) => {
    const source = nodes.find(n => n.id === connection.source)
    const target = nodes.find(n => n.id === connection.target)
    if (!source || !target) return false
    const srcType = source.type as EquipmentType
    const tgtType = target.type as EquipmentType
    const allowed = CONNECTION_RULES[srcType] ?? []
    const ok = allowed.includes(tgtType)
    if (!ok) lastValidFailed.current = true
    return ok
  }, [nodes])

  // #3 연결 끝날 때 실패 토스트
  const handleConnectEnd = useCallback(() => {
    if (lastValidFailed.current) {
      showToast(
        '연결 불가 — 연결 규칙 위반입니다. (Bus ↔ Cable ↔ 장비)',
        'error', 3000,
      )
      lastValidFailed.current = false
    }
  }, [])

  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
  }, [])

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    const type = e.dataTransfer.getData('application/reactflow') as EquipmentType
    if (!type) return
    const raw = screenToFlowPosition({ x: e.clientX, y: e.clientY })
    const position = {
      x: Math.round(raw.x / GRID) * GRID,
      y: Math.round(raw.y / GRID) * GRID,
    }
    onDropEquipment(type, position)
  }, [screenToFlowPosition, onDropEquipment])

  const handleNodeDoubleClick = useCallback((_: React.MouseEvent, node: Node) => {
    onNodeDoubleClick(node.id, node.type ?? '')
  }, [onNodeDoubleClick])

  const handleNodeContextMenu = useCallback((e: React.MouseEvent, node: Node) => {
    e.preventDefault()
    const selectedMotorIds = nodes
      .filter(n => n.selected && n.type === 'motor')
      .map(n => n.id)
    const contextIds =
      node.type === 'motor' && !selectedMotorIds.includes(node.id)
        ? [node.id, ...selectedMotorIds]
        : selectedMotorIds.length > 0
          ? selectedMotorIds
          : [node.id]
    onNodeContextMenu(node.id, node.type ?? '', { x: e.clientX, y: e.clientY }, contextIds)
  }, [nodes, onNodeContextMenu])

  // #8 Multi-select 플로팅 삭제 바
  const selectedNodes = nodes.filter(n => n.selected && !n.hidden)
  const multiSelected = selectedNodes.length > 1
  const voltageTargetIds = selectedNodes
    .filter(n => ['bus', 'motor', 'generator', 'load'].includes(n.type ?? ''))
    .map(n => n.id)

  return (
    <div
      ref={reactFlowWrapper}
      id="sld-canvas-root"
      style={{ flex: 1, height: '100%', background: '#ffffff', position: 'relative' }}
    >
      {/* #8 Multi-select 플로팅 액션 바 */}
      {multiSelected && (
        <div style={{
          position: 'absolute', top: 12, left: '50%', transform: 'translateX(-50%)',
          zIndex: 100,
          background: 'rgba(20,30,60,0.92)',
          border: '1px solid #3a5aaa',
          borderRadius: 4,
          padding: '5px 14px',
          display: 'flex', alignItems: 'center', gap: 10,
          fontSize: 10.5, color: '#e8f0ff',
          fontFamily: "'Segoe UI', 'Malgun Gothic', Arial, sans-serif",
          boxShadow: '0 4px 14px rgba(0,0,0,0.35)',
        }}>
          <span style={{ color: '#c0d0f0', fontFamily: 'Consolas, monospace' }}>
            {selectedNodes.length}개 선택
          </span>
          {voltageTargetIds.length > 0 && onBulkVoltageChange && (
            <>
              <div style={{ width: 1, height: 18, background: '#3a5aaa' }} />
              <span style={{ fontSize: 9.5, color: '#9ab0d8' }}>전압</span>
              <select
                value={bulkVoltage}
                onChange={e => setBulkVoltage(Number(e.target.value))}
                style={{
                  padding: '2px 4px', fontSize: 10, background: '#1a2a50',
                  border: '1px solid #4a6aaa', borderRadius: 2, color: '#e8f0ff',
                  cursor: 'pointer', fontFamily: 'Consolas, monospace',
                }}
              >
                {VOLTAGE_OPTIONS.map(v => (
                  <option key={v} value={v}>{v} kV</option>
                ))}
              </select>
              <button
                onClick={() => {
                  onBulkVoltageChange(voltageTargetIds, bulkVoltage)
                  showToast(`${voltageTargetIds.length}개 장비 전압 → ${bulkVoltage} kV`, 'info')
                }}
                style={{
                  padding: '3px 10px', fontSize: 10, cursor: 'pointer',
                  background: '#1a5aaa', border: '1px solid #3a7acc',
                  borderRadius: 3, color: '#fff', fontWeight: 700,
                }}
              >
                일괄 변경
              </button>
              <div style={{ width: 1, height: 18, background: '#3a5aaa' }} />
            </>
          )}
          <button
            onClick={() => {
              deleteNodes(selectedNodes.map(n => n.id))
              showToast(`${selectedNodes.length}개 노드 삭제됨`, 'warn')
            }}
            style={{
              padding: '3px 12px', fontSize: 10, cursor: 'pointer',
              background: '#c03030', border: 'none', borderRadius: 3,
              color: '#fff', fontWeight: 700,
            }}
          >
            삭제
          </button>
        </div>
      )}

      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onConnectEnd={handleConnectEnd}
        onNodeClick={(_, node) => onNodeClick(node as Node<NodeData>)}
        onEdgeClick={(_, edge) => onEdgeClick(edge as Edge<EdgeData>)}
        onPaneClick={onPaneClick}
        onNodeDoubleClick={handleNodeDoubleClick}
        onNodeContextMenu={handleNodeContextMenu}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        isValidConnection={isValidConnection}
        onDrop={onDrop}
        onDragOver={onDragOver}
        snapToGrid
        snapGrid={[GRID, GRID]}
        fitView
        fitViewOptions={{ padding: 0.2 }}
        minZoom={0.1}
        maxZoom={5}
        deleteKeyCode={['Backspace', 'Delete']}
        proOptions={{ hideAttribution: true }}
        style={{ background: '#ffffff' }}
        defaultEdgeOptions={{ type: 'cable', animated: false }}
      >
        <Background variant={BackgroundVariant.Dots} color="#b0bcc8" gap={GRID} size={1.2} />
        <Controls showInteractive={false} style={{ bottom: 16, left: 16 }} />
        <MiniMap
          style={{ background: '#f4f7fb', border: '1px solid #9aa4b0', borderRadius: 2 }}
          nodeColor={(n) => {
            switch (n.type) {
              case 'bus':         return '#1a3a8a'
              case 'transformer': return '#5a1090'
              case 'breaker':     return '#1a4a1a'
              case 'motor':       return '#5a3000'
              case 'motorGroup':  return '#8a5000'
              case 'generator':   return '#003a50'
              default:            return '#3a5068'
            }
          }}
          maskColor="rgba(180,196,216,0.4)"
        />
      </ReactFlow>
    </div>
  )
}
