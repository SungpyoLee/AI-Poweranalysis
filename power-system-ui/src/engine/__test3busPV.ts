/**
 * 3-Bus PV Generator 테스트
 * npx tsx src/engine/__test3busPV.ts
 *
 * 계통:
 *   bus-HV  (154kV, Slack) — TR(30MVA, 154/22.9kV, vk=12%) — bus-GEN (22.9kV, PV)
 *   G-1 on bus-GEN: P=10MW, V=1.02 pu
 *   bus-GEN — Cable(1km, r=0.164Ω/km, x=0.1Ω/km) — bus-LOAD (22.9kV, PQ)
 *   bus-LOAD: P=15MW, Q=6MVAr
 *
 * Case A: Q_max=10MVAr  → PV mode maintained
 * Case B: Q_max= 3MVAr  → PV → PQ switch (Q limit exceeded)
 */

import { buildYBus, S_BASE } from './ybus'
import { nrSolve, type BusInput } from './newtonRaphson'

// ── Network definition ────────────────────────────────────────────────────────
const nodes: any[] = [
  {
    id: 'bus-hv', type: 'bus', position: { x: 0, y: 0 },
    data: { equipment: {
      equipmentType: 'bus', id: 'bus-hv', name: '154kV Bus',
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
    id: 'bus-gen', type: 'bus', position: { x: 0, y: 0 },
    data: { equipment: {
      equipmentType: 'bus', id: 'bus-gen', name: '22.9kV Gen Bus',
      description: '', in_service: true, vn_kv: 22.9, busType: 'PV',
    }},
  },
  {
    id: 'bus-load', type: 'bus', position: { x: 0, y: 0 },
    data: { equipment: {
      equipmentType: 'bus', id: 'bus-load', name: '22.9kV Load Bus',
      description: '', in_service: true, vn_kv: 22.9, busType: 'PQ',
    }},
  },
]

const edges: any[] = [
  // bus-hv ─ TR-1
  {
    id: 'e-hv-tr', source: 'bus-hv', target: 'tr-1', type: 'cable',
    data: { cable: {
      equipmentType: 'cable', id: 'e-hv-tr', name: 'HV-TR', description: '',
      in_service: true, std_type: '', length_m: 10,
      r_ohm_per_km: 0.001, x_ohm_per_km: 0.001, c_nf_per_km: 0,
      r0_ohm_per_km: 0.003, x0_ohm_per_km: 0.003, c0_nf_per_km: 0,
      max_i_ka: 1.0, max_i_ka_est: 0, is_underground: true, parallel: 1,
    }},
  },
  // TR-1 ─ bus-gen
  {
    id: 'e-tr-gen', source: 'tr-1', target: 'bus-gen', type: 'cable',
    data: { cable: {
      equipmentType: 'cable', id: 'e-tr-gen', name: 'LV-TR', description: '',
      in_service: true, std_type: '', length_m: 10,
      r_ohm_per_km: 0.001, x_ohm_per_km: 0.001, c_nf_per_km: 0,
      r0_ohm_per_km: 0.003, x0_ohm_per_km: 0.003, c0_nf_per_km: 0,
      max_i_ka: 1.0, max_i_ka_est: 0, is_underground: true, parallel: 1,
    }},
  },
  // bus-gen ─ Cable-1 ─ bus-load
  {
    id: 'cable-1', source: 'bus-gen', target: 'bus-load', type: 'cable',
    data: { cable: {
      equipmentType: 'cable', id: 'cable-1', name: 'Cable-1', description: '',
      in_service: true, std_type: '', length_m: 1000,
      r_ohm_per_km: 0.164, x_ohm_per_km: 0.1, c_nf_per_km: 210,
      r0_ohm_per_km: 0.492, x0_ohm_per_km: 0.3, c0_nf_per_km: 210,
      max_i_ka: 0.5, max_i_ka_est: 0, is_underground: true, parallel: 1,
    }},
  },
]

// ── Build Y-Bus ───────────────────────────────────────────────────────────────
const { Y, busOrder } = buildYBus(nodes, edges)

// ── Case A & B runner ─────────────────────────────────────────────────────────
function runCase(label: string, q_max_mvar: number, q_min_mvar: number) {
  console.log(`\n${'═'.repeat(56)}`)
  console.log(` ${label}`)
  console.log(` G-1: P=10MW, V=1.02pu, Q_min=${q_min_mvar}MVAr, Q_max=${q_max_mvar}MVAr`)
  console.log(` Load: P=15MW, Q=6MVAr`)
  console.log('═'.repeat(56))

  const busInputs: BusInput[] = [
    {
      nodeId: 'bus-hv',   type: 'SLACK',
      V: 1.0,  theta: 0,  P_spec: 0,       Q_spec: 0,
      q_min: -Infinity, q_max: Infinity,
    },
    {
      nodeId: 'bus-gen',  type: 'PV',
      V: 1.02, theta: 0,  P_spec: 10 / S_BASE, Q_spec: 0,
      q_min: q_min_mvar / S_BASE,
      q_max: q_max_mvar / S_BASE,
    },
    {
      nodeId: 'bus-load', type: 'PQ',
      V: 1.0,  theta: 0,  P_spec: -15 / S_BASE, Q_spec: -6 / S_BASE,
      q_min: -Infinity, q_max: Infinity,
    },
  ]

  const result = nrSolve(Y, busInputs)

  console.log('\n── Iteration log ────────────────────────────────')
  for (const { iter, maxMismatch } of result.iterLog) {
    console.log(`  Iter ${iter}: maxMismatch = ${maxMismatch.toExponential(6)} pu`)
  }

  console.log('\n── Bus Results ──────────────────────────────────')
  for (const r of result.buses) {
    const inp = busInputs.find(b => b.nodeId === r.nodeId)!
    const mode = inp.type === 'PV' && result.pvSwitches.some(s => s.nodeId === r.nodeId)
      ? 'PQ_LIM'
      : inp.type
    console.log(
      `  ${r.nodeId.padEnd(10)} [${mode.padEnd(6)}]` +
      `  V = ${r.vm_pu.toFixed(6)} pu` +
      `  θ = ${r.va_degree.toFixed(4)}°` +
      `  P = ${(r.P_inj_pu * S_BASE).toFixed(4)} MW` +
      `  Q = ${(r.Q_inj_pu * S_BASE).toFixed(4)} MVAr`
    )
  }

  if (result.pvSwitches.length > 0) {
    console.log('\n── PV → PQ Switches ─────────────────────────────')
    for (const sw of result.pvSwitches) {
      console.log(
        `  Iter ${sw.iter}: ${sw.nodeId}` +
        `  Q = ${(sw.Q_pu * S_BASE).toFixed(3)} MVAr` +
        `  hit ${sw.reason} = ${(sw.Q_lim_pu * S_BASE).toFixed(2)} MVAr`
      )
    }
  } else {
    console.log('\n  No PV → PQ switches (generator within Q limits)')
  }

  console.log('\n── Summary ──────────────────────────────────────')
  console.log(`  Converged   : ${result.converged}`)
  console.log(`  Iterations  : ${result.iterationCount}`)
  console.log(`  MaxMismatch : ${result.maxMismatch.toExponential(4)} pu`)
  console.log(`  PV switches : ${result.pvSwitches.length}`)

  // Generator Q output
  const genBus = result.buses.find(b => b.nodeId === 'bus-gen')!
  const Q_gen  = genBus.Q_inj_pu * S_BASE   // net Q at bus-gen = generator Q (no local load)
  console.log(`\n── Generator Output ─────────────────────────────`)
  console.log(`  G-1: P = 10.00 MW (specified)`)
  console.log(`  G-1: Q = ${Q_gen.toFixed(3)} MVAr (limit: ${q_min_mvar}~${q_max_mvar} MVAr)`)
  console.log(`  V_gen = ${genBus.vm_pu.toFixed(6)} pu`)
}

// ── Run all cases ─────────────────────────────────────────────────────────────
runCase('Case 0 — No Q limit  (natural Q output)',   1e6,  -1e6)   // unconstrained
runCase('Case A — PV mode maintained (Q_max=20MVAr)',  20,    -8)   // wide enough
runCase('Case B — PV→PQ switch      (Q_max=3 MVAr)',    3,    -8)   // tight limit
