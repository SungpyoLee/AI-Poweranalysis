import type { Complex } from './complex'

// ── 입력/출력 타입 ─────────────────────────────────────────────────────────────
export interface BusInput {
  nodeId:  string
  type:    'SLACK' | 'PQ' | 'PV'
  V:       number   // initial / specified |V| pu
  theta:   number   // initial θ rad
  P_spec:  number   // scheduled net injection (gen−load) pu
  Q_spec:  number   // scheduled Q pu (PQ only; PV uses q_min/q_max)
  q_min:   number   // reactive lower limit pu  (-Infinity for PQ/SLACK)
  q_max:   number   // reactive upper limit pu  (+Infinity for PQ/SLACK)
}

export interface BusResult {
  nodeId:    string
  vm_pu:     number
  va_degree: number
  P_inj_pu:  number
  Q_inj_pu:  number
}

export interface PVSwitch {
  nodeId:   string
  Q_pu:     number     // Q at the time of switch
  Q_lim_pu: number     // limit that was hit
  reason:   'Q_MAX' | 'Q_MIN'
  iter:     number
}

export interface NRResult {
  converged:      boolean
  iterationCount: number
  maxMismatch:    number
  buses:          BusResult[]
  iterLog:        Array<{ iter: number; maxMismatch: number }>
  pvSwitches:     PVSwitch[]   // PV → PQ events (one-way, no recovery within run)
}

// ── Gaussian elimination with partial pivoting ────────────────────────────────
function gaussElim(A: number[][], b: number[]): number[] {
  const n = b.length
  if (n === 0) return []
  const M: number[][] = A.map((row, i) => [...row, b[i]])

  for (let col = 0; col < n; col++) {
    let maxRow = col
    let maxVal = Math.abs(M[col][col])
    for (let row = col + 1; row < n; row++) {
      const v = Math.abs(M[row][col])
      if (v > maxVal) { maxVal = v; maxRow = row }
    }
    if (maxRow !== col) [M[col], M[maxRow]] = [M[maxRow], M[col]]
    if (Math.abs(M[col][col]) < 1e-12) throw new Error('Singular Jacobian — check network connectivity')

    for (let row = col + 1; row < n; row++) {
      const f = M[row][col] / M[col][col]
      for (let k = col; k <= n; k++) M[row][k] -= f * M[col][k]
    }
  }

  const x = new Array(n).fill(0)
  for (let i = n - 1; i >= 0; i--) {
    x[i] = M[i][n]
    for (let j = i + 1; j < n; j++) x[i] -= M[i][j] * x[j]
    x[i] /= M[i][i]
  }
  return x
}

// ── Bus power injection (P, Q) ────────────────────────────────────────────────
function calcPQ(
  i: number,
  n: number,
  V:     number[],
  theta: number[],
  G:     number[][],
  B:     number[][],
): { P: number; Q: number } {
  let P = 0, Q = 0
  for (let j = 0; j < n; j++) {
    const t   = theta[i] - theta[j]
    const Vij = V[i] * V[j]
    P += Vij * (G[i][j] * Math.cos(t) + B[i][j] * Math.sin(t))
    Q += Vij * (G[i][j] * Math.sin(t) - B[i][j] * Math.cos(t))
  }
  return { P, Q }
}

