export interface Complex {
  re: number
  im: number
}

export const C = {
  zero: (): Complex => ({ re: 0, im: 0 }),
  from: (re: number, im = 0): Complex => ({ re, im }),

  add(a: Complex, b: Complex): Complex {
    return { re: a.re + b.re, im: a.im + b.im }
  },
  sub(a: Complex, b: Complex): Complex {
    return { re: a.re - b.re, im: a.im - b.im }
  },
  mul(a: Complex, b: Complex): Complex {
    return { re: a.re * b.re - a.im * b.im, im: a.re * b.im + a.im * b.re }
  },
  neg(a: Complex): Complex {
    return { re: -a.re, im: -a.im }
  },
  conj(a: Complex): Complex {
    return { re: a.re, im: -a.im }
  },
  abs(a: Complex): number {
    return Math.sqrt(a.re * a.re + a.im * a.im)
  },
  recip(a: Complex): Complex {
    const d = a.re * a.re + a.im * a.im
    if (d < 1e-30) throw new Error('Division by near-zero complex number')
    return { re: a.re / d, im: -a.im / d }
  },
  div(a: Complex, b: Complex): Complex {
    return C.mul(a, C.recip(b))
  },
}
