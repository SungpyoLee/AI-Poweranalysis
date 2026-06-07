/**
 * Datasheet parameter extraction engine.
 * Regex-based — works fully offline, no AI required.
 */

export type DatasheetEquipType = 'transformer' | 'motor' | 'breaker'

export interface ParsedField {
  key:        string
  label:      string
  value:      number | string | null
  unit:       string
  confidence: 'high' | 'medium' | 'low'
  raw:        string
}

export interface ParseResult {
  equipType:    DatasheetEquipType
  fields:       ParsedField[]
  detectedType: DatasheetEquipType | null
  confidence:   'high' | 'medium' | 'low'   // aggregate
}

// ── Auto-detection ─────────────────────────────────────────────────────────────
export function detectEquipType(text: string): DatasheetEquipType | null {
  const scores: Record<DatasheetEquipType, number> = { transformer: 0, motor: 0, breaker: 0 }
  const t = text

  if (/transformer|변압기|winding|tap.?changer|primary.{1,20}secondary/i.test(t))  scores.transformer += 3
  if (/mva|hv.{0,10}lv|kva.{0,20}kv|no.?load.{0,15}loss|impedance.{0,10}volt/i.test(t)) scores.transformer += 2
  if (/vector.?group|turns?.?ratio|leakage.?reactance/i.test(t))                   scores.transformer += 2

  if (/\bmotor\b|전동기|induction.{0,10}machine|squirrel.?cage|rotor|stator/i.test(t)) scores.motor += 3
  if (/rpm|revolution|synchronous.{0,10}speed|locked.?rotor/i.test(t))             scores.motor += 2
  if (/ist?\s*\/\s*in|starting.{0,15}current|efficiency.{0,5}%|cos\s*phi/i.test(t)) scores.motor += 2

  if (/circuit.?breaker|차단기|\bvcb\b|\bacb\b|\bgcb\b|\bmccb\b|\bmcb\b/i.test(t)) scores.breaker += 3
  if (/\bicu\b|\bics\b|\bicm\b|interrupting.{0,10}cap|breaking.{0,10}cap/i.test(t)) scores.breaker += 3
  if (/making.{0,10}cap|short.?circuit.{0,15}break/i.test(t))                      scores.breaker += 2

  const top = (Object.entries(scores) as [DatasheetEquipType, number][])
    .sort(([, a], [, b]) => b - a)[0]
  return top[1] >= 2 ? top[0] : null
}

// ── Low-level helpers ──────────────────────────────────────────────────────────

/** Parse a number from a string that may use comma as thousands OR decimal separator. */
function parseNum(s: string): number {
  const c = s.replace(/\s/g, '')
  // comma followed by exactly 3 digits (and no more) → thousands separator
  return parseFloat(c.replace(/,(\d{3})(?!\d)/g, '$1').replace(',', '.'))
}

function tryMatch(
  text:      string,
  patterns:  RegExp[],
  transform?: (raw: string) => number | string,
): { value: number | string | null; raw: string; confidence: 'high' | 'medium' | 'low' } {
  for (let i = 0; i < patterns.length; i++) {
    const m = patterns[i].exec(text)
    if (!m) continue
    const captured = (m[1] ?? m[2] ?? m[3] ?? '').trim()
    const value    = transform ? transform(captured) : parseNum(captured)
    const conf     = (['high', 'medium', 'low'] as const)[Math.min(i, 2)]
    const raw      = m[0].slice(0, 80)
    return { value: (typeof value === 'number' && isNaN(value)) ? captured : value, raw, confidence: conf }
  }
  return { value: null, raw: '', confidence: 'low' }
}

function field(
  key: string, label: string, unit: string,
  text: string, patterns: RegExp[],
  transform?: (s: string) => number | string,
): ParsedField {
  const { value, raw, confidence } = tryMatch(text, patterns, transform)
  return { key, label, value, unit, confidence, raw }
}

function overallConfidence(fields: ParsedField[]): 'high' | 'medium' | 'low' {
  const found = fields.filter(f => f.value !== null)
  if (found.length === 0) return 'low'
  const c = { high: 0, medium: 0, low: 0 }
  for (const f of found) c[f.confidence]++
  if (c.high >= found.length * 0.6) return 'high'
  if (c.low  >= found.length * 0.6) return 'low'
  return 'medium'
}