// ── Newton-Raphson Solver (N-bus, PV/PQ/Slack, Q-limit enforcement) ───────────
export function nrSolve(
  Ycpx:    Complex[][],
  buses:   BusInput[],
  maxIter  = 50,
  tol      = 1e-6,
): NRResult {
  const n = buses.length

  const G = Ycpx.map(row => row.map(y => y.re))
  const B = Ycpx.map(row => row.map(y => y.im))

  const V     = buses.map(b => b.V)
  const theta = buses.map(b => b.theta)

  // Mutable bus type tracking — PV → PQ one-way, no recovery during this run
  const currentTypes = buses.map(b => b.type as 'SLACK' | 'PQ' | 'PV')
  const Q_spec_eff   = buses.map(b => b.Q_spec)   // updated when PV→PQ switches
  const pvSwitches: PVSwitch[] = []

  let iterationCount = 0
  let maxMismatch    = 0
  const iterLog: NRResult['iterLog'] = []

  for (let iter = 0; iter < maxIter; iter++) {
    iterationCount = iter + 1

    // ── A: Enforce current PV voltage specs ──────────────────────────────────
    let pvIdx = buses.map((_, i) => i).filter(i => currentTypes[i] === 'PV')
    pvIdx.forEach(i => { V[i] = buses[i].V })

    // ── B: Compute P, Q injections ───────────────────────────────────────────
    const Pcalc = new Array(n).fill(0)
    const Qcalc = new Array(n).fill(0)
    for (let i = 0; i < n; i++) {
      const { P, Q } = calcPQ(i, n, V, theta, G, B)
      Pcalc[i] = P
      Qcalc[i] = Q
    }

    // ── C: Q limit check — PV → PQ (one-way) ────────────────────────────────
    // Skip iter 0: flat-start Q values are unreliable (all θ=0 artifacts)
    let switched = false
    for (const i of (iter === 0 ? [] : pvIdx)) {
      const Qi = Qcalc[i]
      if (Qi > buses[i].q_max) {
        currentTypes[i] = 'PQ'
        Q_spec_eff[i]   = buses[i].q_max
        pvSwitches.push({ nodeId: buses[i].nodeId, Q_pu: Qi, Q_lim_pu: buses[i].q_max, reason: 'Q_MAX', iter: iter + 1 })
        switched = true
      } else if (Qi < buses[i].q_min) {
        currentTypes[i] = 'PQ'
        Q_spec_eff[i]   = buses[i].q_min
        pvSwitches.push({ nodeId: buses[i].nodeId, Q_pu: Qi, Q_lim_pu: buses[i].q_min, reason: 'Q_MIN', iter: iter + 1 })
        switched = true
      }
    }

    // ── D: Rebuild index arrays (post-switch) ────────────────────────────────
    pvIdx                  = buses.map((_, i) => i).filter(i => currentTypes[i] === 'PV')
    const pqIdx            = buses.map((_, i) => i).filter(i => currentTypes[i] === 'PQ')
    const nonSlack         = [...pvIdx, ...pqIdx]
    const nNS              = nonSlack.length
    const nPQ              = pqIdx.length
    const stateSize        = nNS + nPQ

    // Re-enforce PV voltages (pvIdx may have shrunk after switch)
    pvIdx.forEach(i => { V[i] = buses[i].V })

    // ── E: Mismatch vector ───────────────────────────────────────────────────
    const f = new Array(stateSize).fill(0)
    nonSlack.forEach((bi, k) => { f[k]       = buses[bi].P_spec - Pcalc[bi] })
    pqIdx   .forEach((bi, k) => { f[nNS + k] = Q_spec_eff[bi]  - Qcalc[bi] })

    maxMismatch = stateSize > 0 ? Math.max(...f.map(Math.abs)) : 0
    iterLog.push({ iter: iter + 1, maxMismatch })

    // ── F: Convergence check ─────────────────────────────────────────────────
    if (maxMismatch < tol && !switched) break
    if (stateSize === 0) break

    // ── G: Jacobian ──────────────────────────────────────────────────────────
    const J: number[][] = Array.from({ length: stateSize }, () => new Array(stateSize).fill(0))

    // H block: ∂P_nonSlack / ∂θ_nonSlack
    nonSlack.forEach((bi, ki) => {
      nonSlack.forEach((bj, kj) => {
        const t = theta[bi] - theta[bj]
        J[ki][kj] = ki === kj
          ? -Qcalc[bi] - B[bi][bi] * V[bi] * V[bi]
          : V[bi] * V[bj] * (G[bi][bj] * Math.sin(t) - B[bi][bj] * Math.cos(t))
      })
    })

    // N block: ∂P_nonSlack / ∂|V|_PQ
    nonSlack.forEach((bi, ki) => {
      pqIdx.forEach((bj, kj) => {
        const col = nNS + kj
        const t   = theta[bi] - theta[bj]
        J[ki][col] = bi === bj
          ? Pcalc[bi] / V[bi] + G[bi][bi] * V[bi]
          : V[bi] * (G[bi][bj] * Math.cos(t) + B[bi][bj] * Math.sin(t))
      })
    })

    // M block: ∂Q_PQ / ∂θ_nonSlack
    pqIdx.forEach((bi, ki) => {
      const row = nNS + ki
      nonSlack.forEach((bj, kj) => {
        const t = theta[bi] - theta[bj]
        J[row][kj] = bi === bj
          ? Pcalc[bi] - G[bi][bi] * V[bi] * V[bi]
          : -V[bi] * V[bj] * (G[bi][bj] * Math.cos(t) + B[bi][bj] * Math.sin(t))
      })
    })

    // L block: ∂Q_PQ / ∂|V|_PQ
    pqIdx.forEach((bi, ki) => {
      const row = nNS + ki
      pqIdx.forEach((bj, kj) => {
        const col = nNS + kj
        const t   = theta[bi] - theta[bj]
        J[row][col] = bi === bj
          ? Qcalc[bi] / V[bi] - B[bi][bi] * V[bi]
          : V[bi] * (G[bi][bj] * Math.sin(t) - B[bi][bj] * Math.cos(t))
      })
    })

    // ── H: Solve J·Δx = f ────────────────────────────────────────────────────
    const dx = gaussElim(J, f)

    // ── I: Update state ───────────────────────────────────────────────────────
    nonSlack.forEach((bi, k) => { theta[bi] += dx[k] })
    pqIdx   .forEach((bi, k) => { V[bi]     += dx[nNS + k] })
  }

  // Ensure final PV bus voltages are at spec before reporting
  buses.map((_, i) => i).filter(i => currentTypes[i] === 'PV')
    .forEach(i => { V[i] = buses[i].V })

  const results: BusResult[] = buses.map((bus, i) => {
    const { P, Q } = calcPQ(i, n, V, theta, G, B)
    return {
      nodeId:    bus.nodeId,
      vm_pu:     V[i],
      va_degree: theta[i] * (180 / Math.PI),
      P_inj_pu:  P,
      Q_inj_pu:  Q,
    }
  })

  return {
    converged:      maxMismatch < tol,
    iterationCount,
    maxMismatch,
    buses:          results,
    iterLog,
    pvSwitches,
  }
}
