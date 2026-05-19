import type { Node, Edge } from 'reactflow'
import type { NodeData, BusProperties } from '../types'

// ── Layout constants ─────────────────────────────────────────────────────────
export const SLOT_W    = 110   // horizontal width per child slot
export const BUS_PAD   = 55    // padding on each side of bus bar
export const LEVEL_H   = 160   // vertical distance between levels
export const EQUIP_W   = 44    // equipment node width
export const EQUIP_HALF = 22   // EQUIP_W / 2
export const BUS_BAR_H = 14    // visual bus bar height

// ── Result ────────────────────────────────────────────────────────────────────
export interface ETAPResult {
  nodes: Node<NodeData>[]
  edges: Edge[]
}

// ── Internal tree ─────────────────────────────────────────────────────────────
interface Branch {
  chain: string[]       // ordered IDs starting from direct bus neighbor
  subTree?: BusTree
}

interface BusTree {
  busId: string
  branches: Branch[]
  totalWidth: number    // total horizontal space this subtree needs
}

// ── Build adjacency list ──────────────────────────────────────────────────────
function buildAdj(edges: Edge[]): Map<string, string[]> {
  const adj = new Map<string, string[]>()
  for (const e of edges) {
    if (!adj.has(e.source)) adj.set(e.source, [])
    if (!adj.has(e.target)) adj.set(e.target, [])
    adj.get(e.source)!.push(e.target)
    adj.get(e.target)!.push(e.source)
  }
  return adj
}

// ── Trace chain from a bus neighbor outward ───────────────────────────────────
// Returns chain of equipment IDs (in order) and optional sub-bus ID
function traceChain(
  startId: string,
  adj: Map<string, string[]>,
  nodeMap: Map<string, Node>,
  visited: Set<string>
): { chain: string[]; subBusId?: string } {
  visited.add(startId)
  const chain: string[] = [startId]
  const startType = nodeMap.get(startId)?.type

  // Leaf nodes: stop immediately
  if (startType === 'motor' || startType === 'generator') {
    return { chain }
  }

  let current = startId
  while (true) {
    const neighbors = (adj.get(current) || []).filter(id => !visited.has(id))

    // Sub-bus found?
    const subBusId = neighbors.find(id => nodeMap.get(id)?.type === 'bus')
    if (subBusId) {
      return { chain, subBusId }
    }

    // Continue chain with next equipment
    const next = neighbors.find(id => nodeMap.get(id)?.type !== 'bus')
    if (!next) break

    visited.add(next)
    chain.push(next)
    current = next

    const t = nodeMap.get(current)?.type
    if (t === 'motor' || t === 'generator') break
  }

  return { chain }
}

// ── Recursively build BusTree from a given bus ────────────────────────────────
function buildBusTree(
  busId: string,
  adj: Map<string, string[]>,
  nodeMap: Map<string, Node>,
  visited: Set<string>
): BusTree {
  visited.add(busId)
  const neighbors = (adj.get(busId) || []).filter(id => !visited.has(id))
  const branches: Branch[] = []

  for (const nbrId of neighbors) {
    const nbr = nodeMap.get(nbrId)
    if (!nbr || nbr.type === 'bus') continue

    const { chain, subBusId } = traceChain(nbrId, adj, nodeMap, new Set(visited))
    // mark chain as visited in parent visited set
    chain.forEach(id => visited.add(id))

    if (subBusId) {
      visited.add(subBusId)
      const subTree = buildBusTree(subBusId, adj, nodeMap, visited)
      branches.push({ chain, subTree })
    } else {
      branches.push({ chain })
    }
  }

  // Compute total width
  const contentW = branches.reduce((s, b) => s + (b.subTree?.totalWidth ?? SLOT_W), 0)
  const totalWidth = Math.max(contentW + BUS_PAD * 2, SLOT_W + BUS_PAD * 2)

  return { busId, branches, totalWidth }
}

