/**
 * IEC 60909 Short-Circuit 검증 테스트
 * npx tsx src/engine/__testSC.ts
 *
 * 계통:
 *   bus-HV  (154kV, Slack)  sc_mva=5000, xr_ratio=10
 *     └── TR-1 (30MVA, 154/22.9kV, vk=12%, vkr=0.5%)
 *   bus-LV  (22.9kV, PQ)
 *
 * 해석값 (수계산):
 *   Z_grid = S_BASE/sc_mva ∠atan(xr_ratio) = 0.001990+j0.019900 pu @154kV
 *   Z_TR   = (0.005+j0.11990)×(100/30)    = 0.016667+j0.399653 pu
 *   Z_th   = Z_grid + Z_TR                 = 0.018657+j0.419553 pu
 *   |Z_th| = 0.42000 pu
 *   I_base_22.9kV = 100/(√3×22.9)         = 2.5213 kA
 *   Ik"   = 1.1/0.42000 × 2.5213         ≈ 6.603 kA
 *   κ     = 1.02+0.98×exp(−3×0.04447)    ≈ 1.878
 *   Ip    = 1.878×√2×6.603               ≈ 17.53 kA
 *   Sk"   = 1.1×100/0.42000             ≈ 261.9 MVA
 */

import { runLocalShortcircuit } from './shortcircuit'

// ── Network definition ────────────────────────────────────────────────────────
const nodes: any[] = [
  {
    id: 'bus-hv', type: 'bus', position: { x: 0, y: 0 },
    data: { equipment: {
      equipmentType: 'bus', id: 'bus-hv', name: '154kV Bus (Slack)',
      description: '', in_service: true,
      vn_kv: 154, busType: 'Slack',
      sc_mva: 5000, xr_ratio: 10,
    }},
  },
  {
    id: 'tr-1', type: 'transformer', position: { x: 0, y: 0 },
    data: { equipment: {
      equipmentType: 'transformer', id: 'tr-1', name: 'TR-1',
      description: '', in_service: true,
      sn_mva: 30, vn_hv_kv: 154, vn_lv_kv: 22.9,
      vk_percent: 12, vkr_percent: 0.5,
      pfe_kw: 30, i0_percent: 0.1,
      tap_pos: 0, tap_neutral: 0, tap_min: -2, tap_max: 2, tap_step_percent: 2.5,
    }},
  },
  {
    id: 'bus-lv', type: 'bus', position: { x: 0, y: 0 },
    data: { equipment: {
      equipmentType: 'bus', id: 'bus-lv', name: '22.9kV Bus',
      description: '', in_service: true,
      vn_kv: 22.9, busType: 'PQ',
    }},
  },
]

const edges: any[] = [
  { id: 'e-hv-tr', source: 'bus-hv', target: 'tr-1',  type: 'cable', data: { cable: null } },
  { id: 'e-tr-lv', source: 'tr-1',   target: 'bus-lv', type: 'cable', data: { cable: null } },
]

// ── Run ───────────────────────────────────────────────────────────────────────
console.log('\n' + '═'.repeat(60))
console.log('  IEC 60909 단락전류 계산 — 154kV/22.9kV 변압기 예제')
console.log('  sc_mva=5000 MVA, xr_ratio=10, TR: 30MVA vk=12%')
console.log('═'.repeat(60))

const result = runLocalShortcircuit(nodes, edges)

const S_BASE = 100

console.log('\n── 결과 요약 ────────────────────────────────────────────')
for (const [nodeId, r] of Object.entries(result.buses)) {
  const name = nodes.find(n => n.id === nodeId)?.data.equipment.name ?? nodeId
  const vn   = nodes.find(n => n.id === nodeId)?.data.equipment.vn_kv ?? 0
  if (r.ikss_ka === 0) {
    console.log(`  ${name.padEnd(22)}: (ideal bus — undefined)`)
    continue
  }
  console.log(
    `  ${name.padEnd(22)}: Ik" = ${r.ikss_ka.toFixed(3)} kA` +
    `  Ip = ${r.ip_ka.toFixed(3)} kA` +
    `  Sk" = ${r.skss_mva.toFixed(1)} MVA`
  )
}

console.log('\n── 수계산 대비 ──────────────────────────────────────────')
const lv = result.buses['bus-lv']
if (lv) {
  const ikss_ref  = 6.603
  const ip_ref    = 17.53
  const skss_ref  = 261.9
  console.log(`  Ik"   계산: ${lv.ikss_ka.toFixed(3)} kA   기준: ${ikss_ref} kA   오차: ${Math.abs(lv.ikss_ka - ikss_ref).toFixed(4)} kA`)
  console.log(`  Ip    계산: ${lv.ip_ka.toFixed(3)} kA   기준: ${ip_ref} kA   오차: ${Math.abs(lv.ip_ka - ip_ref).toFixed(4)} kA`)
  console.log(`  Sk"   계산: ${lv.skss_mva.toFixed(1)} MVA  기준: ${skss_ref} MVA  오차: ${Math.abs(lv.skss_mva - skss_ref).toFixed(2)} MVA`)
}
