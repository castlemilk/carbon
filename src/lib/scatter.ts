// Pure scatter scale math — no deps. Domain from data padded 8%, optional log10
// x-axis (values <= 0 clamp to the domain minimum), y inverted for screen coords.

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

const paddedDomain = (values: number[]): [number, number] => {
  const lo = Math.min(...values)
  const hi = Math.max(...values)
  const span = hi - lo || Math.abs(hi) || 1
  return [lo - span * PAD, hi + span * PAD]
}

const linear = ([d0, d1]: readonly [number, number], [r0, r1]: readonly [number, number]) =>
  (v: number) => r0 + ((v - d0) / (d1 - d0)) * (r1 - r0)

export function makeScales(pts: ScatterPt[], { w, h, logX }: ScaleOpts): Scales {
  const xs = pts.map((p) => p.x)
  const xd = paddedDomain(xs)
  // under log10 the domain floor must be positive; clamp nonpositives to it
  const floor = logX && xd[0] <= 0
    ? Math.min(...xs.filter((v) => v > 0), Infinity) || 1e-6
    : xd[0]
  const xDomain: [number, number] = [floor, xd[1]]
  const tx = logX ? (v: number) => Math.log10(Math.max(v, floor)) : (v: number) => v
  const yd = paddedDomain(pts.map((p) => p.y))
  const sxRaw = linear([tx(xDomain[0]), tx(xDomain[1])], [0, w])
  const sy = linear(yd, [h, 0])
  return { sx: (v: number) => sxRaw(tx(v)), sy, xDomain, yDomain: yd }
}

export function projectPoint(p: ScatterPt, s: Scales): { cx: number; cy: number } {
  return { cx: s.sx(p.x), cy: s.sy(p.y) }
}
