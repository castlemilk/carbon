import ScatterPlot, { type PlotPoint } from '@/components/landscape/scatter-plot'
import LandscapeFilters from '@/components/landscape/landscape-filters'
import PathwayList, { type ListRow } from '@/components/landscape/pathway-list'
import { openDb } from '@/lib/db/instance'
import { listPathways } from '@/lib/db/repos'
import { AXIS_KEYS, axisLabel, mid, type Range } from '@/lib/format'
import { Setting, type Pathway } from '@/lib/gen/carbon/v1/pathway_pb'
import { SETTING_ORDER } from '@/lib/settings'

export const metadata = { title: 'Landscape' }

type SearchParams = Record<string, string | string[] | undefined>

const first = (sp: SearchParams, key: string): string | undefined => {
  const v = sp[key]
  return Array.isArray(v) ? v[0] : v
}

const parseAxis = (raw: string | undefined, fallback: 'cost' | 'trl'): string => {
  const v = raw ?? fallback
  return (AXIS_KEYS as readonly string[]).includes(v) || v === 'trl' ? v : fallback
}

const rangeOf = (p: Pathway, metric: string): Range | undefined => {
  if (metric === 'trl') return undefined
  const m = p.metrics[metric]
  return m ? { low: m.low, high: m.high, unit: m.unit, year_basis: m.yearBasis } : undefined
}

const valueOf = (p: Pathway, axis: string): number | undefined => {
  if (axis === 'trl') return p.trl
  const r = p.metrics[axis]
  return r ? mid(r) : undefined
}

export default async function Home({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams

  const xKey = parseAxis(first(sp, 'x'), 'cost')
  const yKey = parseAxis(first(sp, 'y'), 'trl')
  const logX = first(sp, 'logX') === '1'
  const minTrlRaw = Number(first(sp, 'minTrl'))
  const minTrl = Number.isInteger(minTrlRaw) && minTrlRaw >= 0 && minTrlRaw <= 9 ? minTrlRaw : 0
  const benchmarkOnly = first(sp, 'benchmark') === '1'
  const settingsFilter = (first(sp, 'settings') ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter((s): s is string => (SETTING_ORDER as readonly string[]).includes(s))
  const idsParam = (first(sp, 'ids') ?? '').split(',').map((s) => s.trim()).filter(Boolean)

  // canonical query string: drop defaults, keep explicit filters + passthrough (ids)
  const q = new URLSearchParams()
  if (settingsFilter.length > 0 && settingsFilter.length < SETTING_ORDER.length) q.set('settings', settingsFilter.join(','))
  if (minTrl > 0) q.set('minTrl', String(minTrl))
  if (benchmarkOnly) q.set('benchmark', '1')
  if (xKey !== 'cost') q.set('x', xKey)
  if (yKey !== 'trl') q.set('y', yKey)
  if (logX) q.set('logX', '1')
  if (idsParam.length > 0) q.set('ids', idsParam.join(','))
  const search = q.toString()

  const settingName = (p: Pathway) => Setting[p.setting] ?? 'SETTING_UNSPECIFIED'
  const filtered = listPathways(openDb())
    .filter((p) => p.trl >= minTrl)
    .filter((p) => !benchmarkOnly || p.isBenchmark)
    .filter((p) => settingsFilter.length === 0 || settingsFilter.includes(settingName(p)))

  const missingX: Pathway[] = []
  const missingY: Pathway[] = []
  const points: PlotPoint[] = []
  for (const p of filtered) {
    const xv = valueOf(p, xKey)
    const yv = valueOf(p, yKey)
    if (xv === undefined) { missingX.push(p); continue }
    if (yv === undefined) { missingY.push(p); continue }
    points.push({
      id: p.id,
      name: p.name,
      setting: settingName(p),
      isBenchmark: p.isBenchmark,
      x: xv,
      y: yv,
      xRange: rangeOf(p, xKey),
      yRange: rangeOf(p, yKey),
    })
  }

  const rows: ListRow[] = filtered.map((p) => ({
    id: p.id,
    name: p.name,
    setting: settingName(p),
    trl: p.trl,
    isBenchmark: p.isBenchmark,
    costRange: rangeOf(p, 'cost'),
  }))

  const note = (paths: Pathway[], axis: string) =>
    paths.length > 0 && (
      <p data-testid={`missing-${axis}`} className="text-sm text-muted-foreground">
        {paths.length} pathway{paths.length === 1 ? '' : 's'} lack{paths.length === 1 ? 's' : ''} {axisLabel(axis)} data
        — excluded from the plot.
      </p>
    )

  return (
    <div className="flex min-h-screen flex-col gap-6 p-8">
      <h1 className="text-2xl font-semibold tracking-tight">Landscape</h1>
      <LandscapeFilters
        search={search}
        xKey={xKey}
        yKey={yKey}
        logX={logX}
        settings={settingsFilter}
        minTrl={minTrl}
        benchmarkOnly={benchmarkOnly}
      />
      <section>
        <ScatterPlot points={points} xKey={xKey} yKey={yKey} logX={logX} search={search} />
        {note(missingX, xKey)}
        {yKey !== xKey && note(missingY, yKey)}
      </section>
      <section>
        <h2 className="mb-2 text-sm font-medium text-muted-foreground">All pathways ({rows.length})</h2>
        <PathwayList rows={rows} search={search} ids={idsParam} />
      </section>
    </div>
  )
}
