// Pure scatter scale math — no deps. Domain from data padded 8%, optional log10
// x-axis (padding applied in log space; nonpositive values clamp to the domain),
// y inverted for screen coordinates.

export interface ScatterPt {
  id: string
  x: number
  y: number
}

export interface Scales {
  sx: (v: number) => number
  sy: (v: number) => number
  xDomain: readonly [number, number]
  yDomain: readonly [number, number]
}

export interface ScaleOpts {
  w: number
  h: number
  logX?: boolean
}

const PAD = 0.08
// log-mode floor: nonpositive values snap here before transforming
const FLOOR = 1e-6

const paddedDomain = (values: number[]): [number, number] => {
  const lo = Math.min(...values)
  const hi = Math.max(...values)
  const span = hi - lo || Math.abs(hi) || 1
  return [lo - span * PAD, hi + span * PAD]
}

const linear = ([d0, d1]: readonly [number, number], [r0, r1]: readonly [number, number]) =>
  (v: number) => r0 + ((v - d0) / (d1 - d0)) * (r1 - r0)

const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), hi)

export function makeScales(pts: ScatterPt[], { w, h, logX }: ScaleOpts): Scales {
  const yd = paddedDomain(pts.map((p) => p.y))
  const sy = linear(yd, [h, 0])
  const xs = pts.map((p) => p.x)

  if (!logX) {
    const xDomain = paddedDomain(xs)
    return { sx: linear(xDomain, [0, w]), sy, xDomain, yDomain: yd }
  }

  // pad the LOG-transformed domain so edge dots keep an 8% inset; the domain
  // derives from positive values only — everything else clamps into it, and an
  // all-nonpositive set degrades to a floor-anchored domain (never NaN)
  const positives = xs.filter((v) => v > 0)
  const ld = paddedDomain(positives.length > 0 ? positives.map(Math.log10) : [Math.log10(FLOOR)])
  const raw = linear(ld, [0, w])
  return {
    sx: (v: number) => raw(clamp(v > 0 ? Math.log10(v) : Math.log10(FLOOR), ld[0], ld[1])),
    sy,
    xDomain: [10 ** ld[0], 10 ** ld[1]],
    yDomain: yd,
  }
}

export function projectPoint(p: ScatterPt, s: Scales): { cx: number; cy: number } {
  return { cx: s.sx(p.x), cy: s.sy(p.y) }
}

export interface TickOpts {
  log?: boolean
  integral?: boolean
  count?: number
}

export function axisTicks(domain: readonly [number, number], opts: TickOpts = {}): number[] {
  const [d0, d1] = domain
  if (opts.integral) {
    const ints: number[] = []
    for (let i = Math.ceil(d0); i <= Math.floor(d1); i++) ints.push(i)
    if (ints.length >= 2 && ints.length <= 15) return ints
  }
  if (opts.log) {
    const decades: number[] = []
    for (let e = Math.ceil(Math.log10(Math.max(d0, FLOOR))); e <= Math.floor(Math.log10(d1)); e++) decades.push(10 ** e)
    if (decades.length >= 2) return decades
  }
  const n = opts.count ?? 5
  return Array.from({ length: n }, (_, i) => d0 + ((d1 - d0) * i) / (n - 1))
}
