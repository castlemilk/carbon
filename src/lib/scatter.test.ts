import { describe, it, expect } from 'vitest'
import { projectPoint, makeScales } from '@/lib/scatter'

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
})
