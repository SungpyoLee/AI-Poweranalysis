/**
 * motorNetworkBuilder.ts
 * ParsedMotorList → ReactFlow 노드·엣지 + 자동 레이아웃
 *
 * 생성 토폴로지:
 *   MAIN BUS (22.9kV, Slack)
 *     └── TR-MCC-x (22.9/motor_vn_kv)
 *           └── MCC-x BUS (PQ)
 *                 └── Motor × N   (cable MCC→Motor)
 *
 * 레이아웃 (top-down hierarchical, ELK 없이 직접 계산):
 *   y=60   : MAIN BUS
 *   y=220  : Transformer row
 *   y=380  : MCC BUS row
 *   y=540+ : Motor rows (120px 간격)
 *   x      : MCC 그룹별 수평 분산
 */

import type { Node as RFNode, Edge as RFEdge } from 'reactflow'
import type {
  NodeData, EdgeData, Bus, Transformer, Motor,
} from '../types'
import { defaultEquipment, defaultCable } from '../types'
import type { ParsedMotorList } from './motorListParser'

// ── 레이아웃 상수 (모두 grid-snap 20px 배수) ─────────────────────────────────
const SNAP           = 20
const MAIN_BUS_Y     = 60
const TR_Y           = 220
const MCC_BUS_Y      = 380
const MOTOR_Y_START  = 540
const MOTOR_Y_STEP   = 120   // motor 수직 간격
const GROUP_X_STEP   = 200   // MCC 그룹 수평 간격 (기본)
const X_ORIGIN       = 100
const MCC_BUS_W      = 160   // MCC bus bar 폭 (px)
const NODE_HALF_W    = 22    // motor/transformer 노드 중심 오프셋

// ── ID 생성 ──────────────────────────────────────────────────────────────────
// 5000번대 사용 → useEquipmentStore(_nodeCounter=100)와 충돌 없음
let _uid = 5000
function uid(prefix: string): string { return `${prefix}-${++_uid}` }

function snap(n: number): number { return Math.round(n / SNAP) * SNAP }

// ── 결과 타입 ─────────────────────────────────────────────────────────────────
export interface MotorNetworkSummary {
  motorCount:  number
  mccCount:    number
  totalKW:     number
  avgPF:       number
  largestKW:   number
}

export interface MotorNetworkResult {
  nodes:   RFNode<NodeData>[]
  edges:   RFEdge<EdgeData>[]
  summary: MotorNetworkSummary
}