// ── Tap range helper ───────────────────────────────────────────────────────────
function parseTapRange(text: string): {
  tap_min:          ParsedField
  tap_max:          ParsedField
  tap_step_percent: ParsedField
} {
  const mk = (
    key: string, label: string, unit: string,
    value: number | null, raw: string,
    confidence: 'high' | 'medium' | 'low',
  ): ParsedField => ({ key, label, value, unit, confidence, raw })

  // P1: ±N×step%  e.g. "±2×2.5%", "±16×0.625%"
  const p1 = /±\s*(\d+)\s*[×xX]\s*([\d.]+)\s*%/.exec(text)
  if (p1) {
    const n = parseInt(p1[1]), step = parseFloat(p1[2]), raw = p1[0].slice(0, 80)
    return {
      tap_min:          mk('tap_min',          '최소탭',   '',  -n,   raw, 'high'),
      tap_max:          mk('tap_max',          '최대탭',   '',  +n,   raw, 'high'),
      tap_step_percent: mk('tap_step_percent', '탭 스텝', '%', step, raw, 'high'),
    }
  }

  // Locate standalone step value (shared by P2/P3)
  const mStep = /(?:step(?:s?\s+of)?|per\s+step|간격)\s*[=:]\s*([\d.]+)\s*%/i.exec(text)
             ?? /in\s+(?:steps?\s+of\s+)?([\d.]+)\s*%\s*steps?/i.exec(text)
             ?? /\b([\d.]+)\s*%\s*(?:step|간격)\b/i.exec(text)
  const stepVal = mStep ? parseFloat(mStep[1]) : null
  const stepRaw = mStep ? mStep[0].slice(0, 80) : ''

  // P2: -X% to +Y%
  const p2 = /[-−]\s*([\d.]+)\s*%\s*(?:to|~|\/)\s*[+]?\s*([\d.]+)\s*%/i.exec(text)
  if (p2) {
    const lo = parseFloat(p2[1]), hi = parseFloat(p2[2]), raw = p2[0].slice(0, 80)
    if (stepVal !== null) {
      return {
        tap_min:          mk('tap_min',          '최소탭',   '', -Math.round(lo / stepVal), raw,     'medium'),
        tap_max:          mk('tap_max',          '최대탭',   '', +Math.round(hi / stepVal), raw,     'medium'),
        tap_step_percent: mk('tap_step_percent', '탭 스텝', '%', stepVal,                   stepRaw, 'high'),
      }
    }
    return {
      tap_min:          mk('tap_min',          '최소탭',   '', -Math.round(lo), raw, 'low'),
      tap_max:          mk('tap_max',          '최대탭',   '', +Math.round(hi), raw, 'low'),
      tap_step_percent: mk('tap_step_percent', '탭 스텝', '%', null,            '',  'low'),
    }
  }

  // P3: ±X%
  const p3 = /±\s*([\d.]+)\s*%/.exec(text)
  if (p3) {
    const pct = parseFloat(p3[1]), raw = p3[0].slice(0, 80)
    if (stepVal !== null) {
      const n = Math.round(pct / stepVal)
      return {
        tap_min:          mk('tap_min',          '최소탭',   '', -n,      raw,     'medium'),
        tap_max:          mk('tap_max',          '최대탭',   '', +n,      raw,     'medium'),
        tap_step_percent: mk('tap_step_percent', '탭 스텝', '%', stepVal, stepRaw, 'high'),
      }
    }
    return {
      tap_min:          mk('tap_min',          '최소탭',   '', null, raw, 'low'),
      tap_max:          mk('tap_max',          '최대탭',   '', null, raw, 'low'),
      tap_step_percent: mk('tap_step_percent', '탭 스텝', '%', null, raw, 'low'),
    }
  }

  return {
    tap_min:          mk('tap_min',          '최소탭',   '', null, '', 'low'),
    tap_max:          mk('tap_max',          '최대탭',   '', null, '', 'low'),
    tap_step_percent: mk('tap_step_percent', '탭 스텝', '%', null, '', 'low'),
  }
}

// ── Loss field helper (handles kW and W inputs) ────────────────────────────────
type LossPat = [RegExp, number, 'high' | 'medium' | 'low']

