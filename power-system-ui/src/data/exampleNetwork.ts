/**
 * EPC 화학플랜트 수변전 시스템 예제 (IEC 60909 / IEC 60076 기준)
 *
 * 구성:
 *   154kV Grid (Slack, Sk''=5000MVA) ── TR-MAIN (154/22.9kV 30MVA)
 *     22.9kV SWGR (Main MV Bus)
 *       ├─ CB-101 ── CM-101  (Compressor Motor 2,000 kW, 22.9 kV)
 *       ├─ CB-102 ── PP-101  (Pump Motor       1,500 kW, 22.9 kV)
 *       ├─ CB-103 ── CB-104 ── TR-MCC1 (22.9/0.38kV 2 MVA)
 *       │              0.38kV MCC-A Bus
 *       │                ├─ CB-201 ── PP-201  (75 kW, 0.38 kV)
 *       │                ├─ CB-202 ── FAN-201 (45 kW, 0.38 kV)
 *       │                └─ CB-203 ── PP-202  (30 kW, 0.38 kV)
 *       ├─ CB-3W ── TR-3W (3권선: 22.9/6.6/0.38kV 10/5/5MVA) — P1-1 검증용
 *       │             ├─ 6.6kV Drive Bus ── CB-D1 ── CM-D1 (VFD 2,500kW, 6.6kV)
 *       │             └─ 0.38kV Util Bus  ── CB-U1 ── PP-U1 (100kW, 0.38kV)
 *       └─ (Emergency Generator bus: G-EMG 1,500kW)
 */

import type { Node, Edge } from 'reactflow'
import type { NodeData, EdgeData, Bus, Transformer, ThreeWindingTransformer, Breaker, Motor, Generator, Cable } from '../types'
import { computeETAPLayout } from '../utils/etapLayout'

function bus(id: string, name: string, vn_kv: number, busType: Bus['busType'],
  extra?: Partial<Bus>): Node<NodeData> {
  return {
    id, type: 'bus', position: { x: 0, y: 0 },
    data: { equipment: { equipmentType: 'bus', id, name, description: '', in_service: true, vn_kv, busType, sc_mva: 5000, xr_ratio: 10, ...extra } as Bus },
  }
}

function tr(id: string, name: string, sn_mva: number, hv: number, lv: number,
  vk: number, vkr: number, pfe_kw = 0, i0 = 0): Node<NodeData> {
  return {
    id, type: 'transformer', position: { x: 0, y: 0 },
    data: { equipment: { equipmentType: 'transformer', id, name, description: '', in_service: true,
      sn_mva, vn_hv_kv: hv, vn_lv_kv: lv, vk_percent: vk, vkr_percent: vkr,
      pfe_kw, i0_percent: i0,
      tap_pos: 0, tap_neutral: 0, tap_min: -2, tap_max: 2, tap_step_percent: 2.5 } as Transformer },
  }
}

function cb(id: string, name: string, vkv: number, ikA: number, type: Breaker['breaker_type'],
  relay?: Breaker['relay']): Node<NodeData> {
  const breaking = ikA; const making = Math.round(ikA * 2.5 * 10) / 10
  return {
    id, type: 'breaker', position: { x: 0, y: 0 },
    data: { equipment: { equipmentType: 'breaker', id, name, description: '', in_service: true,
      is_closed: true, rated_kv: vkv, rated_kA: ikA, interrupt_kA: ikA,
      r_ohm: 0, x_ohm: 0, breaker_type: type,
      breaking_capacity_ka: breaking, making_capacity_ka: making,
      relay } as Breaker },
  }
}

function mot(id: string, name: string, kw: number, vn_kv: number, pf: number, eff: number,
  method: Motor['starting_method'] = 'DOL'): Node<NodeData> {
  return {
    id, type: 'motor', position: { x: 0, y: 0 },
    data: { equipment: { equipmentType: 'motor', id, name, description: '', in_service: true,
      rated_kw: kw, vn_kv, efficiency: eff, power_factor: pf,
      starting_current_multiple: 6.5, starting_method: method } as Motor },
  }
}

function tr3w(
  id: string, name: string,
  sn_hv: number, sn_mv: number, sn_lv: number,
  vn_hv: number, vn_mv: number, vn_lv: number,
  vk_hv: number, vk_mv: number, vk_lv: number,
): Node<NodeData> {
  return {
    id, type: 'transformer3w', position: { x: 0, y: 0 },
    data: {
      equipment: {
        equipmentType: 'transformer3w', id, name, description: '', in_service: true,
        sn_hv_mva: sn_hv, sn_mv_mva: sn_mv, sn_lv_mva: sn_lv,
        vn_hv_kv: vn_hv, vn_mv_kv: vn_mv, vn_lv_kv: vn_lv,
        vk_hv_percent: vk_hv, vk_mv_percent: vk_mv, vk_lv_percent: vk_lv,
        vkr_hv_percent: 0.4, vkr_mv_percent: 0.35, vkr_lv_percent: 0.3,
        pfe_kw: 15, i0_percent: 0.1,
      } as ThreeWindingTransformer,
    },
  }
}

