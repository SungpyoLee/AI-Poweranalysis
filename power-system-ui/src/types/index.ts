// ── Equipment types ──────────────────────────────────────────────────────────
export type EquipmentType =
  | 'bus'
  | 'transformer'
  | 'breaker'
  | 'motor'
  | 'generator'

// ── Connection rules: which target types are allowed per source type ─────────
export const CONNECTION_RULES: Record<EquipmentType, EquipmentType[]> = {
  bus:         ['transformer', 'breaker', 'motor', 'generator'],
  transformer: ['bus', 'breaker'],
  breaker:     ['bus', 'motor', 'generator', 'transformer'],
  motor:       ['bus', 'breaker'],
  generator:   ['bus', 'breaker'],
}

// ── Per-equipment property shapes ────────────────────────────────────────────
export interface BusProperties {
  name: string
  vn_kv: number
  busType: 'PQ' | 'PV' | 'Slack'
}

export interface TransformerProperties {
  name: string
  sn_mva: number
  vn_hv_kv: number
  vn_lv_kv: number
  vk_percent: number
  xr_ratio: number
}

export interface BreakerProperties {
  name: string
  rated_kA: number
  is_closed: boolean
  interrupt_kA: number
}

export interface MotorProperties {
  name: string
  p_kw: number
  vn_kv: number
  pf: number
  efficiency: number
}

export interface GeneratorProperties {
  name: string
  p_mw: number
  vn_kv: number
  pf: number
  vm_pu: number
}

export interface CableProperties {
  name: string
  length_km: number
  r_ohm_per_km: number
  x_ohm_per_km: number
  max_i_ka: number
}

export type EquipmentProperties =
  | BusProperties
  | TransformerProperties
  | BreakerProperties
  | MotorProperties
  | GeneratorProperties

// ── Node data passed into ReactFlow ─────────────────────────────────────────
export interface NodeData {
  equipmentType: EquipmentType
  props: EquipmentProperties
  selected?: boolean
}

// ── Edge data (Cable) ────────────────────────────────────────────────────────
export interface EdgeData {
  props: CableProperties
}

// ── Palette item descriptor ──────────────────────────────────────────────────
export interface PaletteItem {
  type: EquipmentType
  label: string
  description: string
}

export const PALETTE_ITEMS: PaletteItem[] = [
  { type: 'bus',         label: 'Bus',         description: '모선' },
  { type: 'transformer', label: 'Transformer', description: '변압기' },
  { type: 'breaker',     label: 'Breaker',     description: '차단기' },
  { type: 'motor',       label: 'Motor',       description: '전동기' },
  { type: 'generator',   label: 'Generator',   description: '발전기' },
]

// ── Default property factories ───────────────────────────────────────────────
let _counter: Record<string, number> = {}
function seq(key: string): number {
  _counter[key] = (_counter[key] ?? 0) + 1
  return _counter[key]
}

export function defaultProps(type: EquipmentType): EquipmentProperties {
  switch (type) {
    case 'bus':
      return { name: `Bus-${seq('bus')}`, vn_kv: 22.9, busType: 'PQ' } as BusProperties
    case 'transformer':
      return { name: `TR-${seq('tr')}`, sn_mva: 30, vn_hv_kv: 154, vn_lv_kv: 22.9, vk_percent: 12, xr_ratio: 10 } as TransformerProperties
    case 'breaker':
      return { name: `CB-${seq('cb')}`, rated_kA: 40, is_closed: true, interrupt_kA: 25 } as BreakerProperties
    case 'motor':
      return { name: `M-${seq('mot')}`, p_kw: 500, vn_kv: 0.4, pf: 0.85, efficiency: 92 } as MotorProperties
    case 'generator':
      return { name: `G-${seq('gen')}`, p_mw: 10, vn_kv: 11, pf: 0.9, vm_pu: 1.0 } as GeneratorProperties
  }
}

export function defaultCableProps(): CableProperties {
  return { name: `Cable-${seq('cable')}`, length_km: 1.0, r_ohm_per_km: 0.164, x_ohm_per_km: 0.1, max_i_ka: 0.5 }
}
