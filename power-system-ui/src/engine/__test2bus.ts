/**
 * 2-Bus 테스트 (Node.js 직접 실행용)
 * npx tsx src/engine/__test2bus.ts
 *
 * 계통:
 *   bus-154 (154kV, Slack) — TR(30MVA, 154/22.9kV, vk=12%, vkr=0.5%) — bus-229 (22.9kV, PQ)
 *   bus-229 에 5MW + 2MVAr 부하
 */

// Minimal ReactFlow type stubs for test
type Node<T> = { id: string; type: string; data: { equipment: T }; position: { x: number; y: number } }
type Edge<T> = { id: string; source: string; target: string; type: string; data: T }

import { buildYBus, S_BASE } from './ybus'
import { nrSolve, type BusInput } from './newtonRaphson'

// ── 입력 데이터 ───────────────────────────────────────────────────────────────
const nodes: any[] = [
  {
    id: 'bus-154', type: 'bus', position: { x: 0, y: 0 },
    data: { equipment: {
      equipmentType: 'bus', id: 'bus-154', name: '154kV Bus',
      description: '', in_service: true, vn_kv: 154, busType: 'Slack',
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
    id: 'bus-229', type: 'bus', position: { x: 0, y: 0 },
    data: { equipment: {
      equipmentType: 'bus', id: 'bus-229', name: '22.9kV Bus',
      description: '', in_service: true, vn_kv: 22.9, busType: 'PQ',
    }},
  },
  {
    id: 'load-1', type: 'load', position: { x: 0, y: 0 },
    data: { equipment: {
      equipmentType: 'load', id: 'load-1', name: 'L-1',
      description: '', in_service: true,
      p_kw: 5000, q_kvar: 2000, vn_kv: 22.9, pf: 0.928,
      const_z_percent: 0, const_i_percent: 0, const_p_percent: 100,
      scaling: 1.0,
    }},
  },
]

const edges: any[] = [
  // bus-154 ─ TR-1
  {
    id: 'e-hv-tr', source: 'bus-154', target: 'tr-1', type: 'cable',
    data: { cable: {
      equipmentType: 'cable', id: 'e-hv-tr', name: 'HV-TR', description: '',
      in_service: true, std_type: '', length_m: 10,
      r_ohm_per_km: 0.001, x_ohm_per_km: 0.001, c_nf_per_km: 0,
      r0_ohm_per_km: 0.003, x0_ohm_per_km: 0.003, c0_nf_per_km: 0,
      max_i_ka: 1.0, max_i_ka_est: 0, is_underground: true, parallel: 1,
    }},
  },
  // TR-1 ─ bus-229
  {
    id: 'e-tr-lv', source: 'tr-1', target: 'bus-229', type: 'cable',
    data: { cable: {
      equipmentType: 'cable', id: 'e-tr-lv', name: 'LV-TR', description: '',
      in_service: true, std_type: '', length_m: 10,
      r_ohm_per_km: 0.001, x_ohm_per_km: 0.001, c_nf_per_km: 0,
      r0_ohm_per_km: 0.003, x0_ohm_per_km: 0.003, c0_nf_per_km: 0,
      max_i_ka: 1.0, max_i_ka_est: 0, is_underground: true, parallel: 1,
    }},
  },
  // bus-229 ─ load-1
  {
    id: 'e-lv-load', source: 'bus-229', target: 'load-1', type: 'cable',
    data: { cable: {
      equipmentType: 'cable', id: 'e-lv-load', name: 'LV-Load', description: '',
      in_service: true, std_type: '', length_km: 0.001,
      r_ohm_per_km: 0.001, x_ohm_per_km: 0.001, c_nf_per_km: 0,
      r0_ohm_per_km: 0.003, x0_ohm_per_km: 0.003, c0_nf_per_km: 0,
      max_i_ka: 1.0, max_i_ka_est: 0, is_underground: true, parallel: 1,
    }},
  },
]

// ── Y-Bus 구성 ────────────────────────────────────────────────────────────────
console.log('\n════════════════════════════════════════════')
console.log(' 2-Bus Load Flow Test (NR Engine)')
console.log('════════════════════════════════════════════\n')

const { Y, busOrder } = buildYBus(nodes, edges)

console.log('Y-Bus matrix (bus order:', busOrder, ')\n')
for (let i = 0; i < Y.length; i++) {
  for (let j = 0; j < Y[i].length; j++) {
    const g = Y[i][j].re.toFixed(5)
    const b = Y[i][j].im >= 0 ? `+j${Y[i][j].im.toFixed(5)}` : `-j${Math.abs(Y[i][j].im).toFixed(5)}`
    process.stdout.write(`  [${i},${j}] ${g}${b}`)
  }
  console.log()
}

// ── BusInput 구성 ─────────────────────────────────────────────────────────────
const busInputs: BusInput[] = [
  { nodeId: 'bus-154', type: 'SLACK', V: 1.0, theta: 0, P_spec: 0,      Q_spec: 0     },
  { nodeId: 'bus-229', type: 'PQ',    V: 1.0, theta: 0, P_spec: -0.05,  Q_spec: -0.02 },
]

// ── NR Solve ──────────────────────────────────────────────────────────────────
console.log('\nNewton-Raphson iterations:')
const result = nrSolve(Y, busInputs)

console.log('\n── Iteration log ────────────────────────────')
for (const { iter, maxMismatch } of result.iterLog) {
  console.log(`  Iter ${iter}: maxMismatch = ${maxMismatch.toExponential(6)} pu`)
}

console.log('\n── Results ──────────────────────────────────')
for (const r of result.buses) {
  const input = busInputs.find(b => b.nodeId === r.nodeId)!
  console.log(
    `  ${r.nodeId.padEnd(10)} [${input.type.padEnd(5)}]` +
    `  V = ${r.vm_pu.toFixed(6)} pu` +
    `  θ = ${r.va_degree.toFixed(4)}°` +
    `  P = ${(r.P_inj_pu * S_BASE).toFixed(4)} MW` +
    `  Q = ${(r.Q_inj_pu * S_BASE).toFixed(4)} MVAr`
  )
}

console.log('\n── Summary ──────────────────────────────────')
console.log(`  Converged    : ${result.converged}`)
console.log(`  Iterations   : ${result.iterationCount}`)
console.log(`  MaxMismatch  : ${result.maxMismatch.toExponential(4)} pu`)

console.log('\n── Expected ─────────────────────────────────')
console.log('  bus-229  V ≈ 0.9909 pu,  θ ≈ -1.139°')
console.log('  bus-154  P_grid ≈ 5.03 MW,  Q_grid ≈ 2.09 MVAr')
console.log()
