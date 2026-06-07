/**
 * motorListParser.ts
 * MCC Motor List Excel/CSV 파싱 + 컬럼 자동 매핑 + MCC 그룹화
 *
 * 지원 형식: XLSX · XLS · CSV
 * 라이브러리: xlsx (SheetJS)
 */

import * as XLSX from 'xlsx'

// ── 파싱 결과 타입 ─────────────────────────────────────────────────────────────
export interface MotorRow {
  tag:       string   // 태그 번호 (예: P-101A)
  kw:        number   // 정격 출력 (kW)
  pf:        number   // 역률 (0~1)
  voltage_v: number   // 전압 (V 단위 — 내부 통일)
  mcc:       string   // MCC / 배전반 이름
}

export interface ColumnMap {
  tag:     string   // 인식된 헤더명 (없으면 '')
  kw:      string
  pf:      string
  voltage: string
  mcc:     string
}

export interface ParsedMotorList {
  rows:             MotorRow[]
  mccGroups:        Map<string, MotorRow[]>
  detectedColumns:  ColumnMap
  warnings:         string[]
  totalRows:        number    // 유효 행 수 (kw > 0)
  skippedRows:      number    // 건너뜀 행 수
}

// ── 컬럼 별칭 사전 ─────────────────────────────────────────────────────────────
const TAG_ALIASES  = ['tag', 'motor tag', 'equipment', 'tag no', 'item no',
                      'tag number', 'motor no', 'item', '태그', '기기번호', '기기 번호', '번호']
const KW_ALIASES   = ['kw', 'rated power', 'power', 'rated_kw', 'motor kw', 'rated kw',
                      'kw rated', 'power (kw)', 'power(kw)', '용량', '정격', '정격출력', 'hp']
const PF_ALIASES   = ['pf', 'power factor', 'cos phi', 'p.f.', 'cosφ', 'cos φ',
                      'pf (run)', 'p.f', '역률', 'power_factor']
const VLT_ALIASES  = ['voltage', 'kv', 'v', 'volt', 'rated voltage', 'vn', 'vn (v)',
                      'vn(v)', 'motor v', 'voltage (v)', '전압', '정격전압']
const MCC_ALIASES  = ['mcc', 'switchboard', 'panel', 'distribution board', 'mcc panel',
                      'feeder', 'source', 'swgr', 'board', '배전반', 'mcc 번호', 'mcc no',
                      'panel no', 'panel name']

// ── 내부 헬퍼 ──────────────────────────────────────────────────────────────────
function findColumn(headers: string[], aliases: string[]): number {
  const lc = headers.map(h => h?.toString().toLowerCase().trim().replace(/\s+/g, ' ') ?? '')
  // 1순위: 완전 일치
  for (const alias of aliases) {
    const idx = lc.findIndex(h => h === alias)
    if (idx >= 0) return idx
  }
  // 2순위: 포함 관계
  for (const alias of aliases) {
    const idx = lc.findIndex(h => h.includes(alias) || alias.includes(h))
    if (idx >= 0) return idx
  }
  return -1
}

/**
 * 문자열/숫자를 숫자로 변환.
 * 유럽식 쉼표 소수점(1,5) 및 천단위 구분(1,500)을 구분.
 */
function parseNum(v: unknown, fallback = 0): number {
  if (typeof v === 'number') return isNaN(v) ? fallback : v
  if (typeof v === 'string') {
    const s = v.trim()
    if (!s) return fallback
    // 천단위 쉼표 제거 후 파싱
    const n = parseFloat(s.replace(/,(\d{3})(?!\d)/g, '$1').replace(',', '.'))
    return isNaN(n) ? fallback : n
  }
  return fallback
}

/**
 * HP → kW 변환 (1 HP ≈ 0.7457 kW).
 * kW 컬럼 헤더에 'hp'가 포함된 경우 자동 변환.
 */
function maybeConvertHP(kw: number, colName: string): number {
  return colName.toLowerCase().includes('hp') ? kw * 0.7457 : kw
}

/**
 * 전압 값을 V 단위로 정규화.
 * < 20 → kV 단위로 해석 → × 1000
 */
function normalizeVoltageToV(v: number): number {
  if (v <= 0) return 380
  return v < 20 ? v * 1000 : v
}

