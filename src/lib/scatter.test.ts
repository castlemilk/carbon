import { describe, it, expect } from 'vitest'
import { axisTicks, projectPoint, makeScales } from '@/lib/scatter'

const onCanvas = (v: number, max: number) => Number.isFinite(v) && v >= 0 && v <= max

describe('scatter projection', () => {
  const pts = [
    { id: 'a', x: 100, y: 5 }, { id: 'b', x: 900, y: 9 }, { id: 'c', x: 40, y: 1 },
  ]
  it('linear scales map to padded viewport', () => {
    const s = makeScales(pts, { w: 800, h: 400, logX: false })
    const p = projectPoint(pts[0], s)
    expect(p.cx).toBeGreaterThan(0); expect(p.cy).toBeLessThan(400)
    expect(p.cx).toBeLessThan(projectPoint(pts[1], s).cx) // higher cost -> right
    expect(p.cy).toBeLessThan(projectPoint(pts[2], s).cy) // higher TRL -> up
  })
  it('log scales keep positive domain monotonic', () => {
    const s = makeScales(pts, { w: 800, h: 400, logX: true })
    expect(projectPoint(pts[0], s).cx).toBeLessThan(projectPoint(pts[1], s).cx)
  })
  it('log scales pad in log space so edge dots are not pinned to the axis', () => {
    const edge = pts.find((p) => p.x === 40)!
    const s = makeScales(pts, { w: 800, h: 400, logX: true })
    expect(projectPoint(edge, s).cx).toBeGreaterThan(0)
  })
  it('all-nonpositive xs under logX stay finite and on-canvas', () => {
    const bad = [{ id: 'a', x: -5, y: 1 }, { id: 'b', x: -1, y: 3 }]
    const s = makeScales(bad, { w: 800, h: 400, logX: true })
    for (const p of bad) {
      const { cx, cy } = projectPoint(p, s)
      expect(onCanvas(cx, 800)).toBe(true)
      expect(onCanvas(cy, 400)).toBe(true)
    }
  })
  it('single-point domains project without NaN (linear and log)', () => {
    for (const logX of [false, true]) {
      const only = [{ id: 'a', x: 5, y: 5 }]
      const s = makeScales(only, { w: 800, h: 400, logX })
      const { cx, cy } = projectPoint(only[0], s)
      expect(onCanvas(cx, 800)).toBe(true)
      expect(onCanvas(cy, 400)).toBe(true)
    }
  })
})

describe('axisTicks', () => {
  it('emits decade ticks across a log domain', () => {
    expect(axisTicks([31, 1154], { log: true })).toEqual([100, 1000])
  })
  it('falls back to even ticks below one decade of log span', () => {
    expect(axisTicks([4, 9], { log: true })).toHaveLength(5)
  })
  it('snaps to integers spanning the domain when integral', () => {
    expect(axisTicks([0.12, 9.88], { integral: true })).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9])
  })
})
