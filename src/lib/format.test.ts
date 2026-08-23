import { describe, it, expect } from 'vitest'
import { formatRange, mid, axisLabel } from './format'

describe('format', () => {
  it('formats ranges with units and year basis', () => {
    expect(formatRange({ low: 80, high: 600, unit: 'USD/tCO2', year_basis: 2022 }))
      .toBe('$80–$600 /tCO2')
    expect(formatRange({ low: 3.5, high: 4.2, unit: 'GJ/tCO2', year_basis: 2022 }))
      .toBe('3.5–4.2 GJ/tCO2')
  })
  it('midpoint math', () => expect(mid({ low: 80, high: 600 } as never)).toBe(340))
  it('axis labels', () => {
    expect(axisLabel('cost')).toMatch(/Cost/i)
    expect(axisLabel('energy_total')).toMatch(/Energy/i)
    expect(axisLabel('trl')).toMatch(/TRL/i)
  })
})