function parseLoss(key: string, label: string, patterns: LossPat[], text: string): ParsedField {
  for (const [re, div, conf] of patterns) {
    const m = re.exec(text)
    if (!m) continue
    const v = parseNum(m[1])
    if (isNaN(v)) continue
    return {
      key, label, unit: 'kW', confidence: conf,
      raw: m[0].slice(0, 80),
      value: div === 1 ? v : +(v / div).toFixed(3),
    }
  }
  return { key, label, value: null, unit: 'kW', confidence: 'low', raw: '' }
}

// ── Transformer parser ─────────────────────────────────────────────────────────
function parseTransformer(text: string): ParseResult {
  const t = text

  // sn_mva — unit captured inside regex to avoid positional bugs
  const snField = ((): ParsedField => {
    const pats: Array<[RegExp, 'MVA' | 'kVA', 'high' | 'medium' | 'low']> = [
      [/(?:rated|nominal|출력|정격)\s*(?:power|capacity|용량)\s*[=:]\s*([\d.,]+)\s*MVA/i, 'MVA', 'high'],
      [/(?:power|capacity|rating|용량)\s*[=:]\s*([\d.,]+)\s*MVA/i,                        'MVA', 'high'],
      [/\b([\d.,]+)\s*MVA\b/i,                                                             'MVA', 'medium'],
      [/(?:rated|nominal|출력|정격)\s*(?:power|capacity|용량)\s*[=:]\s*([\d.,]+)\s*kVA/i, 'kVA', 'medium'],
      [/(?:power|capacity|rating|용량)\s*[=:]\s*([\d.,]+)\s*kVA/i,                        'kVA', 'medium'],
      [/\b([\d.,]+)\s*kVA\b/i,                                                             'kVA', 'low'],
    ]
    for (const [re, unit, conf] of pats) {
      const m = re.exec(t)
      if (!m) continue
      const v = parseNum(m[1])
      if (isNaN(v)) continue
      const mva = unit === 'kVA' ? +(v / 1000).toFixed(4) : v
      return { key: 'sn_mva', label: '정격용량', value: mva, unit: 'MVA', confidence: conf, raw: m[0].slice(0, 80) }
    }
    return { key: 'sn_mva', label: '정격용량', value: null, unit: 'MVA', confidence: 'low', raw: '' }
  })()

  // Voltage ratio shared by HV / LV fields
  const voltageRatio = ((): { hv: number; lv: number; raw: string } | null => {
    for (const re of [
      /\b([\d.,]+)\s*kV\s*\/\s*([\d.,]+)\s*kV\b/i,   // 154kV / 22.9kV
      /\b([\d.,]+)\s*\/\s*([\d.,]+)\s*kV\b/i,          // 154/22.9kV
    ]) {
      const m = re.exec(t)
      if (!m) continue
      const hv = parseNum(m[1]), lv = parseNum(m[2])
      if (hv > lv && lv > 0) return { hv, lv, raw: m[0].slice(0, 80) }
    }
    return null
  })()

  // vn_hv_kv
  const hvField = ((): ParsedField => {
    const r = tryMatch(t, [
      /(?:HV|high[\s-]?volt(?:age)?)\s*(?:winding|side|voltage)?\s*[=:]\s*([\d.,]+)\s*kV/i,
      /(?:primary|1차|1차측)\s*(?:winding|side|voltage|전압)?\s*[=:]\s*([\d.,]+)\s*kV/i,
    ])
    if (r.value !== null) return { key: 'vn_hv_kv', label: 'HV 정격전압', ...r, unit: 'kV' }
    if (voltageRatio) return { key: 'vn_hv_kv', label: 'HV 정격전압', value: voltageRatio.hv, unit: 'kV', confidence: 'medium', raw: voltageRatio.raw }
    return { key: 'vn_hv_kv', label: 'HV 정격전압', value: null, unit: 'kV', confidence: 'low', raw: '' }
  })()

  // vn_lv_kv
  const lvField = ((): ParsedField => {
    const r = tryMatch(t, [
      /(?:LV|low[\s-]?volt(?:age)?)\s*(?:winding|side|voltage)?\s*[=:]\s*([\d.,]+)\s*kV/i,
      /(?:secondary|2차|2차측)\s*(?:winding|side|voltage|전압)?\s*[=:]\s*([\d.,]+)\s*kV/i,
    ])
    if (r.value !== null) return { key: 'vn_lv_kv', label: 'LV 정격전압', ...r, unit: 'kV' }
    if (voltageRatio) return { key: 'vn_lv_kv', label: 'LV 정격전압', value: voltageRatio.lv, unit: 'kV', confidence: 'medium', raw: voltageRatio.raw }
    return { key: 'vn_lv_kv', label: 'LV 정격전압', value: null, unit: 'kV', confidence: 'low', raw: '' }
  })()

  // vk_percent — Uk / Vk / Impedance Voltage / %Z
  const vkField = field('vk_percent', '단락전압 Vk%', '%', t, [
    /[Uu][Kk]\s*[=:]\s*([\d.,]+)\s*%?/,
    /[Vv][Kk]\s*[=:]\s*([\d.,]+)\s*%?/,
    /impedance\s*volt(?:age)?\s*[=:]\s*([\d.,]+)\s*%/i,
    /impedance\s*volt(?:age)?\s+([\d.,]+)\s*%/i,
    /(?:short[\s-]?circuit|sc)\s*impedance\s*[=:]\s*([\d.,]+)\s*%/i,
    /%\s*[Zz]\s*[=:]\s*([\d.,]+)/,
    /impedance\s+([\d.,]+)\s*%/i,
  ])

  // vkr_percent — resistive component (ukr / vkr)
  const vkrField = field('vkr_percent', '저항분 Vkr%', '%', t, [
    /[Vv][Kk][Rr]\s*[=:]\s*([\d.,]+)\s*%?/,
    /[Uu][Kk][Rr]\s*[=:]\s*([\d.,]+)\s*%?/,
    /resist(?:ive|ance)\s*(?:component|part)?\s*[=:]\s*([\d.,]+)\s*%/i,
    /[Pp]-component\s*[=:]\s*([\d.,]+)\s*%/i,
  ])

  // pfe_kw — no-load / iron loss
  const pfeField = parseLoss('pfe_kw', '무부하손실 P₀', [
    [/(?:no[\s-]?load|iron|core|무부하|철손)\s*loss(?:es)?\s*[=:]\s*([\d.,]+)\s*kW/i,    1,    'high'],
    [/[Pp][_\s]?(?:fe|0)\s*[=:]\s*([\d.,]+)\s*kW/i,                                      1,    'high'],
    [/iron\s*loss(?:es)?\s+([\d.,]+)\s*kW/i,                                              1,    'medium'],
    [/no[\s-]?load\s*loss(?:es)?\s+([\d.,]+)\s*kW/i,                                     1,    'medium'],
    [/(?:no[\s-]?load|iron|core)\s*loss(?:es)?\s*[=:]\s*([\d.,]+)\s*W\b/i,               1000, 'medium'],
    [/[Pp]0\s*[=:]\s*([\d.,]+)\s*W\b/i,                                                  1000, 'low'],
  ], t)

  // pcu_kw — copper / load / short-circuit loss
  const pcuField = parseLoss('pcu_kw', '부하손실 Pcu', [
    [/(?:copper|load|동손|부하)\s*loss(?:es)?\s*[=:]\s*([\d.,]+)\s*kW/i,                  1,    'high'],
    [/short[\s-]?circuit\s*loss(?:es)?\s*[=:]\s*([\d.,]+)\s*kW/i,                         1,    'high'],
    [/[Pp][_\s]?[Cc][Uu]\s*[=:]\s*([\d.,]+)\s*kW/i,                                      1,    'high'],
    [/copper\s*loss(?:es)?\s+([\d.,]+)\s*kW/i,                                            1,    'medium'],
    [/load\s*loss(?:es)?\s+([\d.,]+)\s*kW/i,                                              1,    'medium'],
    [/(?:copper|load)\s*loss(?:es)?\s*[=:]\s*([\d.,]+)\s*W\b/i,                           1000, 'medium'],
    [/short[\s-]?circuit\s*loss(?:es)?\s*[=:]\s*([\d.,]+)\s*W\b/i,                       1000, 'low'],
  ], t)

  // i0_percent — no-load / exciting current
  const i0Field = field('i0_percent', '무부하전류 i₀%', '%', t, [
    /[Ii]0\s*(?:%|percent)?\s*[=:]\s*([\d.,]+)\s*%?/,
    /no[\s-]?load\s*current\s*[=:]\s*([\d.,]+)\s*%/i,
    /excit(?:ation|ing)\s*current\s*[=:]\s*([\d.,]+)\s*%/i,
    /여자\s*전류\s*[=:]\s*([\d.,]+)\s*%/,
    /무부하\s*전류\s*[=:]\s*([\d.,]+)\s*%/,
  ])

  // Tap range
  const { tap_min, tap_max, tap_step_percent } = parseTapRange(t)

  const fields: ParsedField[] = [
    snField, hvField, lvField,
    vkField, vkrField,
    pfeField, pcuField, i0Field,
    tap_min, tap_max, tap_step_percent,
  ]

  return { equipType: 'transformer', fields, detectedType: detectEquipType(text), confidence: overallConfidence(fields) }
}

