// =============================================================================
// PowerFlow Analyzer — Equipment Data Model v2
// IEC / pandapower 기준 정렬
// 해석 결과는 Equipment에 저장하지 않고 analysisStore에서 별도 관리
// =============================================================================

// ── Base Equipment ────────────────────────────────────────────────────────────
export interface BaseEquipment {
  id: string          // ReactFlow 노드/엣지 ID와 일치
  name: string
  tag?: string        // P2-6: EPC TAG 번호 (예: 52-B001, T-101, M-201A)
  description: string
  in_service: boolean // false = 계산 제외
}

// ── Arc Flash Enclosure Type (IEEE 1584-2018 §4.1) ────────────────────────────
export type ArcFlashEnclosureType =
  | 'OPEN_AIR'        // overhead conductors, open busbars
  | 'LV_SWITCHGEAR'   // ≤ 1 kV metal-enclosed switchgear / distribution board
  | 'MCC'             // MCC / control panel ≤ 1 kV
  | 'MV_SWITCHGEAR'   // 1–15 kV metal-clad or metal-enclosed switchgear
  | 'HV_SWITCHGEAR'   // > 15 kV air-insulated switchgear
  | 'CABLE'           // cable busway / tray

// ── Bus (IEC 60038) ───────────────────────────────────────────────────────────
export interface Bus extends BaseEquipment {
  equipmentType: 'bus'
  vn_kv: number
  busType: 'PQ' | 'PV' | 'Slack'
  // External grid parameters (Slack bus only — IEC 60909 Thevenin source)
  sc_mva?:              number                 // Grid Sk'' MVA, default 5000
  xr_ratio?:            number                 // Grid X/R ratio, default 10
  x0r0_ratio?:          number                 // Grid X0/R0 for zero-seq, default = xr_ratio
  // Arc flash (IEEE 1584-2018)
  working_distance_mm?: number                 // default 455 mm
  enclosure_type?:      ArcFlashEnclosureType  // equipment enclosure category
  // 해석 결과(vm_pu, va_degree)는 analysisStore.loadflow.buses[id]에서 관리
}

// ── Transformer Vector Group (IEC 60076-1) ────────────────────────────────────
// HV-LV winding connection determines zero-sequence current flow paths.
// Dy/Yd: HV Delta blocks zero-seq; YNy/YNyn: grounded Y allows zero-seq.
export type TransformerVectorGroup =
  | 'Dyn11' | 'Dyn1'           // Delta HV, grounded Y LV (most common in industry)
  | 'YNyn0' | 'YNyn11'         // Grounded Y both sides
  | 'YNd11' | 'YNd1'           // Grounded Y HV, Delta LV
  | 'Yyn0'  | 'Yyn11'          // Ungrounded Y HV, grounded Y LV
  | 'Dd0'   | 'Dz0'            // Delta–Delta / Delta–Zigzag
  | 'Yzn11' | 'Yzn1'           // Ungrounded Y HV, grounded zigzag LV

// ── Transformer (IEC 60076 2-winding) ─────────────────────────────────────────
export interface Transformer extends BaseEquipment {
  equipmentType: 'transformer'
  sn_mva: number
  vn_hv_kv: number
  vn_lv_kv: number
  vk_percent: number
  vkr_percent: number    // 단락 전압 저항분 (%) — pandapower 기준
  pfe_kw: number
  i0_percent: number
  tap_pos: number
  tap_neutral: number
  tap_min: number
  tap_max: number
  tap_step_percent: number
  // IEC 60076 추가 데이터
  vector_group?:    TransformerVectorGroup  // 결선 방식 (기본: Dyn11)
  vk0_percent?:     number   // 영상분 단락전압 (%) — 비대칭 단락계산용
  vkr0_percent?:    number   // 영상분 저항분 (%)
}

