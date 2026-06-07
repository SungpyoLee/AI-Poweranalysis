/**
 * Symbol detector — converts OCR words + pixel data into DetectedSymbol[].
 *
 * Two passes:
 *  1. Text-label classification  (primary — high confidence)
 *  2. Horizontal pixel-line scan (supplementary — finds unlabelled bus bars)
 */

import type { OcrWord, OcrResult } from './ocr'
import { parseDatasheet } from '../utils/datasheetParser'
import type { EquipmentType } from '../types'

// motorGroup cannot appear on a raw SLD drawing
export type SymbolType = Exclude<EquipmentType, 'motorGroup'>

export interface DetectedSymbol {
  id:         string
  type:       SymbolType
  label:      string
  bbox:       { x: number; y: number; w: number; h: number }
  confidence: number                         // 0–1
  params:     Record<string, number | string> // auto-extracted equipment params
  words:      OcrWord[]                      // contributing OCR words
}

// ── Classification pattern table ───────────────────────────────────────────────
const PATTERNS: Record<SymbolType, RegExp[]> = {
  bus: [
    /^BUS[-_\s]?\d*/i,
    /^BB[-_]?\d*/i,
    /\bBUSBAR\b/i,
    /\b\d{1,3}(\.\d)?\s*kV\s*(BUS|BB|BUSBAR)\b/i,
    /^(MAIN|SUB)\s*BUS\b/i,
    /^154kV$|^22\.9kV$|^66kV$|^6\.6kV$|^0\.38kV$/i,
  ],
  transformer: [
    /^TR[-_]?\d+/i,
    /^T[-_]?\d+\b/i,
    /^PTR\d*/i,
    /\b(XFMR|TRANSF?|변압기)\b/i,
    /\d+\s*MVA\b/i,
    /\d+\s*\/\s*\d+\s*kV/i,
  ],
  breaker: [
    /^CB[-_]?\d+/i,
    /^(VCB|ACB|GCB|MCCB|MCB)[-_]?\d*/i,
    /^(DS|ES|IS|LBS)[-_]?\d*/i,
    /^52[-_]?\w+/,
    /\b(차단기|개폐기|BREAKER|BKR)\b/i,
  ],
  motor: [
    /^M[-_]?\d+/i,
    /^(MTR|MOTOR|모터|전동기)[-_]?\d*/i,
    /\b(PUMP|FAN|COMP|BLOWER|AGITATOR|MIXER)\b/i,
  ],
  generator: [
    /^G[-_]?\d+/i,
    /^GEN[-_]?\d*/i,
    /^DG[-_]?\d*/i,
    /^ALT[-_]?\d*/i,
    /\b(GENERATOR|발전기|GENSET)\b/i,
  ],
  load: [
    /^L[-_]?\d+/i,
    /^LOAD[-_]?\d*/i,
    /^MCC[-_]?\d*/i,
    /^DP[-_]?\d*/i,
    /^PANEL[-_]?\w+/i,
    /\b(부하|FEEDER|SWITCHBOARD|SWB)\b/i,
  ],
  transformer3w: [
    /^T3[-_]?\d+/i,
    /^3W[-_]?TR\d*/i,
    /\b(3W|3-WINDING|THREE.WIND)\b/i,
  ],
  capacitor: [
    /^C[-_]?\d+/i,
    /^CAP[-_]?\d*/i,
    /\b(CAPACITOR|콘덴서|MVAR)\b/i,
  ],
  reactor: [
    /^R[-_]?\d+/i,
    /^REACT[-_]?\d*/i,
    /\b(REACTOR|리액터)\b/i,
  ],
}

function classifyText(text: string): { type: SymbolType | null; score: number } {
  let best: SymbolType | null = null
  let bestScore = 0

  for (const [type, pats] of Object.entries(PATTERNS) as [SymbolType, RegExp[]][]) {
    for (let i = 0; i < pats.length; i++) {
      if (pats[i].test(text)) {
        const score = 1.0 - i * 0.08   // earlier patterns → higher score
        if (score > bestScore) { bestScore = score; best = type }
      }
    }
  }
  return { type: best, score: Math.min(bestScore, 1) }
}

// ── Word clustering ────────────────────────────────────────────────────────────
// Groups nearby words into single label clusters.

function clusterWords(words: OcrWord[], gapPx: number): OcrWord[][] {
  if (!words.length) return []
  const sorted = [...words].sort((a, b) => a.bbox.y - b.bbox.y || a.bbox.x - b.bbox.x)
  const clusters: OcrWord[][] = [[sorted[0]]]

  for (let i = 1; i < sorted.length; i++) {
    const w    = sorted[i]
    const cl = clusters[clusters.length - 1]; const prev = cl[cl.length - 1]!
    const dy   = w.bbox.y - (prev.bbox.y + prev.bbox.h)
    const dx   = Math.abs(w.bbox.x - (prev.bbox.x + prev.bbox.w))

    if (dy < gapPx && dx < gapPx * 4) {
      clusters[clusters.length - 1].push(w)
    } else {
      clusters.push([w])
    }
  }
  return clusters
}

