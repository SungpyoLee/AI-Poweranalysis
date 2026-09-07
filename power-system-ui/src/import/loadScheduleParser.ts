/**
 * loadScheduleParser.ts
 * EPC 부하 목록표 (Load Schedule) Excel 파싱
 *
 * 지원 장비 유형:
 *   MOTOR, LOAD (일반 부하), GENERATOR
 *
 * 지원 컬럼 (대소문자 무관, 부분 일치):
 *   TAG / Equipment Tag / Item
 *   Type / Equip Type / Category
 *   kW / Power / Rated kW
 *   PF / Power Factor / Cos Phi
 *   Voltage / kV / Rated V
 *   Bus / Panel / MCC / Connection
 *   Description / Service
 */

import * as XLSX from 'xlsx'

export type LoadEquipType = 'motor' | 'load' | 'generator'

export interface LoadScheduleRow {
  tag:         string
  equipType:   LoadEquipType
  kw:          number
  pf:          number
  voltage_v:   number
  bus:         string
  description: string
}

export interface ParsedLoadSchedule {
  rows:            LoadScheduleRow[]
  busGroups:       Map<string, LoadScheduleRow[]>
  detectedColumns: Record<string, string>
  warnings:        string[]
  totalRows:       number
  skippedRows:     number
}

const TAG_ALIASES  = ['tag', 'equipment tag', 'item', 'tag no', 'item no', '태그', '기기번호']
const TYPE_ALIASES = ['type', 'equip type', 'category', 'equipment type', '유형', '장비유형']
const KW_ALIASES   = ['kw', 'rated kw', 'power', 'rated power', 'kva', 'hp', '용량']
const PF_ALIASES   = ['pf', 'power factor', 'cos phi', 'cosφ', '역률']
const VLT_ALIASES  = ['voltage', 'kv', 'v', 'rated v', 'rated voltage', '전압']
const BUS_ALIASES  = ['bus', 'panel', 'mcc', 'connection', 'connected bus', 'feeder', '모선', '패널']
const DESC_ALIASES = ['description', 'service', 'remarks', '설명', '비고']

const MOTOR_KEYWORDS = ['motor', 'pump', 'fan', 'compressor', 'blower', 'conveyor',
                        '전동기', '펌프', '팬', '압축기', 'mot']
const GEN_KEYWORDS   = ['generator', 'gen', 'genset', '발전기']

// 태그 자체가 "G-1"/"M101"처럼 유형 문자로 시작하는 경우의 보조 판별.
// 예전엔 GEN_KEYWORDS/MOTOR_KEYWORDS에 단일 문자 'g'/'m'을 그대로 넣어 두는 바람에
// s.includes('g')가 "SWITCHGEAR", "LIGHTING" 같은 일반 부하 설명은 물론
// "PG-101"(펌프 태그)까지도 전부 '발전기'로 오분류시켰다 — 부하 목록표를
// 가져올 때 발전기가 아닌 설비들이 죄다 발전기로 둔갑하는 심각한 버그였다.
const GEN_TAG_PATTERN   = /^G[-_]?\d/i
const MOTOR_TAG_PATTERN = /^M[-_]?\d/i

/**
 * 짧은(3자 이하) 별칭은 단어 경계로 감싸 우연한 부분일치를 막는다.
 * motorListParser.ts의 looselyContains와 동일한 이유 — 별칭 'tag'가
 * 헤더 'Voltage'에 우연히 포함("vol-TAG-e")되어 전압 컬럼을 태그로
 * 잘못 인식하는 문제를 방지한다.
 */
function looselyContains(haystack: string, needle: string): boolean {
  if (needle.length > 3) return haystack.includes(needle)
  const esc = needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`(^|[^a-z0-9가-힣])${esc}([^a-z0-9가-힣]|$)`, 'i').test(haystack)
}

function findCol(headers: string[], aliases: string[]): number {
  const lc = headers.map(h => h?.toString().toLowerCase().trim() ?? '')
  for (const a of aliases) {
    const i = lc.findIndex(h => h === a || looselyContains(h, a) || looselyContains(a, h))
    if (i >= 0) return i
  }
  return -1
}

function parseNum(v: unknown, fb = 0): number {
  if (typeof v === 'number') return isNaN(v) ? fb : v
  if (typeof v === 'string') {
    const n = parseFloat(v.replace(/,(\d{3})(?!\d)/g, '$1').replace(',', '.').trim())
    return isNaN(n) ? fb : n
  }
  return fb
}

export function detectType(raw: string, tag: string): LoadEquipType {
  const s = (raw + ' ' + tag).toLowerCase()
  if (GEN_KEYWORDS.some(k => s.includes(k)) || GEN_TAG_PATTERN.test(tag))     return 'generator'
  if (MOTOR_KEYWORDS.some(k => s.includes(k)) || MOTOR_TAG_PATTERN.test(tag)) return 'motor'
  return 'load'
}