// ── P3-2: Three-Winding Transformer (IEC 60076) ───────────────────────────────
// Star equivalent: Z_hv, Z_mv, Z_lv between buses and virtual neutral node.
// vk values are short-circuit voltages from paired winding tests (IEC 60076-1).
export interface ThreeWindingTransformer extends BaseEquipment {
  equipmentType:    'transformer3w'
  sn_hv_mva:        number   // HV winding MVA
  sn_mv_mva:        number   // MV winding MVA
  sn_lv_mva:        number   // LV winding MVA
  vn_hv_kv:         number
  vn_mv_kv:         number
  vn_lv_kv:         number
  // Short-circuit voltages from paired tests (IEC 60076-1 §8.9)
  vk_hv_percent:    number   // HV–MV test, referred to HV side
  vk_mv_percent:    number   // HV–LV test, referred to HV side
  vk_lv_percent:    number   // MV–LV test, referred to LV side
  vkr_hv_percent:   number
  vkr_mv_percent:   number
  vkr_lv_percent:   number
  pfe_kw:           number
  i0_percent:       number
}

// ── Differential Relay (87T — IEC 60255-151 / IEEE C37.91) ───────────────────
export interface DifferentialRelaySettings {
  // Basic differential protection for transformer 87T
  pickup_pct:    number   // differential current pickup as % of rated current (e.g. 20%)
  slope1_pct:    number   // restraint slope 1 (%) — low current region (e.g. 25%)
  slope2_pct:    number   // restraint slope 2 (%) — high current region (e.g. 40%)
  harmonic_restraint: boolean  // 2nd harmonic restraint for inrush blocking
  harmonic_pct:  number   // 2nd harmonic threshold % (e.g. 15%)
}

// ── Relay Settings (IEC 60255 / IEEE C37.112) ────────────────────────────────
export type RelayCurveType =
  // IEC 60255 IDMT
  | 'IEC_NORMAL_INVERSE'
  | 'IEC_VERY_INVERSE'
  | 'IEC_EXTREMELY_INVERSE'
  // ANSI/IEEE C37.112 — P2-4
  | 'ANSI_MODERATELY_INVERSE'
  | 'ANSI_INVERSE'
  | 'ANSI_VERY_INVERSE'
  | 'ANSI_EXTREMELY_INVERSE'
  | 'ANSI_SHORT_INVERSE'

export interface RelaySettings {
  pickup_current_a: number   // A
  time_dial:        number   // TMS (IEC) or TD (ANSI)
  inst_enabled:     boolean
  inst_pickup_a:    number   // A
  curve_type:       RelayCurveType
}

// P2-5: Earth fault relay (51N / 51G) — IEC 60255-151
export type SystemGrounding = 'SOLID' | 'RESISTANCE' | 'REACTANCE' | 'ISOLATED'

export interface EarthFaultRelay {
  pickup_current_a: number   // 영상 전류 픽업 [A]
  time_dial:        number   // TMS
  curve_type:       RelayCurveType
  inst_enabled:     boolean
  inst_pickup_a:    number   // A
}

export interface RelayResult {
  breakerId:              string
  breakerName:            string
  busName:                string
  fault_current_ka:       number
  curve_type:             RelayCurveType
  pickup_current_a:       number
  time_dial:              number
  relay_operating_time_s: number
  inst_trip:              boolean
  coordination_margin_s:  number   // Infinity = no upstream
  pass:                   boolean
}

export interface DifferentialRelayResult {
  breakerId:           string
  breakerName:         string
  transformerName:     string
  rated_current_hv_a:  number
  rated_current_lv_a:  number
  diff_current_pct:    number  // differential current as % of rated
  restrain_current_a:  number
  trips:               boolean
  inrush_blocked:      boolean // harmonic restraint active
  pass:                boolean
}

