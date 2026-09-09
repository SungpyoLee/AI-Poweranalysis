/**
 * powerFactor.ts
 * 역률 보상 (Power Factor Correction) 계산
 *
 * 한국 전력 요금 기준:
 *   기준 역률: 0.90 (지상) — 미달 시 요금 할증
 *   권장 목표: 0.95 이상
 *
 * 콘덴서 용량 계산:
 *   Qc = P × (tan(φ_before) − tan(φ_target))
 *
 * 표준 콘덴서 용량(kvar): 50, 100, 150, 200, 300, 400, 500, 600, 800, 1000
 */

import type { LoadflowResults } from '../types'

export interface PfcBusResult {
  busId:        string
  busName:      string
  vn_kv:        number
  p_mw:         number
  q_mvar:       number     // 현재 무효전력 (부하)
  pf_current:   number
  pf_target:    number
  qc_required:  number     // 필요 콘덴서 용량 Mvar
  qc_standard:  number     // 표준 용량으로 올림 Mvar
  qc_kvar:      number     // kvar 단위
  pf_after:     number     // 설치 후 예상 역률
  status:       'ok' | 'warn' | 'crit'  // ok: PF≥0.95, warn: 0.90~0.95, crit: <0.90
  penalty_pct:  number     // 예상 요금 할증률 (%)
}

export interface PfcSystemResult {
  buses:           PfcBusResult[]
  totalP_mw:       number
  totalQ_mvar:     number
  totalQc_mvar:    number   // 전체 필요 콘덴서
  systemPf:        number
  systemPfAfter:   number
  annualSaving_pct: number  // 예상 요금 절감률
}

const STANDARD_KVAR = [50, 100, 150, 200, 300, 400, 500, 600, 800, 1000, 1500, 2000]

function roundUpStandard(kvar: number): number {
  if (kvar <= 0) return 0   // 보상이 필요 없으면 최소 규격(50kvar)도 추천하지 않는다
  for (const s of STANDARD_KVAR) if (s >= kvar) return s
  return Math.ceil(kvar / 500) * 500
}

function pfPenalty(pf: number): number {
  // 한전 표준약관 기준: 역률 90% 미만 1%당 0.5% 할증
  if (pf >= 0.90) return 0
  return Math.min(15, (0.90 - pf) * 100 * 0.5)  // 최대 15% 할증
}

function vmStatus(pf: number): PfcBusResult['status'] {
  if (pf >= 0.95) return 'ok'
  if (pf >= 0.90) return 'warn'
  return 'crit'
}

export function computePowerFactorCorrection(
  lf:          LoadflowResults,
  nodeNameMap: Map<string, { name: string; vn_kv: number }>,
  pfTarget = 0.95,
): PfcSystemResult {
  const buses: PfcBusResult[] = []

  let totalP = 0, totalQ = 0, totalQc = 0

  for (const [busId, r] of Object.entries(lf.buses)) {
    const meta = nodeNameMap.get(busId)
    if (!meta) continue
    // 부하 버스만 역률 계산 (P < 0 = 공급, P > 0 = 소비 기준에 맞게)
    const p_mw  = Math.abs(r.p_mw)
    const q_mvar = r.q_mvar  // 양수 = 지상(lagging), 음수 = 진상(leading)

    if (p_mw < 0.001) continue   // 매우 작은 부하 스킵

    const pf_current = p_mw / Math.sqrt(p_mw ** 2 + q_mvar ** 2)
    const phi_before = Math.acos(Math.min(1, Math.max(-1, pf_current)))
    const phi_target = Math.acos(pfTarget)

    // pf_current는 Q의 부호와 무관하게 항상 양수(크기)라서, 이미 진상(leading,
    // q_mvar<0 — 과보상이거나 경부하 시 케이블 충전전류가 지배적인 경우)인
    // 모선도 지상(lagging)과 똑같이 취급해 콘덴서를 "더" 추천했었다. 진상
    // 모선에 콘덴서를 더 넣으면 Q가 더 음수가 돼 상황이 악화된다 — 진상
    // 모선은 추가 보상이 필요 없다(오히려 리액터가 필요할 수 있지만 그건
    // 이 계산의 범위 밖).
    const qc_req = q_mvar > 0
      ? Math.max(0, p_mw * (Math.tan(phi_before) - Math.tan(phi_target)))
      : 0
    const qc_kvar = qc_req * 1000
    const qc_std  = roundUpStandard(qc_kvar)
    const qc_std_mvar = qc_std / 1000

    // 0으로 clamp하지 않는다 — 진상 모선(q_mvar<0, 위에서 qc_std_mvar=0)을
    // 손대지 않고 그대로 보여줘야 하고, 표준 규격이 필요량보다 커서(예:
    // 51kvar 필요한데 100kvar 규격만 있음) 과보정되는 경우도 실제로는
    // 약간 진상 쪽으로 넘어갈 수 있다 — 그걸 억지로 0(완전 unity)으로
    // 보여주면 거짓으로 완벽해 보인다.
    const q_after    = q_mvar - qc_std_mvar
    const pf_after   = p_mw / Math.sqrt(p_mw ** 2 + q_after ** 2)

    totalP  += p_mw
    totalQ  += q_mvar
    totalQc += qc_std_mvar

    buses.push({
      busId, busName: meta.name, vn_kv: meta.vn_kv,
      p_mw, q_mvar, pf_current, pf_target: pfTarget,
      qc_required: qc_req, qc_standard: qc_std_mvar, qc_kvar: qc_std,
      pf_after, status: vmStatus(pf_current),
      penalty_pct: pfPenalty(pf_current),
    })
  }

  const systemPf = totalP > 0
    ? totalP / Math.sqrt(totalP ** 2 + totalQ ** 2)
    : 1.0
  const totalQ_after = totalQ - totalQc
  const systemPfAfter = totalP > 0
    ? totalP / Math.sqrt(totalP ** 2 + totalQ_after ** 2)
    : 1.0

  return {
    buses,
    totalP_mw:        Math.round(totalP * 1000) / 1000,
    totalQ_mvar:      Math.round(totalQ * 1000) / 1000,
    totalQc_mvar:     Math.round(totalQc * 1000) / 1000,
    systemPf:         Math.round(systemPf * 1000) / 1000,
    systemPfAfter:    Math.round(systemPfAfter * 1000) / 1000,
    annualSaving_pct: pfPenalty(systemPf),
  }
}