function gen(id: string, name: string, sn_mva: number, vn_kv: number): Node<NodeData> {
  return {
    id, type: 'generator', position: { x: 0, y: 0 },
    data: { equipment: { equipmentType: 'generator', id, name, description: '', in_service: true,
      sn_mva, p_mw: sn_mva * 0.8, vn_kv, pf: 0.8, vm_pu: 1.0,
      max_q_mvar: sn_mva * 0.6, min_q_mvar: -sn_mva * 0.3,
      xd_pu: 1.8, xd_prime_pu: 0.25, xdpp_pu: 0.15, x2_pu: 0.18, x0_pu: 0.07, cos_phi_rated: 0.8 } as Generator },
  }
}

function cable(id: string, src: string, tgt: string, name: string,
  len_m: number, r: number, x: number, iMax_ka: number): Edge<EdgeData> {
  const c: Cable = {
    equipmentType: 'cable', id, name, description: '', in_service: true,
    std_type: '', length_m: len_m,
    r_ohm_per_km: r, x_ohm_per_km: x, c_nf_per_km: 210,
    r0_ohm_per_km: r * 3, x0_ohm_per_km: x * 3, c0_nf_per_km: 210,
    max_i_ka: iMax_ka, max_i_ka_est: 0, is_underground: true, parallel: 1,
  }
  return { id, type: 'cable', source: src, target: tgt, data: { cable: c } }
}

// ── 노드 ─────────────────────────────────────────────────────────────────────

const relayMV = (pickup_a: number): Breaker['relay'] => ({
  pickup_current_a: pickup_a, time_dial: 0.2, inst_enabled: true,
  inst_pickup_a: pickup_a * 8, curve_type: 'IEC_NORMAL_INVERSE',
})
const relayLV = (pickup_a: number): Breaker['relay'] => ({
  pickup_current_a: pickup_a, time_dial: 0.1, inst_enabled: true,
  inst_pickup_a: pickup_a * 10, curve_type: 'IEC_NORMAL_INVERSE',
})

const RAW_NODES: Node<NodeData>[] = [
  // ── 154kV 계통 ─────────────────────────────────────────────────────────────
  bus('bus-154', '154kV Main Bus',   154,  'Slack', { sc_mva: 5000, xr_ratio: 10 }),
  tr ('tr-main', 'TR-MAIN (30MVA)',   30, 154, 22.9, 12, 0.5, 80, 0.1),

  // ── 22.9kV 수변전 ──────────────────────────────────────────────────────────
  bus('bus-229', '22.9kV SWGR',      22.9, 'PQ'),

  // 비상발전기
  cb ('cb-emg',  'CB-EMG',    24, 25, 'VCB'),
  gen('gen-emg', 'G-EMG (1.5MVA)', 1.5, 0.4),

  // 22.9kV 모터 피더
  cb ('cb-101',  'CB-101',    24, 25, 'VCB', relayMV(80)),
  mot('mot-cm101', 'CM-101 (Compressor)', 2000, 22.9, 0.86, 94, 'VFD'),

  cb ('cb-102',  'CB-102',    24, 25, 'VCB', relayMV(60)),
  mot('mot-pp101', 'PP-101 (Pump)',       1500, 22.9, 0.85, 93, 'DOL'),

  // LV 변압기 피더
  cb ('cb-103',  'CB-103',    24, 25, 'VCB', relayMV(100)),

  // 3권선 변압기 피더 (P1-1 검증용 — IEC 60076 3-winding)
  cb  ('cb-3w',   'CB-3W',     24, 25, 'VCB', relayMV(250)),
  tr3w('tr-3w',   'TR-3W (10/5/5 MVA)', 10, 5, 5, 22.9, 6.6, 0.38, 12, 10, 6),
  bus ('bus-66',  '6.6kV Drive Bus', 6.6, 'PQ'),
  bus ('bus-util','0.38kV Util Bus', 0.38, 'PQ'),
  cb  ('cb-d1',   'CB-D1',      7.2, 36, 'VCB', relayMV(280)),
  mot ('mot-d1',  'CM-D1 (VFD 2500kW)', 2500, 6.6, 0.87, 95, 'VFD'),
  cb  ('cb-u1',   'CB-U1',      0.69, 36, 'MCCB', relayLV(220)),
  mot ('mot-u1',  'PP-U1 (100kW)',       100, 0.38, 0.85, 91, 'DOL'),

  // ── 22.9/0.38kV MCC-1 ──────────────────────────────────────────────────────
  tr ('tr-mcc1', 'TR-MCC1 (2MVA)',  2, 22.9, 0.38, 6, 1.0, 8, 0.5),
  bus('bus-mcc1', '0.38kV MCC-A',  0.38, 'PQ'),

  cb ('cb-201',  'CB-201',    0.69, 36, 'MCCB', relayLV(150)),
  mot('mot-pp201', 'PP-201 (Pump 75kW)',   75, 0.38, 0.85, 90, 'Star-Delta'),

  cb ('cb-202',  'CB-202',    0.69, 36, 'MCCB', relayLV(100)),
  mot('mot-fan201', 'FAN-201 (Fan 45kW)', 45, 0.38, 0.82, 88, 'DOL'),

  cb ('cb-203',  'CB-203',    0.69, 36, 'MCCB', relayLV(80)),
  mot('mot-pp202', 'PP-202 (Pump 30kW)',  30, 0.38, 0.84, 87, 'DOL'),
]