// ── Circuit Breaker (IEC 62271) ───────────────────────────────────────────────
export interface Breaker extends BaseEquipment {
  equipmentType: 'breaker'
  is_closed: boolean
  rated_kv: number
  rated_kA: number
  interrupt_kA: number
  r_ohm: number          // 접촉 저항 (0 = 무시)
  x_ohm: number          // 리액턴스 (0 = 무시)
  breaker_type: 'ACB' | 'VCB' | 'GCB' | 'MCB' | 'MCCB' | 'Fuse'
  // Protection coordination (IEC 62271-100)
  breaking_capacity_ka: number  // 차단 용량 Icw/Ib
  making_capacity_ka:   number  // 투입 용량 Icm (통상 ≥ √2 × 2.5 × Icw)
  protectedBusId?:      string  // 판정 기준 버스 ID (미지정 시 최대 Ik" 버스 자동 선택)
  // 상간 과전류 계전기 (50/51 — P2-4 ANSI 추가)
  relay?: RelaySettings
  // P2-5: 지락 과전류 계전기 (51N)
  relay_51n?: EarthFaultRelay
  // P2-5: 계통 접지 방식
  grounding?: SystemGrounding
  // 차동계전기 (87T — IEC 60255-151 / IEEE C37.91)
  relay_87t?: DifferentialRelaySettings
}

// ── Harmonic Source (IEEE 519) ────────────────────────────────────────────────
export type HarmonicSourceType = 'VFD' | 'UPS' | 'Rectifier' | 'Inverter' | 'Custom'

export interface HarmonicSource {
  enabled:      boolean
  source_type:  HarmonicSourceType
  h5_percent:   number   // % of fundamental current
  h7_percent:   number
  h11_percent:  number
  h13_percent:  number
  h17_percent:  number
  h19_percent:  number
  // 12-pulse converter orders (IEC 61000-2-4 / IEEE 519)
  h23_percent:  number
  h25_percent:  number
}

// ── Motor / Induction machine (IEC 60034) ─────────────────────────────────────
export interface Motor extends BaseEquipment {
  equipmentType: 'motor'
  rated_kw:                 number
  vn_kv:                   number
  efficiency:              number   // %
  power_factor:            number   // cos φ (운전)
  starting_current_multiple: number // Is/In — 기동 전류비
  starting_method:         'DOL' | 'Star-Delta' | 'Soft-Starter' | 'VFD'
  harmonic?:               HarmonicSource
  groupId?:                string   // nodeId of parent MotorGroup; undefined = not grouped
}

// ── Motor Group (visual aggregation only) ────────────────────────────────────
export interface MotorGroup extends BaseEquipment {
  equipmentType: 'motorGroup'
  motorIds: string[]   // ReactFlow node IDs of grouped motors
}

// ── Generator / Synchronous machine (IEC 60034) ───────────────────────────────
export interface Generator extends BaseEquipment {
  equipmentType: 'generator'
  sn_mva: number
  p_mw: number
  vn_kv: number
  pf: number
  vm_pu: number          // 단자 전압 설정값 (pu) — PV 버스 기준
  max_q_mvar: number
  min_q_mvar: number
  // IEC 60909 단락계산용 리액턴스 (기기 기준값 pu)
  xd_pu: number          // 동기 리액턴스
  xd_prime_pu: number    // 과도 리액턴스 Xd'
  xdpp_pu: number        // 초과도 리액턴스 Xd'' — Ik'' 계산
  x2_pu: number          // 역상 리액턴스 — 비대칭 고장용
  x0_pu: number          // 영상 리액턴스 — 지락 고장용
  cos_phi_rated: number  // IEC 60909 §4.3.1 보정 계수용
}

// ── Load (일반 정적 부하) ─────────────────────────────────────────────────────
// Motor(회전기)와 분리: 조명·HVAC·일반 패널 등
export interface Load extends BaseEquipment {
  equipmentType: 'load'
  p_kw: number
  q_kvar: number         // 직접 입력 (0이면 pf에서 계산)
  vn_kv: number
  pf: number
  // ZIP 모델 계수 (전압 의존성, 세 합 = 100)
  const_z_percent: number
  const_i_percent: number
  const_p_percent: number
  scaling: number        // 부하 스케일링 팩터 (1.0 = 100%)
  harmonic?: HarmonicSource
}

