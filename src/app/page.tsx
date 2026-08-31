import LandscapeGraph from '@/components/landscape/landscape-graph'
import LandscapeFilters from '@/components/landscape/landscape-filters'
import type { ListRow } from '@/components/landscape/pathway-list'
import type { PlotPoint } from '@/components/landscape/scatter-plot'
import { getCitation, getLandscapeGraph, getMaterial, listPathways } from '@/lib/db/repos'
import { AXIS_KEYS, mid, type Range } from '@/lib/format'
import type { MaterialSummaryDto, MetricRowDto, SourceSummaryDto } from '@/components/graph/graph-types'
import type { GraphLoadState } from '@/lib/graph/view-selection'
import type { Citation } from '@/lib/gen/carbon/v1/common_pb'
import type { Material } from '@/lib/gen/carbon/v1/material_pb'
import { Setting, type Pathway } from '@/lib/gen/carbon/v1/pathway_pb'
import { buildLandscapeDto, type LandscapeLookups } from '@/lib/landscape/graph'
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

// Matching the adapter's plot area so the graph DTO uses the same aspect as the
// scatter fallback.
const LANDSCAPE_W = 800
const LANDSCAPE_H = 420

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

  // Thread the SAME filtered set into both the scatter fallback (points + rows)
  // and the landscape DTO so graph and fallback always agree on the filters.
  const [allPathways, landscapeGraph] = await Promise.all([listPathways(), getLandscapeGraph()])
  const filtered = allPathways
    .filter((p) => p.trl >= minTrl)
    .filter((p) => !benchmarkOnly || p.isBenchmark)
    .filter((p) => settingsFilter.length === 0 || settingsFilter.includes(settingName(p)))

  // One server-side DTO preparation step: resolve every material summary and
  // citation source referenced by the filtered pathways (plus the landscape
  // graph's material context nodes, so hidden endpoints stay resolvable) and
  // the metric ranges each pathway node carries in its inspector.
  const refIdSet = new Set<string>()
  const materialIdSet = new Set<string>()
  for (const p of filtered) {
    for (const ref of p.sourceRefs) if (ref) refIdSet.add(ref)
    for (const m of Object.values(p.metrics)) if (m.sourceRef) refIdSet.add(m.sourceRef)
    for (const mid of p.materialIds) if (mid) materialIdSet.add(mid)
  }
  for (const node of landscapeGraph?.nodes ?? []) {
    const split = node.id.split(':')
    if (split[0] === 'material' && split[1]) materialIdSet.add(split[1])
    for (const ref of node.sourceRefs) if (ref) refIdSet.add(ref)
  }

  const [citationRows, materialRows] = await Promise.all([
    Promise.all([...refIdSet].map((id) => getCitation(id))),
    Promise.all([...materialIdSet].map((id) => getMaterial(id))),
  ])
  const citationsById = new Map<string, Citation>()
  for (const c of citationRows) if (c) citationsById.set(c.id, c)
  const materialsById = new Map<string, Material>()
  for (const m of materialRows) if (m) materialsById.set(m.id, m)

  const toSourceSummary = (c: Citation): SourceSummaryDto => ({
    id: c.id,
    title: c.title,
    authors: [...c.authors],
    year: c.year,
    venue: c.venue,
    url: c.url,
  })

  const materialSummaries: Record<string, MaterialSummaryDto> = {}
  for (const [id, m] of materialsById) {
    materialSummaries[id] = { id: m.id, name: m.name, summary: m.summary || undefined }
  }
  const sourceSummaries: Record<string, SourceSummaryDto> = {}
  for (const c of citationsById.values()) sourceSummaries[c.id] = toSourceSummary(c)

  const pathwayMetrics: Record<string, MetricRowDto[]> = {}
  for (const p of filtered) {
    const rows: MetricRowDto[] = []
    for (const [key, m] of Object.entries(p.metrics)) {
      rows.push({ key, low: m.low, high: m.high, unit: m.unit, yearBasis: m.yearBasis, sourceRef: m.sourceRef })
    }
    if (p.trl > 0 && !p.metrics.trl) {
      rows.push({ key: 'trl', low: p.trl, high: p.trl, unit: 'years', yearBasis: 0, sourceRef: '' })
    }
    pathwayMetrics[p.id] = rows
  }
  const lookups: LandscapeLookups = { materialSummaries, sourceSummaries, pathwayMetrics }

  // Axis values for both the scatter fallback and the graph adapter.
  const metricValues = new Map<string, { x: number | undefined; y: number | undefined }>()
  for (const p of filtered) {
    metricValues.set(p.id, { x: valueOf(p, xKey), y: valueOf(p, yKey) })
  }

  const missingX: Pathway[] = []
  const missingY: Pathway[] = []
  const points: PlotPoint[] = []
  for (const p of filtered) {
    const { x: xv, y: yv } = metricValues.get(p.id)!
    if (xv === undefined) { missingX.push(p); continue }
    if (yv === undefined) { missingY.push(p); continue }
    points.push({
      id: p.id,
      name: p.name,
      setting: settingName(p),
      isBenchmark: p.isBenchmark,
      x: xv!,
      y: yv!,
      xRange: rangeOf(p, xKey),
      yRange: rangeOf(p, yKey),
    })
  }

  const rows: ListRow[] = filtered.map((p) => {
    const refIds = new Set<string>()
    for (const ref of p.sourceRefs) if (ref) refIds.add(ref)
    for (const m of Object.values(p.metrics)) if (m.sourceRef) refIds.add(m.sourceRef)
    const sources = [...refIds]
      .map((id) => citationsById.get(id))
      .filter((c): c is Citation => !!c)
    return {
      id: p.id,
      name: p.name,
      setting: settingName(p),
      trl: p.trl,
      isBenchmark: p.isBenchmark,
      costRange: rangeOf(p, 'cost'),
      sources,
    }
  })

  const dto = landscapeGraph
    ? buildLandscapeDto(
        landscapeGraph,
        filtered,
        Object.fromEntries(metricValues),
        { xKey, yKey, logX, w: LANDSCAPE_W, h: LANDSCAPE_H },
        lookups,
      )
    : undefined
  const viewState: GraphLoadState = dto ? { status: 'valid', dto } : { status: 'missing' }

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
      <LandscapeGraph
        viewState={viewState}
        points={points}
        xKey={xKey}
        yKey={yKey}
        logX={logX}
        search={search}
        rows={rows}
        ids={idsParam}
        missingXCount={missingX.length}
        missingYCount={missingY.length}
      />
    </div>
  )
}