// ── Assign x/y positions from tree ───────────────────────────────────────────
function assignPositions(
  tree: BusTree,
  centerX: number,
  busY: number,
  positions: Map<string, { x: number; y: number }>,
  busInfo: Map<string, { width: number; slots: number[]; slotByNeighbor: Map<string, number> }>
) {
  const { busId, branches, totalWidth } = tree
  const busWidth = totalWidth - BUS_PAD * 2
  const busX = centerX - busWidth / 2

  // Compute branch widths and slot positions
  const slots: number[] = []
  const slotByNeighbor = new Map<string, number>()
  const branchWidths = branches.map(b => b.subTree?.totalWidth ?? SLOT_W)
  const contentW = branchWidths.reduce((s, w) => s + w, 0)
  let curX = centerX - contentW / 2

  branches.forEach((branch, i) => {
    const bw = branchWidths[i]
    const chainCenterX = curX + bw / 2
    const slotOffset = chainCenterX - busX
    slots.push(slotOffset)
    slotByNeighbor.set(branch.chain[0], i)   // map first chain node → slot index

    // Place chain items vertically (each level below the bus)
    branch.chain.forEach((id, lvl) => {
      positions.set(id, {
        x: chainCenterX - EQUIP_HALF,
        y: busY + LEVEL_H * (lvl + 1),
      })
    })

    // Place sub-bus and recurse
    if (branch.subTree) {
      const subBusY = busY + LEVEL_H * (branch.chain.length + 1)
      assignPositions(branch.subTree, chainCenterX, subBusY, positions, busInfo)
    }

    curX += bw
  })

  positions.set(busId, { x: busX, y: busY })
  busInfo.set(busId, { width: busWidth, slots, slotByNeighbor })
}

// ── Main entry point ──────────────────────────────────────────────────────────
export function computeETAPLayout(
  nodes: Node<NodeData>[],
  edges: Edge[]
): ETAPResult {
  if (nodes.length === 0) return { nodes, edges }

  const nodeMap = new Map(nodes.map(n => [n.id, n]))
  const adj = buildAdj(edges)

  // Find root bus: highest voltage bus
  const buses = nodes.filter(n => n.type === 'bus')
  if (buses.length === 0) {
    return {
      nodes: nodes.map((n, i) => ({ ...n, position: { x: 120 + i * 120, y: 300 } })),
      edges,
    }
  }

  const rootBus = buses.reduce((best, b) => {
    const va = ((b.data.props as BusProperties).vn_kv ?? 0)
    const vb = ((best.data.props as BusProperties).vn_kv ?? 0)
    return va > vb ? b : best
  })

  const visited = new Set<string>()
  const tree = buildBusTree(rootBus.id, adj, nodeMap, visited)

  const positions = new Map<string, { x: number; y: number }>()
  const busInfo = new Map<string, { width: number; slots: number[]; slotByNeighbor: Map<string, number> }>()

  assignPositions(tree, 720, 80, positions, busInfo)

  // Orphan nodes (not connected to main tree)
  let orphanX = 60
  for (const n of nodes) {
    if (!positions.has(n.id)) {
      positions.set(n.id, { x: orphanX, y: 700 })
      orphanX += SLOT_W
    }
  }

  // ── Apply positions to nodes, inject busWidth/slots into bus data ──────────
  const newNodes = nodes.map(n => {
    const pos = positions.get(n.id)!
    if (n.type === 'bus') {
      const info = busInfo.get(n.id)
      return {
        ...n,
        position: pos,
        data: {
          ...n.data,
          busWidth: info?.width ?? 200,
          slots: info?.slots ?? [100],
        },
      }
    }
    return { ...n, position: pos }
  })

  // ── Update edge handles for straight vertical connections ─────────────────
  const newEdges = edges.map(e => {
    const srcNode = nodeMap.get(e.source)
    const tgtNode = nodeMap.get(e.target)

    if (srcNode?.type === 'bus') {
      const info = busInfo.get(e.source)
      const slotIdx = info?.slotByNeighbor.get(e.target) ?? 0
      return { ...e, sourceHandle: `s${slotIdx}`, targetHandle: 'top' }
    }
    if (tgtNode?.type === 'bus') {
      const info = busInfo.get(e.target)
      // find which slot this source chains into
      // walk edges to find direct bus neighbor that is ancestor of e.source
      let slotIdx = 0
      for (const [neighborId, idx] of (info?.slotByNeighbor ?? [])) {
        // if e.source is in the chain starting from neighborId, use this slot
        if (neighborId === e.source) { slotIdx = idx; break }
        // check if e.source is downstream of neighborId
        const chainVisited = new Set<string>()
        const chainAdj = buildAdj(edges)
        const inChain = (id: string): boolean => {
          if (id === e.source) return true
          chainVisited.add(id)
          return (chainAdj.get(id) || [])
            .filter(x => !chainVisited.has(x) && nodeMap.get(x)?.type !== 'bus')
            .some(x => inChain(x))
        }
        if (inChain(neighborId)) { slotIdx = idx; break }
      }
      return { ...e, sourceHandle: 'bottom', targetHandle: `s${slotIdx}` }
    }

    // Equipment → Equipment
    return { ...e, sourceHandle: 'bottom', targetHandle: 'top' }
  })

  return { nodes: newNodes, edges: newEdges }
}