// ── 순수 파싱 로직 (시트 → 2차원 배열이 주어진 이후) ────────────────────────────
export function parseLoadScheduleRows(raw: unknown[][]): ParsedLoadSchedule {
  if (raw.length < 2) {
    return { rows: [], busGroups: new Map(), detectedColumns: {}, warnings: ['데이터 없음'], totalRows: 0, skippedRows: 0 }
  }

  // 헤더 행 탐지
  let hi = 0, maxFilled = 0
  for (let i = 0; i < Math.min(10, raw.length); i++) {
    const filled = (raw[i] as unknown[]).filter(c => c !== '' && c != null).length
    if (filled > maxFilled) { maxFilled = filled; hi = i }
  }
  const headers = (raw[hi] as unknown[]).map(h => h?.toString() ?? '')

  const tagIdx  = findCol(headers, TAG_ALIASES)
  const typeIdx = findCol(headers, TYPE_ALIASES)
  const kwIdx   = findCol(headers, KW_ALIASES)
  const pfIdx   = findCol(headers, PF_ALIASES)
  const vltIdx  = findCol(headers, VLT_ALIASES)
  const busIdx  = findCol(headers, BUS_ALIASES)
  const descIdx = findCol(headers, DESC_ALIASES)

  const warnings: string[] = []
  if (tagIdx  < 0) warnings.push('TAG 컬럼 미탐지')
  if (kwIdx   < 0) warnings.push('kW 컬럼 미탐지')
  if (busIdx  < 0) warnings.push('Bus/Panel 컬럼 미탐지 — 모두 BUS-1로 처리')

  const detectedColumns: Record<string, string> = {
    tag:  tagIdx  >= 0 ? headers[tagIdx]  : '',
    type: typeIdx >= 0 ? headers[typeIdx] : '',
    kw:   kwIdx   >= 0 ? headers[kwIdx]   : '',
    pf:   pfIdx   >= 0 ? headers[pfIdx]   : '',
    vlt:  vltIdx  >= 0 ? headers[vltIdx]  : '',
    bus:  busIdx  >= 0 ? headers[busIdx]  : '',
  }

  const kwColName = kwIdx >= 0 ? headers[kwIdx] : ''
  const rows: LoadScheduleRow[] = []
  let skippedRows = 0

  for (let i = hi + 1; i < raw.length; i++) {
    const row = raw[i] as unknown[]
    if (row.every(c => c === '' || c == null)) continue

    let kw = kwIdx >= 0 ? parseNum(row[kwIdx], 0) : 0
    if (kwColName.toLowerCase().includes('hp')) kw *= 0.7457
    if (kw <= 0) { skippedRows++; continue }

    const tag  = tagIdx  >= 0 ? (row[tagIdx]?.toString().trim()  || `ITEM-${i}`) : `ITEM-${i}`
    const typeRaw = typeIdx >= 0 ? (row[typeIdx]?.toString().trim() ?? '') : ''
    const equipType = detectType(typeRaw, tag)

    let pf = pfIdx >= 0 ? parseNum(row[pfIdx], 0.85) : 0.85
    if (pf > 1) pf /= 100
    if (pf <= 0 || pf > 1) pf = 0.85

    const rawVolt = vltIdx >= 0 ? parseNum(row[vltIdx], 380) : 380
    const voltage_v = rawVolt < 20 ? rawVolt * 1000 : rawVolt

    const bus  = busIdx  >= 0 ? (row[busIdx]?.toString().trim()  || 'BUS-1') : 'BUS-1'
    const desc = descIdx >= 0 ? (row[descIdx]?.toString().trim() || '') : ''

    rows.push({ tag, equipType, kw: Math.round(kw * 10) / 10, pf, voltage_v, bus, description: desc })
  }

  const busGroups = new Map<string, LoadScheduleRow[]>()
  for (const row of rows) {
    if (!busGroups.has(row.bus)) busGroups.set(row.bus, [])
    busGroups.get(row.bus)!.push(row)
  }

  return { rows, busGroups, detectedColumns, warnings, totalRows: rows.length, skippedRows }
}

// ── 메인 파서 (브라우저 File → XLSX 로딩 → 순수 파싱에 위임) ────────────────────
export function parseLoadSchedule(file: File): Promise<ParsedLoadSchedule> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const wb = XLSX.read(e.target?.result, { type: 'array' })
        const ws = wb.Sheets[wb.SheetNames[0]]
        const raw = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: '', blankrows: false })

        resolve(parseLoadScheduleRows(raw))
      } catch (err) {
        reject(new Error(`파싱 실패: ${err instanceof Error ? err.message : String(err)}`))
      }
    }
    reader.onerror = () => reject(new Error('파일 읽기 실패'))
    reader.readAsArrayBuffer(file)
  })
}
