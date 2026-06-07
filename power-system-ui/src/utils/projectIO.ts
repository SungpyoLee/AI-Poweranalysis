/**
 * Project I/O — PowerFlow Analyzer
 * Pure utilities for .pfa file serialization, localStorage, and recent-project management.
 * No React / store dependencies.
 */
import type { Node, Edge } from 'reactflow'
import type {
  NodeData, EdgeData,
  LoadflowResults, ShortCircuitResults, ArcFlashResults,
  ContingencyResults, HarmonicResults, CableSizingResults,
} from '../types'

// ── Schema types ──────────────────────────────────────────────────────────────
// P2-7: 개정 이력 항목
export interface RevisionEntry {
  rev:         string   // 개정 번호 (예: Rev.0, Rev.1)
  date:        string   // ISO 8601
  author:      string   // 작성자
  description: string   // 변경 내용
}

export interface PFAMeta {
  name:            string
  description:     string
  created:         string   // ISO 8601
  modified:        string   // ISO 8601
  // P1-1: 계통 주파수
  frequency_hz:    50 | 60
  // P1-5: EPC 납품용 문서 정보
  projectNumber:   string
  docNumber:       string
  revision:        string   // 현재 개정 번호
  engineer:        string
  checker:         string
  approver:        string
  client:          string
  // P1-5: 협조 마진 (IEC 60255 기본 0.3s, 사용자 설정 가능)
  coordination_margin_s: number
  // P2-7: 개정 이력
  revisionHistory: RevisionEntry[]
}

export interface PFAResults {
  loadflow:     LoadflowResults     | null
  shortcircuit: ShortCircuitResults | null
  arcFlash:     ArcFlashResults     | null
  contingency:  ContingencyResults  | null
  harmonics:    HarmonicResults     | null
  cableSizing:  CableSizingResults  | null
}

// P2-2: 계산 감사 로그 — 계산 실행 이력 (EPC 납품 추적용)
export interface CalcLogEntry {
  timestamp:  string   // ISO 8601
  calcType:   'LoadFlow' | 'ShortCircuit' | 'Harmonics' | 'CableSizing' | 'ArcFlash' | 'Contingency' | 'AsymFault'
  converged?: boolean  // 수렴 여부 (LoadFlow)
  summary:    string   // 결과 요약 (예: "5 buses, Vmin=0.952 pu")
  engineer?:  string   // 실행자 (meta.engineer 값)
}

export interface PFAFile {
  format:  'PowerFlowAnalyzer'
  version: '1.0'
  meta:    PFAMeta
  network: {
    nodes: Node<NodeData>[]
    edges: Edge<EdgeData>[]
  }
  results: PFAResults
  calcLog?: CalcLogEntry[]   // P2-2: 계산 실행 이력
}

export interface RecentEntry {
  id:       string
  name:     string
  fileName: string
  modified: string
  data:     string   // JSON of PFAFile — stored inline
}

// ── Constants ─────────────────────────────────────────────────────────────────
export const AUTOSAVE_KEY = 'pfa_autosave'
export const RECENT_KEY   = 'pfa_recent'
export const MAX_RECENT   = 5

// ── Builders ──────────────────────────────────────────────────────────────────
export function defaultMeta(name = 'Untitled Project'): PFAMeta {
  const now = new Date().toISOString()
  return {
    name, description: '', created: now, modified: now,
    frequency_hz:  60,
    projectNumber: '', docNumber: '', revision: 'Rev.0',
    engineer: '', checker: '', approver: '', client: '',
    coordination_margin_s: 0.3,
    revisionHistory: [{
      rev: 'Rev.0',
      date: now,
      author: '',
      description: 'Initial issue',
    }],
  }
}

export function buildPFA(
  meta:    PFAMeta,
  nodes:   Node<NodeData>[],
  edges:   Edge<EdgeData>[],
  results: PFAResults,
): PFAFile {
  return {
    format:  'PowerFlowAnalyzer',
    version: '1.0',
    meta:    { ...meta, modified: new Date().toISOString() },
    network: { nodes, edges },
    results,
  }
}