// ── 메인 파서 ─────────────────────────────────────────────────────────────────
export function parseMotorList(file: File): Promise<ParsedMotorList> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()

    reader.onload = (e) => {
      try {
        const wb = XLSX.read(e.target?.result, { type: 'array' })
        if (!wb.SheetNames.length) {
          reject(new Error('엑셀 파일에 시트가 없습니다'))
          return
        }

        const ws    = wb.Sheets[wb.SheetNames[0]]
        const raw   = XLSX.utils.sheet_to_json<unknown[]>(ws, {
          header: 1, defval: '', blankrows: false,
        })

        if (raw.length < 2) {
          resolve({
            rows: [], mccGroups: new Map(),
            detectedColumns: { tag: '', kw: '', pf: '', voltage: '', mcc: '' },
            warnings: ['데이터 행이 없습니다. 헤더 + 데이터 행이 최소 2줄 필요합니다.'],
            totalRows: 0, skippedRows: 0,
          })
          return
        }

        // ── 헤더 행 탐지 (최대 10행 내에서 가장 많은 컬럼이 채워진 행) ──────────
        let headerRowIdx = 0
        let maxFilled = 0
        for (let i = 0; i < Math.min(10, raw.length); i++) {
          const filled = (raw[i] as unknown[]).filter(c => c !== '' && c != null).length
          if (filled > maxFilled) { maxFilled = filled; headerRowIdx = i }
        }
        const headers = (raw[headerRowIdx] as unknown[]).map(h => h?.toString() ?? '')

        // ── 컬럼 인덱스 탐지 ─────────────────────────────────────────────────
        const tagIdx = findColumn(headers, TAG_ALIASES)
        const kwIdx  = findColumn(headers, KW_ALIASES)
        const pfIdx  = findColumn(headers, PF_ALIASES)
        const vltIdx = findColumn(headers, VLT_ALIASES)
        const mccIdx = findColumn(headers, MCC_ALIASES)

        const warnings: string[] = []
        const detectedColumns: ColumnMap = {
          tag:     tagIdx >= 0 ? headers[tagIdx] : '',
          kw:      kwIdx  >= 0 ? headers[kwIdx]  : '',
          pf:      pfIdx  >= 0 ? headers[pfIdx]  : '',
          voltage: vltIdx >= 0 ? headers[vltIdx] : '',
          mcc:     mccIdx >= 0 ? headers[mccIdx] : '',
        }

        if (tagIdx < 0) warnings.push('TAG 컬럼 미탐지 — 행 번호로 대체합니다')
        if (kwIdx  < 0) warnings.push('kW 컬럼 미탐지 — 0 kW로 처리하여 건너뜁니다')
        if (pfIdx  < 0) warnings.push('PF 컬럼 미탐지 — 기본값 0.85 사용')
        if (vltIdx < 0) warnings.push('Voltage 컬럼 미탐지 — 기본값 380 V 사용')
        if (mccIdx < 0) warnings.push('MCC 컬럼 미탐지 — 전체를 MCC-1 그룹으로 처리합니다')

        const kwColName = kwIdx >= 0 ? headers[kwIdx] : ''

        // ── 데이터 행 파싱 ────────────────────────────────────────────────────
        const rows: MotorRow[] = []
        let skippedRows = 0

        for (let i = headerRowIdx + 1; i < raw.length; i++) {
          const row = raw[i] as unknown[]
          // 빈 행 건너뜀
          if (row.every(c => c === '' || c == null)) continue

          const rawKW = kwIdx >= 0 ? parseNum(row[kwIdx], 0) : 0
          const kw    = maybeConvertHP(rawKW, kwColName)

          if (kw <= 0) { skippedRows++; continue }

          const tag      = tagIdx  >= 0
            ? (row[tagIdx]?.toString().trim() || `M-${i}`)
            : `M-${i}`

          let pf = pfIdx >= 0 ? parseNum(row[pfIdx], 0.85) : 0.85
          if (pf > 1) pf = pf / 100   // 퍼센트로 입력된 경우 (e.g., 85 → 0.85)
          if (pf <= 0 || pf > 1) pf = 0.85

          const rawVolt  = vltIdx >= 0 ? parseNum(row[vltIdx], 380) : 380
          const voltage_v = normalizeVoltageToV(rawVolt)

          const mcc = mccIdx >= 0
            ? (row[mccIdx]?.toString().trim() || 'MCC-1')
            : 'MCC-1'

          rows.push({ tag, kw: Math.round(kw * 10) / 10, pf, voltage_v, mcc })
        }

        // ── MCC 그룹화 ────────────────────────────────────────────────────────
        const mccGroups = new Map<string, MotorRow[]>()
        for (const row of rows) {
          if (!mccGroups.has(row.mcc)) mccGroups.set(row.mcc, [])
          mccGroups.get(row.mcc)!.push(row)
        }

        resolve({
          rows, mccGroups, detectedColumns, warnings,
          totalRows: rows.length, skippedRows,
        })
      } catch (err) {
        reject(new Error(`파싱 실패: ${err instanceof Error ? err.message : String(err)}`))
      }
    }

    reader.onerror = () => reject(new Error('파일 읽기 실패'))
    reader.readAsArrayBuffer(file)
  })
}