// ── 엣지 ─────────────────────────────────────────────────────────────────────
const RAW_EDGES: Edge<EdgeData>[] = [
  // 154kV → TR-MAIN → 22.9kV
  cable('e1',  'bus-154', 'tr-main',   'HV-Busduct',  50,  0.03, 0.03, 2.0),
  cable('e2',  'tr-main', 'bus-229',   'MV-Busduct',  50,  0.05, 0.05, 1.6),

  // 비상발전기
  cable('e3',  'bus-229', 'cb-emg',    'EMG-Feeder',  30,  0.164, 0.10, 0.5),
  cable('e4',  'cb-emg',  'gen-emg',   'EMG-Cable',   30,  0.164, 0.10, 0.5),

  // CM-101 (2000kW VFD 압축기, 22.9kV)
  cable('e5',  'bus-229', 'cb-101',    'F101-Bus',    20,  0.164, 0.10, 0.50),
  cable('e6',  'cb-101',  'mot-cm101', 'F101-Motor', 200,  0.254, 0.11, 0.45),

  // PP-101 (1500kW DOL 펌프, 22.9kV)
  cable('e7',  'bus-229', 'cb-102',    'F102-Bus',    20,  0.164, 0.10, 0.40),
  cable('e8',  'cb-102',  'mot-pp101', 'F102-Motor', 250,  0.311, 0.11, 0.36),

  // TR-MCC1 피더 (22.9kV → 0.38kV)
  cable('e9',  'bus-229', 'cb-103',    'F103-Bus',    10,  0.164, 0.10, 0.60),
  cable('e10', 'cb-103',  'tr-mcc1',   'F103-TR',     30,  0.164, 0.10, 0.60),
  cable('e11', 'tr-mcc1', 'bus-mcc1',  'MCC1-Bus',    10,  0.154, 0.11, 1.50),

  // MCC-A LV 모터들
  cable('e12', 'bus-mcc1', 'cb-201',   'LV-F201',     30,  0.247, 0.08, 0.25),
  cable('e13', 'cb-201',  'mot-pp201', 'F201-Motor',  50,  0.247, 0.08, 0.25),

  cable('e14', 'bus-mcc1', 'cb-202',   'LV-F202',     30,  0.387, 0.08, 0.18),
  cable('e15', 'cb-202',  'mot-fan201','F202-Motor',  80,  0.387, 0.08, 0.18),

  cable('e16', 'bus-mcc1', 'cb-203',   'LV-F203',     30,  0.524, 0.08, 0.15),
  cable('e17', 'cb-203',  'mot-pp202', 'F203-Motor',  60,  0.524, 0.08, 0.15),

  // 3권선 변압기 연결 (22.9kV → TR-3W → 6.6kV / 0.38kV)
  cable('e18', 'bus-229',  'cb-3w',    '3W-Bus',      15,  0.164, 0.10, 0.80),
  cable('e19', 'cb-3w',    'tr-3w',    '3W-HV',       10,  0.164, 0.10, 0.80),
  cable('e20', 'tr-3w',    'bus-66',   '3W-MV(6.6)',  10,  0.099, 0.10, 1.20),
  cable('e21', 'tr-3w',    'bus-util', '3W-LV(0.38)', 10,  0.154, 0.11, 2.00),
  cable('e22', 'bus-66',   'cb-d1',    'DRV-F1',      30,  0.310, 0.10, 0.45),
  cable('e23', 'cb-d1',    'mot-d1',   'DRV-Motor',  120,  0.388, 0.10, 0.40),
  cable('e24', 'bus-util', 'cb-u1',    'UTIL-F1',     25,  0.247, 0.08, 0.25),
  cable('e25', 'cb-u1',    'mot-u1',   'UTIL-Motor',  40,  0.247, 0.08, 0.20),
]

const { nodes: EXAMPLE_NODES, edges: EXAMPLE_EDGES } = computeETAPLayout(RAW_NODES, RAW_EDGES)

export { EXAMPLE_NODES, EXAMPLE_EDGES }
