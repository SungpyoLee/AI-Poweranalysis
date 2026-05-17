import ReactFlow, { Background, BackgroundVariant, Controls, MiniMap } from 'reactflow'
import BusNode from './nodes/BusNode'
import ExternalGridNode from './nodes/ExternalGridNode'
import LoadNode from './nodes/LoadNode'
import GeneratorNode from './nodes/GeneratorNode'
import TransformerNode from './nodes/TransformerNode'
import CBNode from './nodes/CBNode'

const nodeTypes = {
  bus: BusNode,
  extgrid: ExternalGridNode,
  load: LoadNode,
  generator: GeneratorNode,
  transformer: TransformerNode,
  cb: CBNode,
}

export default function NetworkDiagram({ nodes, edges, onNodesChange, onEdgesChange }) {
  return (
    <div style={{ flex: 1, height: '100%', background: '#ffffff' }}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        nodeTypes={nodeTypes}
        deleteKeyCode={null}
        fitView
        fitViewOptions={{ padding: 0.15 }}
        minZoom={0.15}
        maxZoom={4}
        proOptions={{ hideAttribution: true }}
        style={{ background: '#ffffff' }}
      >
        {/* Engineering drawing dot grid (CAD-style) */}
        <Background
          variant={BackgroundVariant.Dots}
          color="#b8c8d8"
          gap={24}
          size={1.2}
        />
        <Controls style={{ bottom: 16, left: 16 }} showInteractive={false} />
        <MiniMap
          style={{ background: '#f4f7fb', border: '1px solid #9aa4b0', borderRadius: 2 }}
          nodeColor={(n) => {
            if (n.type === 'bus')         return '#1a3a8a'
            if (n.type === 'extgrid')     return '#2040a0'
            if (n.type === 'load')        return '#7a3000'
            if (n.type === 'generator')   return '#005a20'
            if (n.type === 'transformer') return '#5a1090'
            if (n.type === 'cb')          return '#203860'
            return '#3a5068'
          }}
          maskColor="rgba(180,196,216,0.45)"
        />
      </ReactFlow>
    </div>
  )
}