function clusterBBox(cluster: OcrWord[]) {
  const xs = cluster.flatMap(w => [w.bbox.x, w.bbox.x + w.bbox.w])
  const ys = cluster.flatMap(w => [w.bbox.y, w.bbox.y + w.bbox.h])
  const x = Math.min(...xs), y = Math.min(...ys)
  return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y }
}

// ── Parameter extraction from cluster text ────────────────────────────────────

function extractParams(text: string): Record<string, number | string> {
  const out: Record<string, number | string> = {}

  // Try each equipment type parser and take whatever has values
  for (const t of ['transformer', 'motor', 'breaker'] as const) {
    const { fields } = parseDatasheet(text, t)
    for (const f of fields) {
      if (f.value !== null && !(f.key in out)) out[f.key] = f.value
    }
  }

  // Standalone voltage pattern: "154kV" / "22.9kV"
  const kv = /\b([\d.]+)\s*kV\b/i.exec(text)
  if (kv && !out.vn_kv && !out.vn_hv_kv) {
    out.vn_kv = parseFloat(kv[1])
  }

  return out
}

// ── Horizontal bus-bar pixel detection ────────────────────────────────────────

interface HLine { y: number; x0: number; x1: number }

function detectHLines(canvas: HTMLCanvasElement, minFrac = 0.18): HLine[] {
  const { width, height } = canvas
  const ctx = canvas.getContext('2d')!
  const img = ctx.getImageData(0, 0, width, height)
  const px  = img.data

  const bright = (x: number, y: number) => {
    const i = (y * width + x) * 4
    return (px[i] + px[i + 1] + px[i + 2]) / 3
  }

  const raw: HLine[] = []

  for (let y = 1; y < height - 1; y += 2) {
    let run = 0, runX0 = 0, maxRun = 0, maxX0 = 0

    for (let x = 0; x < width; x++) {
      if (bright(x, y) < 100) {
        if (run === 0) runX0 = x
        run++
        if (run > maxRun) { maxRun = run; maxX0 = runX0 }
      } else {
        run = 0
      }
    }

    if (maxRun >= width * minFrac) {
      // Ensure it is thin (not a filled rectangle — check pixel above & below are light)
      const midX = maxX0 + Math.floor(maxRun / 2)
      if (bright(midX, y - 1) > 180 || bright(midX, y + 1) > 180) {
        raw.push({ y, x0: maxX0, x1: maxX0 + maxRun })
      }
    }
  }

  // Merge lines within 6 px vertically
  const merged: HLine[] = []
  for (const l of raw) {
    const prev = merged[merged.length - 1]
    if (prev && Math.abs(prev.y - l.y) < 6) {
      prev.y  = Math.round((prev.y + l.y) / 2)
      prev.x0 = Math.min(prev.x0, l.x0)
      prev.x1 = Math.max(prev.x1, l.x1)
    } else {
      merged.push({ ...l })
    }
  }
  return merged
}

// ── Main export ────────────────────────────────────────────────────────────────

let _seq = 0
function nextId() { return `sym-${++_seq}` }

export function detectSymbols(
  canvas: HTMLCanvasElement,
  ocr: OcrResult,
): DetectedSymbol[] {
  _seq = 0
  const results: DetectedSymbol[] = []

  // ── Pass 1: text-label classification ──────────────────────────────────────
  const clusterGap = Math.max(30, Math.round(canvas.height * 0.035))
  const clusters   = clusterWords(ocr.words, clusterGap)

  for (const cluster of clusters) {
    const text = cluster.map(w => w.text).join(' ').trim()
    if (text.length < 2) continue

    const { type, score } = classifyText(text)
    if (!type || score < 0.25) continue

    const bbox    = clusterBBox(cluster)
    const params  = extractParams(text)
    const ocrConf = cluster.reduce((s, w) => s + w.confidence, 0) / cluster.length / 100
    const conf    = Math.min(score * 0.65 + ocrConf * 0.35, 1.0)

    results.push({ id: nextId(), type, label: text, bbox, confidence: conf, params, words: cluster })
  }

  // ── Pass 2: horizontal pixel lines → bus candidates ───────────────────────
  const hLines = detectHLines(canvas)

  for (const line of hLines) {
    const cy = line.y
    // Skip if an existing bus symbol is already close
    const alreadyCovered = results.some(
      s => s.type === 'bus' && Math.abs((s.bbox.y + s.bbox.h / 2) - cy) < 25,
    )
    if (alreadyCovered) continue

    // Find nearby non-bus label to form the bus name
    const nearby = results.find(s => Math.abs((s.bbox.y + s.bbox.h / 2) - cy) < 50)
    const label  = nearby ? `BUS-${nearby.label}` : `BUS-${nextId()}`

    results.push({
      id:         nextId(),
      type:       'bus',
      label,
      bbox:       { x: line.x0, y: line.y - 4, w: line.x1 - line.x0, h: 8 },
      confidence: 0.55,
      params:     {},
      words:      [],
    })
  }

  // Sort top → bottom (y ascending)
  results.sort((a, b) => (a.bbox.y + a.bbox.h / 2) - (b.bbox.y + b.bbox.h / 2))
  return results
}