// ── Motor parser ───────────────────────────────────────────────────────────────
function parseMotor(text: string): ParseResult {
  const t = text

  const fields: ParsedField[] = [
    field('rated_kw', '정격출력', 'kW', t, [
      /[Pp](?:rated|_?n|nom(?:inal)?)?\s*[=:]\s*([\d.,]+)\s*kW/i,
      /(?:rated|nominal|output)\s*power\s*[=:]\s*([\d.,]+)\s*kW/i,
      /\b([\d.,]+)\s*kW\b/i,
    ]),

    field('vn_kv', '정격전압', 'kV', t, [
      /[Uu](?:_?n|rated|nom)?\s*[=:]\s*([\d.,]+)\s*kV/i,
      /(?:rated|nominal|supply)\s*volt(?:age)?\s*[=:]\s*([\d.,]+)\s*kV/i,
      /(?:rated|nominal|supply)\s*volt(?:age)?\s*[=:]\s*([\d.,]+)\s*[Vv]\b/i,
      /\b([\d.,]+)\s*[Vv]\b/i,
    ], s => {
      const v = parseNum(s)
      return v >= 50 ? +(v / 1000).toFixed(4) : v
    }),

    field('efficiency', '효율', '%', t, [
      /[Ee]ff(?:iciency)?\s*[=:η]\s*([\d.,]+)\s*%/i,
      /η\s*[=:]\s*([\d.,]+)\s*%/,
      /\beff\b.*?([\d.,]+)\s*%/i,
    ]),

    field('power_factor', '역률 cos φ', '', t, [
      /cos\s*[φΦ\s]?\s*[=:]\s*(0\.[\d]+|\d[\d.,]*)/i,
      /[Pp](?:ower)?\s*[Ff](?:actor)?\s*[=:]\s*(0\.[\d]+)/i,
      /[Pp]\.?[Ff]\.?\s*[=:]\s*(0\.[\d]+)/i,
      /\bpf\s*[=:]\s*(0\.[\d]+)/i,
    ], s => {
      const v = parseNum(s)
      return v > 1 ? +(v / 100).toFixed(2) : v
    }),

    field('starting_current_multiple', '기동전류비 Is/In', '', t, [
      /[Ii]s(?:t)?\s*\/\s*[Ii]n\s*[=:]\s*([\d.,]+)/i,
      /(?:starting|locked[- ]rotor)\s*current\s*(?:ratio|multiple)?\s*[=:]\s*([\d.,]+)\s*[xX]?/i,
      /[Kk]i\s*[=:]\s*([\d.,]+)/,
      /\b([3-9]|[1-9]\d)\s*[xX]\s*[Ii]n/i,
    ]),

    {
      key: 'starting_method', label: '기동방법', unit: '', confidence: 'high',
      ...(() => {
        const m = /(DOL|[Dd]irect[\s-][Oo]n[\s-][Ll]ine|[Ss]tar[\s-]?[Dd]elta|Y[\s-]?\/[\s-]?Δ|[Ss]oft[\s-]?[Ss]tarter|VFD|[Ff]requency[\s\w]*[Cc]onverter)/i.exec(t)
        if (!m) return { value: null as null, raw: '' }
        let method = m[1]
        if (/dol|direct.on.line/i.test(method))    method = 'DOL'
        else if (/star.?delta|y.*delta/i.test(method)) method = 'Star-Delta'
        else if (/soft/i.test(method))              method = 'Soft-Starter'
        else if (/vfd|frequency/i.test(method))     method = 'VFD'
        return { value: method, raw: m[0].slice(0, 60) }
      })(),
    } as ParsedField,
  ]

  return { equipType: 'motor', fields, detectedType: detectEquipType(text), confidence: overallConfidence(fields) }
}