// ── 메인 빌더 ─────────────────────────────────────────────────────────────────
export function buildMotorNetwork(parsed: ParsedMotorList): MotorNetworkResult {
  const nodes: RFNode<NodeData>[] = []
  const edges: RFEdge<EdgeData>[] = []

  const mccList  = Array.from(parsed.mccGroups.entries())
  const numMCC   = mccList.length

  if (numMCC === 0 || parsed.rows.length === 0) {
    return {
      nodes, edges,
      summary: { motorCount: 0, mccCount: 0, totalKW: 0, avgPF: 0, largestKW: 0 },
    }
  }

  // ── MAIN BUS ──────────────────────────────────────────────────────────────
  // 가로 폭: 모든 MCC 그룹을 포함하도록
  const totalWidth  = snap(Math.max(300, numMCC * GROUP_X_STEP + 80))
  const mainBusX    = snap(X_ORIGIN)

  // 각 MCC 그룹 X 중심
  const groupCenterXs = mccList.map((_, gi) =>
    snap(X_ORIGIN + gi * GROUP_X_STEP + GROUP_X_STEP / 2)
  )

  // MAIN BUS 슬롯: 각 MCC 그룹 중심의 상대 오프셋
  const mainSlots = groupCenterXs.map(cx => snap(cx - mainBusX))

  const mainBusId    = uid('bus')
  const mainBusEquip: Bus = {
    ...(defaultEquipment('bus', mainBusId) as Bus),
    name:    'MAIN BUS',
    vn_kv:  22.9,
    busType: 'Slack',
    sc_mva:  5000,
    xr_ratio: 10,
  }
  nodes.push({
    id:       mainBusId,
    type:     'bus',
    position: { x: mainBusX, y: snap(MAIN_BUS_Y) },
    data: { equipment: mainBusEquip, busWidth: totalWidth, slots: mainSlots },
  })

  // ── MCC 그룹별 처리 ───────────────────────────────────────────────────────
  for (let gi = 0; gi < mccList.length; gi++) {
    const [mccName, motors] = mccList[gi]
    const groupCx = groupCenterXs[gi]

    // 모터 전압 (첫 번째 모터 기준, V→kV 변환)
    const voltage_v = motors[0]?.voltage_v ?? 380
    const vn_kv     = parseFloat((voltage_v / 1000).toFixed(3))

    // 변압기 자동 용량: 그룹 총 kW × 1.25 안전율 / 0.9 역률 / 1000
    const groupTotalKW = motors.reduce((s, m) => s + m.kw, 0)
    const sn_mva = Math.max(0.1, Math.round((groupTotalKW / 1000 / 0.9 * 1.25) * 10) / 10)

    // ── Transformer ────────────────────────────────────────────────────────
    const trId = uid('transformer')
    const trEquip: Transformer = {
      ...(defaultEquipment('transformer', trId) as Transformer),
      name:          `TR-${mccName}`,
      sn_mva,
      vn_hv_kv:      22.9,
      vn_lv_kv:      vn_kv,
      vk_percent:    6,
      vkr_percent:   1,
      pfe_kw:        0,
      i0_percent:    0,
      tap_pos:       0,
      tap_neutral:   0,
      tap_min:       -2,
      tap_max:        2,
      tap_step_percent: 2.5,
    }
    nodes.push({
      id:       trId,
      type:     'transformer',
      position: { x: snap(groupCx - NODE_HALF_W), y: snap(TR_Y) },
      data: { equipment: trEquip },
    })

    // Cable: MAIN BUS → Transformer (HV 측)
    const e1Id = uid('e')
    edges.push({
      id:     e1Id,
      type:   'cable',
      source: mainBusId,
      sourceHandle: `s${gi}`,
      target: trId,
      targetHandle: null,
      data: {
        cable: {
          ...defaultCable(e1Id),
          name:         `FEEDER-${mccName}`,
          length_m:      100,
          r_ohm_per_km:  0.0683,
          x_ohm_per_km:  0.08,
          max_i_ka:      1.0,
          max_i_ka_est:  0,
        },
      },
    })

    // ── MCC Bus ────────────────────────────────────────────────────────────
    const mccBusId = uid('bus')
    const mccBusEquip: Bus = {
      ...(defaultEquipment('bus', mccBusId) as Bus),
      name:    mccName,
      vn_kv,
      busType: 'PQ',
    }
    nodes.push({
      id:       mccBusId,
      type:     'bus',
      position: { x: snap(groupCx - MCC_BUS_W / 2), y: snap(MCC_BUS_Y) },
      data: {
        equipment: mccBusEquip,
        busWidth:  MCC_BUS_W,
        slots:     [MCC_BUS_W / 2],  // 중앙 단일 슬롯
      },
    })

    // Cable: Transformer (LV 측) → MCC Bus
    const e2Id = uid('e')
    edges.push({
      id:     e2Id,
      type:   'cable',
      source: trId,
      sourceHandle: null,
      target: mccBusId,
      targetHandle: 'top',
      data: {
        cable: {
          ...defaultCable(e2Id),
          name:         `LV-${mccName}`,
          length_m:      10,
          r_ohm_per_km:  0.0683,
          x_ohm_per_km:  0.06,
          max_i_ka:      1.5,
          max_i_ka_est:  0,
        },
      },
    })

    // ── Motors ────────────────────────────────────────────────────────────
    for (let mi = 0; mi < motors.length; mi++) {
      const m = motors[mi]

      const motorId = uid('motor')
      const motorEquip: Motor = {
        ...(defaultEquipment('motor', motorId) as Motor),
        name:                      m.tag,
        rated_kw:                  m.kw,
        vn_kv,
        efficiency:                95,
        power_factor:              m.pf,
        starting_current_multiple: 6,
        starting_method:           'DOL',
      }
      nodes.push({
        id:       motorId,
        type:     'motor',
        position: {
          x: snap(groupCx - NODE_HALF_W),
          y: snap(MOTOR_Y_START + mi * MOTOR_Y_STEP),
        },
        data: { equipment: motorEquip },
      })

      // Cable: MCC Bus → Motor
      const eMId = uid('e')
      edges.push({
        id:     eMId,
        type:   'cable',
        source: mccBusId,
        sourceHandle: 's0',
        target: motorId,
        targetHandle: null,
        data: {
          cable: {
            ...defaultCable(eMId),
            name:         `C-${m.tag}`,
            length_m:      30,
            r_ohm_per_km:  0.154,
            x_ohm_per_km:  0.11,
            c_nf_per_km:   210,
            max_i_ka:      0.339,
            max_i_ka_est:  0,
          },
        },
      })
    }
  }

  // ── 요약 계산 ─────────────────────────────────────────────────────────────
  const totalKW  = parsed.rows.reduce((s, m) => s + m.kw, 0)
  const avgPF    = parsed.rows.length > 0
    ? parsed.rows.reduce((s, m) => s + m.pf, 0) / parsed.rows.length
    : 0
  const largestKW = parsed.rows.reduce((mx, m) => Math.max(mx, m.kw), 0)

  return {
    nodes, edges,
    summary: {
      motorCount: parsed.rows.length,
      mccCount:   parsed.mccGroups.size,
      totalKW:    Math.round(totalKW * 10) / 10,
      avgPF:      Math.round(avgPF * 1000) / 1000,
      largestKW,
    },
  }
}