// ── Cable Installation Method (IEC 60287 / IEC 60364-5-52) ───────────────────
export type CableInstallMethod =
  | 'DUCT'          // 전선관 내 (관로 포설)
  | 'TRAY_TOUCHING' // 트레이 밀착 포설 (케이블 맞닿음)
  | 'TRAY_SPACED'   // 트레이 간격 포설 (케이블 간격 있음)
  | 'DIRECT_BURIED' // 직매 (땅속 직접 포설)
  | 'IN_AIR'        // 공중 노출 (실내 공기 중)
  | 'CLIPPED'       // 벽면/구조물 고정

// ── Cable / Overhead line (IEC 60228) ─────────────────────────────────────────
export interface Cable extends BaseEquipment {
  equipmentType: 'cable'
  std_type: string       // 표준 규격 (예: "NAYY 4x150 SE")
  length_m: number
  // 정상분 (Positive sequence) — 조류계산용
  r_ohm_per_km: number
  x_ohm_per_km: number
  c_nf_per_km: number
  // 영상분 (Zero sequence) — 비대칭 단락계산용
  r0_ohm_per_km: number
  x0_ohm_per_km: number
  c0_nf_per_km: number
  // 열적 한계
  max_i_ka: number
  max_i_ka_est: number   // 비상 허용 전류 (0 = 미사용)
  is_underground: boolean
  parallel: number       // 병렬 회선 수
  // IEC 60287 Derating factors
  ambient_temp_c?:      number            // 주위 온도 (기본 40°C 공기 / 25°C 직매)
  grouping_factor?:     number            // 그룹 감소계수 0–1 (기본 1.0)
  installation_method?: CableInstallMethod // 포설 방법 (기본 IN_AIR)
  ref_temp_c?:          number            // 케이블 기준 온도 (기본 70°C XLPE=90°C)
}

// ── P3-3: Capacitor Bank (IEC 60831) ─────────────────────────────────────────
export interface CapacitorBank extends BaseEquipment {
  equipmentType: 'capacitor'
  vn_kv:          number
  qn_mvar:         number   // rated reactive output (positive = generation)
  steps:           number   // switchable steps (1 = fixed)
  step_enabled:    number   // currently active steps
}

// ── P3-3: Reactor (shunt or series) ──────────────────────────────────────────
export interface Reactor extends BaseEquipment {
  equipmentType: 'reactor'
  vn_kv:          number
  qn_mvar:         number   // rated reactive absorption (positive)
  is_shunt:        boolean  // true = connected to earth (shunt); false = series
  x_ohm:           number   // series reactance (for series reactor, vn & qn derive X)
}

// ── Discriminated union ───────────────────────────────────────────────────────
export type Equipment = Bus | Transformer | ThreeWindingTransformer | Breaker | Motor | Generator | Load | MotorGroup | CapacitorBank | Reactor
export type EquipmentType = Equipment['equipmentType']

// ── ReactFlow 연동 ────────────────────────────────────────────────────────────
export interface NodeData<T extends Equipment = Equipment> {
  equipment: T
  busWidth?: number      // BusNode 전용 — etapLayout 계산값
  slots?: number[]       // BusNode 전용 — 슬롯 핸들 오프셋 (px)
}

export interface EdgeData {
  cable: Cable
}

// ── 편의 타입 별칭 ────────────────────────────────────────────────────────────
export type BusNodeData         = NodeData<Bus>
export type TransformerNodeData = NodeData<Transformer>
export type BreakerNodeData     = NodeData<Breaker>
export type MotorNodeData       = NodeData<Motor>
export type GeneratorNodeData   = NodeData<Generator>
export type LoadNodeData        = NodeData<Load>

