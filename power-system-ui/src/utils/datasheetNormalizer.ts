/**
 * Datasheet text normalization.
 * Pure functions — no side effects, no imports.
 */

const UNICODE_MAP: [RegExp, string][] = [
  [/μ/gi,       'u'],      // μ (micro)
  [/Ω/g,        'Ohm'],    // Ω
  [/°\s*C/g,    'degC'],   // °C
  [/°\s*F/g,    'degF'],   // °F
  [/°/g,        'deg'],    // remaining °
  [/×/g,        'x'],      // ×
  [/±/g,        '+/-'],    // ±
  [/≤/g,        '<='],     // ≤
  [/≥/g,        '>='],     // ≥
  [/≠/g,        '!='],     // ≠
  [/≈/g,        '~='],     // ≈
  [/²/g,        '^2'],     // ²
  [/³/g,        '^3'],     // ³
  [/’/g,        "'"],      // '
  [/[“”]/g, '"'],     // " "
  [/[–—]/g, '-'],     // en/em dash
  [/ /g,        ' '],      // non-breaking space
  [/­/g,        ''],       // soft hyphen
  [//g,        '-'],      // PDF bullet artifact
  [/�/g,        ''],       // Unicode replacement char
]

/**
 * Full normalization pipeline:
 * 1. Convert unicode symbols
 * 2. Normalize line endings
 * 3. Collapse excess blank lines
 * 4. Collapse duplicate spaces (preserve newlines)
 * 5. Trim each line
 */
export function normalizeText(raw: string): string {
  let t = raw

  // 1. Unicode symbol conversion
  for (const [pattern, replacement] of UNICODE_MAP) {
    t = t.replace(pattern, replacement)
  }

  // 2. Normalize line endings
  t = t.replace(/\r\n|\r/g, '\n')

  // 3. Collapse 3+ consecutive blank lines to 2
  t = t.replace(/\n{3,}/g, '\n\n')

  // 4. Collapse duplicate spaces / tabs (not newlines)
  t = t.replace(/[^\S\n]+/g, ' ')

  // 5. Trim each line
  t = t.split('\n').map(l => l.trim()).join('\n')

  return t.trim()
}

/** Returns char count of meaningful (non-whitespace) content. */
export function meaningfulLength(text: string): number {
  return text.replace(/\s/g, '').length
}
