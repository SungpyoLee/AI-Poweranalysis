import { useCallback, useRef } from 'react'
import ReactFlow, {
  Background, BackgroundVariant, Controls, MiniMap,
  Node, Edge, Connection, NodeChange, EdgeChange,
  addEdge, applyNodeChanges, applyEdgeChanges,
  useReactFlow,
} from 'reactflow'
import type { NodeData, EdgeData, EquipmentType } from '../types'
import { CONNECTION_RULES, defaultProps, defaultCableProps } from '../types'

const GRID = 20 // snap grid size

interface Props {
  nodes: Node<NodeData>[]
  edges: Edge<EdgeData>[]
  nodeTypes: Record<string, React.ComponentType<any>>
  edgeTypes: Record<string, React.ComponentType<any>>
  onNodesChange: (changes: NodeChange[]) => void
  onEdgesChange: (changes: EdgeChange[]) => void
  onConnect: (conn: Connection) => void
  onNodeClick: (node: Node<NodeData>) => void
  onEdgeClick: (edge: Edge<EdgeData>) => void
  onPaneClick: () => void
  onDropEquipment: (type: EquipmentType, position: { x: number; y: number }) => void
}

export default function SLDCanvas({
  nodes, edges, nodeTypes, edgeTypes,
  onNodesChange, onEdgesChange, onConnect,
  onNodeClick, onEdgeClick, onPaneClick,
  onDropEquipment,
}: Props) {
  const reactFlowWrapper = useRef<HTMLDivElement>(null)
  const { screenToFlowPosition } = useReactFlow()

  const isValidConnection = useCallback((connection: Connection) => {
    const source = nodes.find(n => n.id === connection.source)
    const target = nodes.find(n => n.id === connection.target)
    if (!source || !target) return false
    const srcType = source.type as EquipmentType
    const tgtType = target.type as EquipmentType
    const allowed = CONNECTION_RULES[srcType] ?? []
    return allowed.includes(tgtType)
  }, [nodes])

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

  return (
    <div
      ref={reactFlowWrapper}
      style={{ flex: 1, height: '100%', background: '#ffffff' }}
    >
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onNodeClick={(_, node) => onNodeClick(node as Node<NodeData>)}
        onEdgeClick={(_, edge) => onEdgeClick(edge as Edge<EdgeData>)}
        onPaneClick={onPaneClick}
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
        defaultEdgeOptions={{
          type: 'cable',
          animated: false,
        }}
      >
        {/* CAD-style dot grid */}
        <Background
          variant={BackgroundVariant.Dots}
          color="#b0bcc8"
          gap={GRID}
          size={1.2}
        />
        <Controls showInteractive={false} style={{ bottom: 16, left: 16 }} />
        <MiniMap
          style={{
            background: '#f4f7fb',
            border: '1px solid #9aa4b0',
            borderRadius: 2,
          }}
          nodeColor={(n) => {
            switch (n.type) {
              case 'bus':         return '#1a3a8a'
              case 'transformer': return '#5a1090'
              case 'breaker':     return '#1a4a1a'
              case 'motor':       return '#5a3000'
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