// ── 연결 규칙 ─────────────────────────────────────────────────────────────────
export const CONNECTION_RULES: Record<EquipmentType, EquipmentType[]> = {
  bus:           ['transformer', 'transformer3w', 'breaker', 'motor', 'generator', 'load', 'motorGroup', 'capacitor', 'reactor'],
  transformer:   ['bus', 'breaker'],
  transformer3w: ['bus', 'breaker'],
  breaker:       ['bus', 'motor', 'generator', 'transformer', 'transformer3w', 'load', 'motorGroup', 'reactor'],
  motor:         ['bus', 'breaker'],
  generator:     ['bus', 'breaker'],
  load:          ['bus', 'breaker'],
  motorGroup:    ['bus', 'breaker'],
  capacitor:     ['bus'],
  reactor:       ['bus', 'breaker'],
}

// ── 팔레트 항목 ───────────────────────────────────────────────────────────────
export interface PaletteItem {
  type: EquipmentType
  label: string
  description: string
}

export const PALETTE_ITEMS: PaletteItem[] = [
  { type: 'bus',           label: 'Bus',           description: '모선' },
  { type: 'transformer',   label: 'Transformer',   description: '2권선 변압기' },
  { type: 'transformer3w', label: 'TR 3-Winding',  description: '3권선 변압기' },
  { type: 'breaker',       label: 'Breaker',       description: '차단기' },
  { type: 'motor',         label: 'Motor',         description: '전동기' },
  { type: 'generator',     label: 'Generator',     description: '발전기' },
  { type: 'load',          label: 'Load',          description: '정적부하' },
  { type: 'motorGroup',    label: 'Motor Group',   description: '전동기 그룹' },
  { type: 'capacitor',     label: 'Capacitor',     description: '커패시터 뱅크' },
  { type: 'reactor',       label: 'Reactor',       description: '리액터' },
]

// ── 기본값 팩토리 ─────────────────────────────────────────────────────────────
let _counter: Record<string, number> = {}
function seq(k: string): number {
  _counter[k] = (_counter[k] ?? 0) + 1
  return _counter[k]
}