// ── Serialization ─────────────────────────────────────────────────────────────
export function serializePFA(pfa: PFAFile): string {
  return JSON.stringify(pfa)
}

export function parsePFA(json: string): PFAFile {
  let obj: unknown
  try { obj = JSON.parse(json) } catch { throw new Error('JSON 파싱 오류') }
  const p = obj as Record<string, unknown>
  if (p.format !== 'PowerFlowAnalyzer') throw new Error('올바르지 않은 프로젝트 파일 형식입니다.')
  const net = p.network as Record<string, unknown> | undefined
  if (!Array.isArray(net?.nodes) || !Array.isArray(net?.edges)) {
    throw new Error('네트워크 데이터가 손상되었습니다.')
  }
  return obj as PFAFile
}

// ── File I/O (browser) ────────────────────────────────────────────────────────
export function downloadPFA(pfa: PFAFile, filename?: string): void {
  const json = serializePFA(pfa)
  const blob = new Blob([json], { type: 'application/json;charset=utf-8' })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  a.href     = url
  a.download = filename ?? sanitizeFileName(pfa.meta.name) + '.pfa'
  a.click()
  URL.revokeObjectURL(url)
}

export function sanitizeFileName(name: string): string {
  return name.replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').trim() || 'project'
}

export function readPFAFile(): Promise<{ pfa: PFAFile; fileName: string } | null> {
  return new Promise(resolve => {
    const input   = document.createElement('input')
    input.type    = 'file'
    input.accept  = '.pfa,.json'
    input.onchange = async () => {
      const file = input.files?.[0]
      if (!file) { resolve(null); return }
      try {
        const text = await file.text()
        const pfa  = parsePFA(text)
        resolve({ pfa, fileName: file.name })
      } catch (e: any) {
        resolve({ pfa: null as any, fileName: e.message })
      }
    }
    input.click()
  })
}

// ── localStorage helpers ──────────────────────────────────────────────────────
function lsSet(key: string, value: string): void {
  try { localStorage.setItem(key, value) } catch { /* quota — ignore */ }
}

function lsGet(key: string): string | null {
  try { return localStorage.getItem(key) } catch { return null }
}

function lsDel(key: string): void {
  try { localStorage.removeItem(key) } catch { /* ignore */ }
}

// ── Auto-save ─────────────────────────────────────────────────────────────────
export function autoSave(pfa: PFAFile): void {
  lsSet(AUTOSAVE_KEY, serializePFA(pfa))
}

export function loadAutoSave(): PFAFile | null {
  const s = lsGet(AUTOSAVE_KEY)
  if (!s) return null
  try { return parsePFA(s) } catch { return null }
}

export function clearAutoSave(): void {
  lsDel(AUTOSAVE_KEY)
}

export function hasAutoSave(): boolean {
  return lsGet(AUTOSAVE_KEY) !== null
}

// ── Recent projects ───────────────────────────────────────────────────────────
export function getRecentProjects(): RecentEntry[] {
  const s = lsGet(RECENT_KEY)
  if (!s) return []
  try { return JSON.parse(s) as RecentEntry[] } catch { return [] }
}

export function addToRecent(pfa: PFAFile, fileName: string): void {
  const existing = getRecentProjects().filter(r => r.fileName !== fileName)
  const entry: RecentEntry = {
    id:       typeof crypto !== 'undefined' && crypto.randomUUID
                ? crypto.randomUUID()
                : String(Date.now()),
    name:     pfa.meta.name,
    fileName,
    modified: pfa.meta.modified,
    data:     serializePFA(pfa),
  }
  const next = [entry, ...existing].slice(0, MAX_RECENT)
  lsSet(RECENT_KEY, JSON.stringify(next))
}

export function removeFromRecent(id: string): void {
  const next = getRecentProjects().filter(r => r.id !== id)
  lsSet(RECENT_KEY, JSON.stringify(next))
}

export function clearRecent(): void {
  lsDel(RECENT_KEY)
}

// ── Date formatting ───────────────────────────────────────────────────────────
export function formatModified(iso: string): string {
  try {
    const d = new Date(iso)
    const pad = (n: number) => String(n).padStart(2, '0')
    return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
  } catch {
    return iso
  }
}
