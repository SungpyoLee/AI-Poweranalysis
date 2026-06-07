/**
 * 3-Bus 테스트 (Node.js 직접 실행용)
 * npx tsx src/engine/__test3bus.ts
 *
 * 계통:
 *   bus-154 (154kV, Slack) — TR(30MVA, 154/22.9kV, vk=12%) — bus-229 (22.9kV)
 *   bus-229 — Cable(500m, r=0.164Ω/km, x=0.1Ω/km, c=210nF/km, max=0.5kA) — bus-330 (22.9kV)
 *   bus-330 에 5MW + 2MVAr 부하
 *
 * 예상 결과:
 *   bus-229: V ≈ 0.9909 pu,  θ ≈ -1.140°
 *   bus-330: V ≈ 0.9899 pu,  θ ≈ -1.151°
 *   Cable-1: I ≈ 137A, loading ≈ 27.4%, ΔV ≈ 0.100%, pl ≈ 4.6kW
 */

type Node<T> = { id: string; type: string; data: { equipment: T }; position: { x: number; y: number } }
type Edge<T> = { id: string; source: string; target: string; type: string; data: T }

import { buildYBus, S_BASE } from './ybus'
import { nrSolve, type BusInput } from './newtonRaphson'

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
      equipmentType: 'bus', id: 'bus-229', name: '22.9kV LV Bus',
      description: '', in_service: true, vn_kv: 22.9, busType: 'PQ',
    }},
  },
  {
    id: 'bus-330', type: 'bus', position: { x: 0, y: 0 },
    data: { equipment: {
      equipmentType: 'bus', id: 'bus-330', name: '22.9kV Load Bus',
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
  // bus-229 ─ Cable-1 ─ bus-330  (direct bus-bus line → Y-Bus 포함)
  {
    id: 'cable-1', source: 'bus-229', target: 'bus-330', type: 'cable',
    data: { cable: {
      equipmentType: 'cable', id: 'cable-1', name: 'Cable-1', description: '',
      in_service: true, std_type: '', length_m: 500,
      r_ohm_per_km: 0.164, x_ohm_per_km: 0.1, c_nf_per_km: 210,
      r0_ohm_per_km: 0.492, x0_ohm_per_km: 0.3, c0_nf_per_km: 210,
      max_i_ka: 0.5, max_i_ka_est: 0, is_underground: true, parallel: 1,
    }},
  },
  // bus-330 ─ load-1
  {
    id: 'e-lv-load', source: 'bus-330', target: 'load-1', type: 'cable',
    data: { cable: {
      equipmentType: 'cable', id: 'e-lv-load', name: 'LV-Load', description: '',
      in_service: true, std_type: '', length_m: 1,
      r_ohm_per_km: 0.001, x_ohm_per_km: 0.001, c_nf_per_km: 0,
      r0_ohm_per_km: 0.003, x0_ohm_per_km: 0.003, c0_nf_per_km: 0,
      max_i_ka: 1.0, max_i_ka_est: 0, is_underground: true, parallel: 1,
    }},
  },
]

console.log('\n════════════════════════════════════════════')
console.log(' 3-Bus Load Flow Test (NR Engine)')
console.log('════════════════════════════════════════════\n')

// ── Y-Bus ─────────────────────────────────────────────────────────────────────
const { Y, busOrder, nodeToIdx } = buildYBus(nodes, edges)

console.log('Bus order:', busOrder)
console.log('Y-Bus matrix:\n')
for (let i = 0; i < Y.length; i++) {
  for (let j = 0; j < Y[i].length; j++) {
    const g = Y[i][j].re.toFixed(5)
    const b = Y[i][j].im >= 0 ? `+j${Y[i][j].im.toFixed(5)}` : `-j${Math.abs(Y[i][j].im).toFixed(5)}`
    process.stdout.write(`  [${i},${j}] ${g}${b}`)
  }
  console.log()
}

// ── BusInput ──────────────────────────────────────────────────────────────────
const busInputs: BusInput[] = [
  { nodeId: 'bus-154', type: 'SLACK', V: 1.0, theta: 0, P_spec: 0,      Q_spec: 0     },
  { nodeId: 'bus-229', type: 'PQ',    V: 1.0, theta: 0, P_spec: 0,      Q_spec: 0     },
  { nodeId: 'bus-330', type: 'PQ',    V: 1.0, theta: 0, P_spec: -0.05,  Q_spec: -0.02 },
]

console.log('\nNewton-Raphson iterations:')
const result = nrSolve(Y, busInputs)

console.log('\n── Iteration log ────────────────────────────')
for (const { iter, maxMismatch } of result.iterLog) {
  console.log(`  Iter ${iter}: maxMismatch = ${maxMismatch.toExponential(6)} pu`)
}

console.log('\n── Bus Results ──────────────────────────────')
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

// ── Cable branch calculation ──────────────────────────────────────────────────
console.log('\n── Cable Branch Results ─────────────────────')

const bus229 = result.buses.find(b => b.nodeId === 'bus-229')!
const bus330 = result.buses.find(b => b.nodeId === 'bus-330')!

const Vf  = bus229.vm_pu
const Vt  = bus330.vm_pu
const Thf = bus229.va_degree * (Math.PI / 180)
const Tht = bus330.va_degree * (Math.PI / 180)
const dt  = Thf - Tht

const len_km  = 0.5                  // 500m
const r       = 0.164                // Ω/km
const x       = 0.1                  // Ω/km
const c_nf    = 210                  // nF/km
const V_kv    = 22.9                 // from-bus rated voltage
const Z_base  = (V_kv * V_kv) / S_BASE   // 5.2441 Ω
const R_pu    = (r * len_km) / Z_base
const X_pu    = (x * len_km) / Z_base
const denom   = R_pu * R_pu + X_pu * X_pu
const g_s     = R_pu / denom
const b_s     = -X_pu / denom

const B_pu       = (c_nf * len_km * 1e-9) * 2 * Math.PI * 60 * Z_base
const B_sh_half  = B_pu / 2

const P_from = Vf * Vf * g_s - Vf * Vt * (g_s * Math.cos(dt) + b_s * Math.sin(dt))
const Q_from = -Vf * Vf * (b_s + B_sh_half) - Vf * Vt * (g_s * Math.sin(dt) - b_s * Math.cos(dt))
const P_to   = Vt * Vt * g_s - Vt * Vf * (g_s * Math.cos(-dt) + b_s * Math.sin(-dt))
const Q_to   = -Vt * Vt * (b_s + B_sh_half) - Vt * Vf * (g_s * Math.sin(-dt) - b_s * Math.cos(-dt))

const P_from_mw   = P_from * S_BASE
const Q_from_mvar = Q_from * S_BASE
const P_to_mw     = P_to   * S_BASE
const Q_to_mvar   = Q_to   * S_BASE
const pl_mw       = P_from_mw + P_to_mw
const ql_mvar     = Q_from_mvar + Q_to_mvar

const I_base_kA  = S_BASE / (Math.sqrt(3) * V_kv)   // 2.521 kA
const S_from_pu  = Math.sqrt(P_from * P_from + Q_from * Q_from)
const i_ka       = (S_from_pu / Vf) * I_base_kA
const max_i_ka   = 0.5
const loading    = (i_ka / max_i_ka) * 100
const vdrop      = (Vf - Vt) / Vf * 100

console.log(`  Cable-1 (bus-229 → bus-330, 500m):`)
console.log(`    P_from = ${P_from_mw.toFixed(4)} MW,   Q_from = ${Q_from_mvar.toFixed(4)} MVAr`)
console.log(`    P_to   = ${P_to_mw.toFixed(4)} MW,   Q_to   = ${Q_to_mvar.toFixed(4)} MVAr`)
console.log(`    pl     = ${(pl_mw * 1000).toFixed(2)} kW,      ql     = ${(ql_mvar * 1000).toFixed(2)} kvar`)
console.log(`    I      = ${(i_ka * 1000).toFixed(1)} A        (base = ${(I_base_kA * 1000).toFixed(1)} A)`)
console.log(`    loading= ${loading.toFixed(2)}%        (max = ${max_i_ka * 1000} A)`)
console.log(`    ΔV     = ${vdrop.toFixed(4)}%`)

console.log('\n── Summary ──────────────────────────────────')
console.log(`  Converged    : ${result.converged}`)
console.log(`  Iterations   : ${result.iterationCount}`)
console.log(`  MaxMismatch  : ${result.maxMismatch.toExponential(4)} pu`)

console.log('\n── Expected ─────────────────────────────────')
console.log('  bus-229  V ≈ 0.9909 pu,  θ ≈ -1.140°')
console.log('  bus-330  V ≈ 0.9899 pu,  θ ≈ -1.151°')
console.log('  Cable-1  I ≈ 137A,  loading ≈ 27.4%,  ΔV ≈ 0.100%,  pl ≈ 4.6kW')
console.log()
