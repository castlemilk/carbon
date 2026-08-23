export interface Range { low: number; high: number; unit: string; year_basis?: number }

export const mid = (r: { low: number; high: number }) => (r.low + r.high) / 2

const money = (u: string) => u.startsWith('USD')
export function formatRange(r: Range): string {
  const f = (n: number) => n >= 100 ? Math.round(n).toString() : n.toString()
  if (money(r.unit)) return `$${f(r.low)}–$${f(r.high)} ${r.unit.slice(3)}`
  return `${f(r.low)}–${f(r.high)} ${r.unit}`
}

export const AXIS_KEYS = ['cost', 'energy_thermal', 'energy_electric', 'energy_total',
  'capacity_potential', 'permanence'] as const
export type AxisKey = (typeof AXIS_KEYS)[number] | 'trl'
const axisLabels: Record<string, string> = {
  cost: 'Cost ($/tCO₂)', energy_thermal: 'Thermal energy (GJ/tCO₂)',
  energy_electric: 'Electric energy (GJ-e/tCO₂)', energy_total: 'Total energy (GJ/tCO₂)',
  capacity_potential: 'Capacity potential (Gt/yr)', permanence: 'Permanence (years)', trl: 'TRL',
}
export const axisLabel = (key: string): string => axisLabels[key] ?? key