export function defaultEquipment(type: EquipmentType, nodeId: string): Equipment {
  const base: BaseEquipment = { id: nodeId, name: '', description: '', in_service: true }
  switch (type) {
    case 'bus':
      return { ...base, equipmentType: 'bus',
        name: `Bus-${seq('bus')}`, vn_kv: 22.9, busType: 'PQ',
        sc_mva: 5000, xr_ratio: 10, x0r0_ratio: 10,
        working_distance_mm: 455, enclosure_type: 'MV_SWITCHGEAR' }
    case 'transformer':
      return { ...base, equipmentType: 'transformer',
        name: `TR-${seq('tr')}`,
        sn_mva: 30, vn_hv_kv: 154, vn_lv_kv: 22.9,
        vk_percent: 12, vkr_percent: 0.5,
        pfe_kw: 0, i0_percent: 0,
        tap_pos: 0, tap_neutral: 0, tap_min: -2, tap_max: 2, tap_step_percent: 2.5,
        vector_group: 'Dyn11', vk0_percent: 12, vkr0_percent: 0.5 }
    case 'breaker':
      return { ...base, equipmentType: 'breaker',
        name: `CB-${seq('cb')}`,
        is_closed: true, rated_kv: 24, rated_kA: 25, interrupt_kA: 25,
        r_ohm: 0, x_ohm: 0, breaker_type: 'VCB',
        breaking_capacity_ka: 25, making_capacity_ka: 63,
        relay: {
          pickup_current_a: 200,
          time_dial:        0.1,
          inst_enabled:     true,
          inst_pickup_a:    2000,
          curve_type:       'IEC_NORMAL_INVERSE',
        },
      }
    case 'motor':
      return { ...base, equipmentType: 'motor',
        name: `M-${seq('mot')}`,
        rated_kw: 500, vn_kv: 0.4, efficiency: 92,
        power_factor: 0.85, starting_current_multiple: 6.5,
        starting_method: 'DOL' }
    case 'generator':
      return { ...base, equipmentType: 'generator',
        name: `G-${seq('gen')}`,
        sn_mva: 12.5, p_mw: 10, vn_kv: 11, pf: 0.8, vm_pu: 1.0,
        max_q_mvar: 7.5, min_q_mvar: -5,
        xd_pu: 1.8, xd_prime_pu: 0.25, xdpp_pu: 0.15,
        x2_pu: 0.18, x0_pu: 0.07, cos_phi_rated: 0.8 }
    case 'load':
      return { ...base, equipmentType: 'load',
        name: `L-${seq('load')}`,
        p_kw: 100, q_kvar: 0, vn_kv: 0.4, pf: 0.9,
        const_z_percent: 0, const_i_percent: 0, const_p_percent: 100,
        scaling: 1.0 }
    case 'motorGroup':
      return { ...base, equipmentType: 'motorGroup',
        name: `MG-${seq('mg')}`, motorIds: [] }
    case 'transformer3w':
      return { ...base, equipmentType: 'transformer3w',
        name: `TR3W-${seq('tr3w')}`,
        sn_hv_mva: 30, sn_mv_mva: 20, sn_lv_mva: 10,
        vn_hv_kv: 154, vn_mv_kv: 22.9, vn_lv_kv: 6.6,
        vk_hv_percent: 12, vk_mv_percent: 10, vk_lv_percent: 6,
        vkr_hv_percent: 0.5, vkr_mv_percent: 0.4, vkr_lv_percent: 0.3,
        pfe_kw: 0, i0_percent: 0 }
    case 'capacitor':
      return { ...base, equipmentType: 'capacitor',
        name: `CAP-${seq('cap')}`,
        vn_kv: 22.9, qn_mvar: 10, steps: 1, step_enabled: 1 }
    case 'reactor':
      return { ...base, equipmentType: 'reactor',
        name: `REACT-${seq('react')}`,
        vn_kv: 22.9, qn_mvar: 10, is_shunt: true, x_ohm: 0 }
  }
}

export function defaultCable(edgeId: string): Cable {
  return {
    equipmentType: 'cable', id: edgeId, name: `Cable-${seq('cable')}`,
    description: '', in_service: true,
    std_type: '', length_m: 1000,
    r_ohm_per_km: 0.164, x_ohm_per_km: 0.1, c_nf_per_km: 210,
    r0_ohm_per_km: 0.5,  x0_ohm_per_km: 0.4, c0_nf_per_km: 210,
    max_i_ka: 0.5, max_i_ka_est: 0,
    is_underground: true, parallel: 1,
  }
}

// =============================================================================
// 해석 결과 타입 — analysisStore 전용, Equipment 인터페이스에 저장하지 않음
// =============================================================================

// ── 조류계산 결과 (Load Flow) ─────────────────────────────────────────────────
export interface BusLFResult {
  nodeId: string
  vm_pu: number
  va_degree: number
  p_mw: number
  q_mvar: number
}

export interface TransformerLFResult {
  nodeId: string
  loading_percent: number
  p_hv_mw: number
  q_hv_mvar: number
  p_lv_mw: number
  q_lv_mvar: number
  pl_mw: number
}

export interface LineLFResult {
  edgeId: string
  loading_percent: number
  p_from_mw: number
  q_from_mvar: number
  p_to_mw: number
  q_to_mvar: number
  pl_mw: number
  ql_mvar: number
  i_ka: number
  vdrop_percent: number
}

export interface MotorLFResult {
  motorId:            string
  busId:              string
  p_mw:               number   // electrical input power
  q_mvar:             number
  running_current_a:  number
  starting_current_a: number
}

