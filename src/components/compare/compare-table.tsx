'use client'

import Link from 'next/link'

import { AXIS_KEYS, axisLabel, formatRange } from '@/lib/format'
import { SETTING_COLORS, SETTING_LABELS } from '@/lib/settings'

export interface CompareMetric {
  low: number
  high: number
  unit: string
  year_basis?: number
}

export interface CompareRow {
  id: string
  name: string
  settingName: string
  trl: number
  isBenchmark: boolean
  metrics: Record<string, CompareMetric>
}

interface Props {
  rows: CompareRow[]
}

// known plot axes in canonical order first, then any extras alphabetically
const metricKeys = (rows: CompareRow[]): string[] => {
  const keys = new Set<string>()
  for (const r of rows) for (const key of Object.keys(r.metrics)) keys.add(key)
  const all = [...keys]
  const known = all.filter((k) => (AXIS_KEYS as readonly string[]).includes(k))
  const extra = all.filter((k) => !(AXIS_KEYS as readonly string[]).includes(k)).sort()
  known.sort((a, b) => (AXIS_KEYS as readonly string[]).indexOf(a) - (AXIS_KEYS as readonly string[]).indexOf(b))
  return [...known, ...extra]
}

// horizontal bar position within the row's shared low..high span
const barStyle = (m: CompareMetric, min: number, max: number): { left: string; width: string } => {
  const span = max - min
  if (span <= 0) return { left: '0%', width: '100%' }
  return {
    left: `${Math.min(100, Math.max(0, ((m.low - min) / span) * 100))}%`,
    width: `${Math.max(((m.high - m.low) / span) * 100, 2)}%`,
  }
}

export default function CompareTable({ rows }: Props) {
  if (rows.length === 0) {
    return (
      <p data-testid="compare-empty" className="rounded-lg border px-3 py-8 text-center text-sm text-muted-foreground">
        No pathways selected — pick some from the Landscape list.
      </p>
    )
  }

  const keys = metricKeys(rows)

  return (
    <div className="overflow-x-auto rounded-lg border">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b bg-muted/50 text-left text-xs text-muted-foreground">
            <th className="w-[22%] px-3 py-2 font-medium">Metric</th>
            {rows.map((r) => (
              <th key={r.id} data-testid={`col-${r.id}`} className="px-3 py-2 font-medium">
                <Link href={`/pathways/${r.id}`} className="underline-offset-4 hover:text-foreground hover:underline">
                  {r.name}
                  {r.isBenchmark && (
                    <span title="Benchmark" className="ml-1.5 text-xs">
                      ★
                    </span>
                  )}
                </Link>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          <tr data-testid="setting-row" className="border-b">
            <th scope="row" className="px-3 py-2 text-left font-medium">Setting</th>
            {rows.map((r) => (
              <td key={r.id} className="px-3 py-2">
                <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
                  <span
                    className="size-2 shrink-0 rounded-full"
                    style={{ backgroundColor: SETTING_COLORS[r.settingName] ?? '#a1a1aa' }}
                  />
                  {SETTING_LABELS[r.settingName] ?? r.settingName}
                </span>
              </td>
            ))}
          </tr>
          <tr data-testid="trl-row" className="border-b">
            <th scope="row" className="px-3 py-2 text-left font-medium">{axisLabel('trl')}</th>
            {rows.map((r) => (
              <td key={r.id} className="px-3 py-2 tabular-nums">{r.trl}</td>
            ))}
          </tr>
          {keys.map((key) => {
            const present = rows.map((r) => r.metrics[key]).filter(Boolean)
            const rowMin = Math.min(...present.map((m) => m.low))
            const rowMax = Math.max(...present.map((m) => m.high))
            return (
              <tr key={key} data-testid="metric-row" data-metric={key} className="border-b last:border-b-0 align-top">
                <th scope="row" className="px-3 py-2 text-left font-medium">{axisLabel(key)}</th>
                {rows.map((r) => {
                  const m = r.metrics[key]
                  return (
                    <td key={r.id} className="px-3 py-2">
                      {m ? (
                        <>
                          <span className="block tabular-nums">{formatRange(m)}</span>
                          <span
                            data-testid="metric-bar"
                            className="relative mt-1 block h-1.5 w-40 max-w-full overflow-hidden rounded-full bg-muted"
                          >
                            <span
                              className="absolute inset-y-0 rounded-full bg-primary"
                              style={barStyle(m, rowMin, rowMax)}
                            />
                          </span>
                        </>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                  )
                })}
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
