/**
 * Graph builder — converts DetectedSymbol[] into ReactFlow nodes + edges.
 *
 * Connection algorithm:
 *  1. Group symbols into vertical columns (X-center proximity)
 *  2. Within each column, sort by Y and connect adjacent symbols
 *  3. Refine with pixel vertical-line tracing: discard inferred edges where
 *     no connecting line pixel path exists
 *  4. Preserve original image positions (scaled to 1400×900 canvas)
 */

import type { Node as RFNode, Edge as RFEdge } from 'reactflow'
import type { NodeData, EdgeData, EquipmentType } from '../types'
import { defaultEquipment, defaultCable } from '../types'
import type { DetectedSymbol } from './symbolDetector'

export interface BuildResult {
  nodes: RFNode<NodeData>[]
  edges: RFEdge<EdgeData>[]
}

// ── Canvas coordinate system ────────────────────────────────────────────────────
const CANVAS_W = 1400
const CANVAS_H =  900

function scalePos(
  sym: DetectedSymbol,
  imgW: number, imgH: number,
): { x: number; y: number } {
  const cx = (sym.bbox.x + sym.bbox.w / 2) / imgW * CANVAS_W
  const cy = (sym.bbox.y + sym.bbox.h / 2) / imgH * CANVAS_H
  // Snap to 20px grid
  return { x: Math.round(cx / 20) * 20, y: Math.round(cy / 20) * 20 }
}

// ── Column detection ──────────────────────────────────────────────────────────

function groupColumns(symbols: DetectedSymbol[], imgW: number): DetectedSymbol[][] {
  const TOL = imgW * 0.07   // 7% of image width
  const cols: DetectedSymbol[][] = []

  // Sort by X center
  const sorted = [...symbols].sort(
    (a, b) => (a.bbox.x + a.bbox.w / 2) - (b.bbox.x + b.bbox.w / 2),
  )

  for (const sym of sorted) {
    const cx  = sym.bbox.x + sym.bbox.w / 2
    const col = cols.find(c => {
      const avgX = c.reduce((s, s2) => s + s2.bbox.x + s2.bbox.w / 2, 0) / c.length
      return Math.abs(cx - avgX) < TOL
    })
    if (col) col.push(sym)
    else      cols.push([sym])
  }

  return cols
}

// ── Pixel vertical-line tracer ────────────────────────────────────────────────

function hasVerticalLine(
  canvas: HTMLCanvasElement,
  cx: number, y1: number, y2: number,
): boolean {
  const gap = y2 - y1
  if (gap < 4) return true    // directly adjacent — assume connected

  const x0  = Math.max(0, Math.round(cx) - 3)
  const w   = Math.min(7, canvas.width - x0)
  const h   = Math.min(gap, canvas.height - Math.round(y1))
  if (w <= 0 || h <= 0) return false

  const ctx  = canvas.getContext('2d')!
  const data = ctx.getImageData(x0, Math.round(y1), w, h).data

  let dark = 0
  for (let i = 0; i < data.length; i += 4) {
    if ((data[i] + data[i + 1] + data[i + 2]) / 3 < 110) dark++
  }
  return dark / (data.length / 4) > 0.20  // ≥20% dark pixels → line present
}

// ── Edge ID counter ────────────────────────────────────────────────────────────
let _eSeq = 0
function nextEdgeId() { return `imp-e-${++_eSeq}` }

// ── Equipment factory ──────────────────────────────────────────────────────────
// Calls the canonical defaultEquipment then overrides with detected label + params.

function makeNode(
  sym: DetectedSymbol,
  pos: { x: number; y: number },
): RFNode<NodeData> {
  const equip = {
    ...defaultEquipment(sym.type as EquipmentType, sym.id),
    name: sym.label.slice(0, 40),   // use detected label as name
    ...sym.params,                  // override with extracted params
  }

  return {
    id:       sym.id,
    type:     sym.type as EquipmentType,
    position: pos,
    data:     { equipment: equip as NodeData['equipment'] },
  }
}

// ── Main builder ──────────────────────────────────────────────────────────────

export function buildGraph(
  canvas: HTMLCanvasElement,
  symbols: DetectedSymbol[],
): BuildResult {
  _eSeq = 0
  if (!symbols.length) return { nodes: [], edges: [] }

  const { width: imgW, height: imgH } = canvas

  // 1. Position nodes
  const nodes: RFNode<NodeData>[] = symbols.map(sym =>
    makeNode(sym, scalePos(sym, imgW, imgH)),
  )

  // 2. Infer edges via column grouping
  const columns = groupColumns(symbols, imgW)
  const rawEdges: { src: DetectedSymbol; tgt: DetectedSymbol }[] = []

  for (const col of columns) {
    col.sort((a, b) => (a.bbox.y + a.bbox.h / 2) - (b.bbox.y + b.bbox.h / 2))
    for (let i = 0; i < col.length - 1; i++) {
      rawEdges.push({ src: col[i], tgt: col[i + 1] })
    }
  }

  // 3. Pixel-line refinement — remove inferred edges with no pixel path
  const edges: RFEdge<EdgeData>[] = rawEdges
    .filter(({ src, tgt }) => {
      const cx   = (src.bbox.x + src.bbox.w / 2)
      const srcB = src.bbox.y + src.bbox.h
      const tgtT = tgt.bbox.y
      return hasVerticalLine(canvas, cx, srcB, tgtT)
    })
    .map(({ src, tgt }) => ({
      id:     nextEdgeId(),
      source: src.id,
      target: tgt.id,
      type:   'cable',
      data:   { cable: defaultCable(nextEdgeId()) },
    }))

  return { nodes, edges }
}

/**
 * Merge two BuildResults (for multi-page PDFs).
 * Offsets the second result's Y positions to stack below the first.
 */
export function mergeResults(a: BuildResult, b: BuildResult, yGap = 120): BuildResult {
  const maxAY = a.nodes.reduce((m, n) => Math.max(m, n.position.y), 0)
  const minBY = b.nodes.reduce((m, n) => Math.min(m, n.position.y), Infinity)
  const shift  = maxAY - minBY + yGap

  const shiftedNodes = b.nodes.map(n => ({
    ...n,
    id:       `p2-${n.id}`,
    position: { x: n.position.x, y: n.position.y + shift },
  }))

  const idMap = new Map<string, string>()
  b.nodes.forEach((n, i) => idMap.set(n.id, shiftedNodes[i].id))

  const shiftedEdges = b.edges.map(e => ({
    ...e,
    id:     `p2-${e.id}`,
    source: idMap.get(e.source) ?? e.source,
    target: idMap.get(e.target) ?? e.target,
  }))

  return {
    nodes: [...a.nodes, ...shiftedNodes],
    edges: [...a.edges, ...shiftedEdges],
  }
}