export interface MotorStartResult {
  motorId:             string
  start_current_a:     number
  running_current_a:   number
  start_mva:           number
  terminal_voltage_pu: number
  voltage_drop_percent: number
  pass:                boolean   // true: V ≥ 0.85 pu
}

export interface GeneratorLFResult {
  generatorId: string
  busId:       string   // connected bus nodeId
  p_mw:        number
  q_mvar:      number   // net reactive injection at the bus
  vm_pu:       number
  mode:        'PV' | 'PQ_LIMIT'
}

export interface LoadflowMeta {
  iterationCount: number
  maxMismatch:    number   // pu, final max(|ΔP|, |ΔQ|)
  elapsedMs:      number
}

export interface LoadflowResults {
  converged:    boolean
  meta?:        LoadflowMeta   // undefined when using backend API path
  buses:        Record<string, BusLFResult>
  transformers: Record<string, TransformerLFResult>
  lines:        Record<string, LineLFResult>
  generators:   Record<string, GeneratorLFResult>
  motors:       Record<string, MotorLFResult>
  motorStarts?: Record<string, MotorStartResult>
}

// ── 단락계산 결과 (IEC 60909) ─────────────────────────────────────────────────
export interface BusFaultResult {
  nodeId:       string
  ikss_ka:      number   // Ik'' max — c=1.1 (최대 고장전류)
  skss_mva:     number   // Sk'' — 초기 단락 용량
  ip_ka:        number   // ip  — 피크 단락전류
  ib_ka:        number   // Ib  — 차단 전류
  // P2-2: 최소 고장전류 (c_min = 0.95 LV / 1.0 MV+HV)
  ikss_ka_min?: number   // Ik'' min — 보호계전기 감도 검토용
  // P2-3: 보정계수 적용 여부 기록
  kt_applied?:  boolean  // K_T 적용됨
  kg_applied?:  boolean  // K_G 적용됨
  // P2-4: 열적 등가전류 (IEC 60909-0 §4.8)
  ith_ka?:      number   // Ith — 열적 등가 단락전류 (케이블/모선 열적 선정용)
  tf_s?:        number   // 등가 고장 지속 시간 (열적 Ith 계산에 사용)
}

export interface ShortCircuitResults {
  buses: Record<string, BusFaultResult>
}

// ── 비대칭 단락계산 결과 (IEC 60909 Asymmetric) ─────────────────────────────
export interface BusAsymFaultResult {
  nodeId:    string
  ik3_ka:    number   // 3상 평형 단락
  ip3_ka:    number   // 3상 피크
  ik1_ka:    number   // 1선 지락
  ip1_ka:    number   // 1선 지락 피크
  ik2_ka:    number   // 선간 단락
  ik2g_ka:   number   // 2선 지락
  worst_type: '3P' | '1LG' | 'LL' | '2LG'
  worst_ka:   number
  z1_pu:     number
  z0_pu:     number
}

export interface AsymFaultResults {
  buses: Record<string, BusAsymFaultResult>
}

// ── 아크 플래시 분석 결과 (IEEE 1584) ─────────────────────────────────────────
export type ArcFlashRiskLevel = 'LOW' | 'MEDIUM' | 'HIGH' | 'EXTREME'

export interface ArcFlashResult {
  busId:                 string
  busName:               string
  vn_kv:                number
  ikss_ka:              number
  iarc_ka:              number
  clearing_time_s:      number
  working_distance_mm:  number
  incident_energy_cal:  number   // cal/cm²
  arc_flash_boundary_m: number   // m
  ppe_category:         number   // 0–4, 5 = "4+"
  risk_level:           ArcFlashRiskLevel
}

export interface ArcFlashResults {
  items:      Record<string, ArcFlashResult>
  // P1-6: 계산 방법론 명시 (면책)
  method:     'IEEE_1584_2018_enhanced' | 'IEEE_1584_2002_simplified'
  disclaimer: string
}