// ── Breaker parser ─────────────────────────────────────────────────────────────
function parseBreaker(text: string): ParseResult {
  const t = text

  const fields: ParsedField[] = [
    field('rated_kv', '정격전압', 'kV', t, [
      /[Uu](?:_?n|r(?:ated)?|nom)?\s*[=:]\s*([\d.,]+)\s*kV/i,
      /(?:rated|nominal)\s*volt(?:age)?\s*[=:]\s*([\d.,]+)\s*kV/i,
      /\b([\d.,]+)\s*kV\b/i,
    ]),

    field('rated_kA', '정격단락전류', 'kA', t, [
      /[Ii](?:_?n|rated|nom)?\s*[=:]\s*([\d.,]+)\s*[Aa]\b/i,
      /(?:rated|nominal)\s*current\s*[=:]\s*([\d.,]+)\s*[Aa]\b/i,
      /\b([\d.,]+)\s*[Aa]\b/i,
    ], s => +(parseNum(s) / 1000).toFixed(3)),

    field('interrupt_kA', '차단용량 Icu', 'kA', t, [
      /[Ii]cu\s*[=:]\s*([\d.,]+)\s*kA/i,
      /(?:ultimate|rated)\s*short[\s-]?circuit\s*break(?:ing)?\s*cap\w*\s*[=:]\s*([\d.,]+)\s*kA/i,
      /break(?:ing)?\s*cap\w*\s*[=:]\s*([\d.,]+)\s*kA/i,
      /\b([\d.,]+)\s*kA\b/i,
    ]),

    field('breaking_capacity_ka', '차단용량 Icw', 'kA', t, [
      /[Ii]cw\s*[=:]\s*([\d.,]+)\s*kA/i,
      /(?:rated|short[\s-]?time)\s*with[\s-]?stand\w*\s*[=:]\s*([\d.,]+)\s*kA/i,
    ]),

    field('making_capacity_ka', '투입용량 Icm', 'kA', t, [
      /[Ii]cm\s*[=:]\s*([\d.,]+)\s*kA/i,
      /making\s*cap\w*\s*[=:]\s*([\d.,]+)\s*kA/i,
      /peak\s*with[\s-]?stand\w*\s*[=:]\s*([\d.,]+)\s*kA/i,
    ]),

    {
      key: 'breaker_type', label: '차단기 형식', unit: '', confidence: 'high',
      ...(() => {
        const m = /\b(VCB|ACB|GCB|MCB|MCCB|[Vv]acuum\s+[Cc]ircuit|[Aa]ir\s+[Cc]ircuit|[Gg]as\s+[Cc]ircuit|SF6)/i.exec(t)
        if (!m) return { value: null as null, raw: '' }
        let bt = m[1]
        if (/vacuum|VCB/i.test(bt)) bt = 'VCB'
        else if (/air|ACB/i.test(bt)) bt = 'ACB'
        else if (/gas|GCB|SF6/i.test(bt)) bt = 'GCB'
        return { value: bt, raw: m[0].slice(0, 60) }
      })(),
    } as ParsedField,
  ]

  return { equipType: 'breaker', fields, detectedType: detectEquipType(text), confidence: overallConfidence(fields) }
}

// ── Public API ─────────────────────────────────────────────────────────────────
export function parseDatasheet(text: string, type: DatasheetEquipType): ParseResult {
  switch (type) {
    case 'transformer': return parseTransformer(text)
    case 'motor':       return parseMotor(text)
    case 'breaker':     return parseBreaker(text)
  }
}

/** Convert ParsedFields to a partial Equipment patch (null fields excluded). */
export function buildEquipmentPatch(
  fields: ParsedField[],
): Record<string, number | string | boolean> {
  const patch: Record<string, number | string | boolean> = {}
  for (const f of fields) {
    if (f.value === null || f.value === '') continue
    patch[f.key] = f.value
  }
  return patch
}