// ── 보호 협조 판정 결과 (Protection Coordination) ──────────────────────────────
export interface ProtectionItem {
  breakerId:               string
  breakerName:             string
  busId:                   string
  busName:                 string
  busVn_kv:                number
  ikss_ka:                 number   // Ik" at reference bus
  ip_ka:                   number   // Ip at reference bus
  breaking_capacity_ka:    number
  making_capacity_ka:      number
  breaking_margin_percent: number   // (breaking_cap - Ik") / breaking_cap × 100
  making_margin_percent:   number   // (making_cap  - Ip)  / making_cap  × 100
  pass_breaking:           boolean
  pass_making:             boolean
  pass:                    boolean  // both pass
}

export interface ProtectionResults {
  items: ProtectionItem[]
}

// ── N-1 Contingency Analysis ──────────────────────────────────────────────────
export interface ContingencyResult {
  equipmentId:             string
  equipmentName:           string
  equipmentType:           'transformer' | 'cable' | 'breaker' | 'generator'
  converged:               boolean
  islandedBuses:           string[]          // bus nodeIds with no source path
  overloadedTransformers:  string[]          // transformer nodeIds >100%
  overloadedLines:         string[]          // edge ids >100%
  undervoltageBuses:       string[]          // bus nodeIds <0.95 pu
  maxLoadingPercent:       number            // NaN when not converged
  minVoltagePu:            number            // NaN when not converged
  severity:                'PASS' | 'WARNING' | 'FAIL'
}

export interface ContingencyResults {
  cases: ContingencyResult[]
}

// ── Harmonic Analysis Results (IEEE 519) ──────────────────────────────────────
export interface HarmonicBusResult {
  busId:                   string
  busName:                 string
  vn_kv:                  number
  thdv_percent:            number
  distortion:              Record<number, number>  // order → Dh %
  max_order:               number
  max_distortion_percent:  number
  ieee519_limit:           number
  ieee519_pass:            boolean
}

export interface HarmonicSourceResult {
  sourceId:          string
  sourceName:        string
  sourceType:        string
  busId:             string
  busName:           string
  i_fund_a:          number
  thdi_percent:      number
  harmonic_currents: Record<number, number>  // order → current A
}

export interface HarmonicResults {
  buses:   Record<string, HarmonicBusResult>
  sources: HarmonicSourceResult[]
}

// ── Cable Sizing (IEC 60364) ──────────────────────────────────────────────────
export interface CableSizingResult {
  cableId:   string
  cableName: string
  fromBus:   string
  toBus:     string
  vn_kv:     number

  loadCurrentA:     number   // actual or estimated load current
  ampacityA:        number   // existing cable ampacity (max_i_ka × 1000)
  voltageDropPercent: number // ΔV% using existing R/X
  vdropLimit:       number   // 3% LV / 5% MV/HV
  shortCircuitKA:   number   // Ik″ at cable location
  scWithstandKA:    number   // existing cable SC withstand capacity
  clearingTimeS:    number   // fault clearing time used

  existingMM2:       number  // estimated from R
  recommendedModel:  string  // from library
  recommendedMM2:    number

  passAmpacity:     boolean
  passVoltageDrop:  boolean
  passShortCircuit: boolean
  pass:             boolean
  severity:         'PASS' | 'WARNING' | 'FAIL'
}

export interface CableSizingResults {
  cables: Record<string, CableSizingResult>
}

// ── Equipment Library ─────────────────────────────────────────────────────────
export interface LibraryEntry {
  id:           string
  manufacturer: string
  model:        string
  standard?:    string               // e.g. "IEC 60076", "KS C IEC 60502"
  version?:     string               // e.g. "2024", "Rev.3"
  source?:      'builtin' | 'custom'
  params:       Record<string, unknown>
}
