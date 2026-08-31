import Link from 'next/link'
import { notFound } from 'next/navigation'

import ReactMarkdown from 'react-markdown'

import { CitationList } from '@/components/citation/citation-badge'
import type {
  MaterialSummaryDto,
  MetricRowDto,
  SourceSummaryDto,
} from '@/components/graph/graph-types'
import LiteratureErrorBoundary from '@/components/pathway/literature-error-boundary'
import LiteraturePanel from '@/components/pathway/literature-panel'
import MetricTable, {
  type CitationSummary,
  type MetricRow,
} from '@/components/pathway/metric-table'
import PathwayDiagrams from '@/components/pathway/pathway-diagrams'
import ShortlistActions from '@/components/pathway/shortlist-actions'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { getCitation, getMaterial, getPathway, listShortlist } from '@/lib/db/repos'
import { type Material } from '@/lib/gen/carbon/v1/material_pb'
import { Setting } from '@/lib/gen/carbon/v1/pathway_pb'
import { ShortlistStatus } from '@/lib/gen/carbon/v1/research_pb'
import { buildProcessDto, type ProcessLookups } from '@/lib/graph/process'
import type { DetailViewState } from '@/lib/graph/view-selection'
import { SETTING_COLORS, SETTING_LABELS } from '@/lib/settings'
import { materialClassLabel } from '@/lib/material-class'

const decodeBack = (raw: string): string => {
  try {
    return decodeURIComponent(raw)
  } catch {
    return raw
  }
}

const toCitationSummary = (c: {
  id: string
  title: string
  authors: string[]
  year: number
  venue: string
  url: string
}): SourceSummaryDto => ({
  id: c.id,
  title: c.title,
  authors: [...c.authors],
  year: c.year,
  venue: c.venue,
  url: c.url,
})

export default async function PathwayDetail(props: PageProps<'/pathways/[id]'>) {
  const { id } = await props.params
  const sp = await props.searchParams
  const backRaw = typeof sp.back === 'string' ? sp.back : undefined

  const pathway = await getPathway(id)
  if (!pathway) notFound()

  // Split citations into "pathway-level" refs (declared on the pathway itself)
  // and "metric-level" refs (each metric's source_ref). Both render in different
  // places on the detail page — pathway-level refs are aggregated here, metric-
  // level refs show inline in the MetricTable. The graph documents additionally
  // surface node/edge source refs into the inspector, so those must resolve too.
  const pathwayLevelRefIds = pathway.sourceRefs.filter(Boolean)
  const metricLevelRefIds = Object.values(pathway.metrics)
    .map((m) => m.sourceRef)
    .filter(Boolean)

  const graphSourceRefs: string[] = []
  const graphMaterialIds: string[] = []
  for (const g of [pathway.processGraph, pathway.operationalGraph]) {
    if (!g) continue
    for (const n of g.nodes) {
      graphMaterialIds.push(...n.materialIds)
      graphSourceRefs.push(...n.sourceRefs)
    }
    for (const e of g.edges) graphSourceRefs.push(...e.sourceRefs)
  }

  const allRefIds = [...new Set([...pathwayLevelRefIds, ...metricLevelRefIds, ...graphSourceRefs])]
  const allMaterialIds = [...new Set([...pathway.materialIds, ...graphMaterialIds])]

  const citationsById: Record<string, CitationSummary> = {}
  const citationRows = await Promise.all(allRefIds.map((ref) => getCitation(ref)))
  for (const c of citationRows) {
    if (!c) continue
    citationsById[c.id] = {
      id: c.id,
      title: c.title,
      authors: [...c.authors],
      year: c.year,
      venue: c.venue,
      url: c.url,
    }
  }

  // plain-object copies of proto messages before handing to components
  const metrics: Record<string, MetricRow> = Object.fromEntries(
    Object.entries(pathway.metrics).map(([key, m]) => [
      key,
      { low: m.low, high: m.high, unit: m.unit, yearBasis: m.yearBasis, sourceRef: m.sourceRef },
    ]),
  )

  // keep dangling ids visible as links even when the material row is absent.
  // graph lookups run in parallel so the biggest materials on the page don't
  // serialize behind citation resolution.
  const [materialsById, shortlistEntry] = await Promise.all([
    Promise.all(allMaterialIds.map((mid) => getMaterial(mid))).then((rows) => {
      const byId: Record<string, Material | undefined> = {}
      allMaterialIds.forEach((mid, i) => {
        byId[mid] = rows[i]
      })
      return byId
    }),
    listShortlist().then((rows) => rows.find((s) => s.entry.pathwayId === id)),
  ])
  const materials = pathway.materialIds.map((mid) => ({ id: mid, material: materialsById[mid] }))

  const shortlist = shortlistEntry
    ? {
        status: ShortlistStatus[shortlistEntry.entry.status] ?? '',
        rationale: shortlistEntry.entry.rationale,
        updatedAt: shortlistEntry.entry.updatedAt,
      }
    : null

  const settingName = Setting[pathway.setting] ?? 'SETTING_UNSPECIFIED'
  const backHref = backRaw ? `/?${decodeBack(backRaw)}` : undefined

  // Inspector lookups resolved server-side — the client graph surface never
  // re-fetches materials, sources, or metrics per node.
  const materialSummaries: Record<string, MaterialSummaryDto> = {}
  for (const mid of allMaterialIds) {
    const m = materialsById[mid]
    if (m) materialSummaries[mid] = { id: m.id, name: m.name, summary: m.summary || undefined }
  }
  const sourceSummaries: Record<string, SourceSummaryDto> = {}
  for (const c of Object.values(citationsById)) sourceSummaries[c.id] = toCitationSummary(c)
  const pathwayMetrics: Record<string, MetricRowDto> = {}
  for (const [key, m] of Object.entries(pathway.metrics)) {
    pathwayMetrics[key] = {
      key,
      low: m.low,
      high: m.high,
      unit: m.unit,
      yearBasis: m.yearBasis,
      sourceRef: m.sourceRef,
    }
  }
  if (pathway.trl > 0 && !pathwayMetrics.trl) {
    pathwayMetrics.trl = { key: 'trl', low: pathway.trl, high: pathway.trl, unit: 'years', yearBasis: 0, sourceRef: '' }
  }
  const lookups: ProcessLookups = { materialSummaries, sourceSummaries, pathwayMetrics }

  const viewState: DetailViewState = {
    process: pathway.processGraph
      ? { status: 'valid', dto: buildProcessDto(pathway.processGraph, lookups, { kind: 'process' }) }
      : { status: 'missing' },
    operational: pathway.operationalGraph
      ? { status: 'valid', dto: buildProcessDto(pathway.operationalGraph, lookups, { kind: 'operational' }) }
      : { status: 'missing' },
    flowSource: pathway.mermaidSource || '',
    sequenceSource: pathway.mermaidSequenceSource || '',
  }

  const hasAnyDiagram =
    !!pathway.processGraph || !!pathway.operationalGraph || !!viewState.flowSource || !!viewState.sequenceSource

  return (
    <div className="flex min-h-screen flex-col gap-6 p-8">
      {backHref && (
        <Link
          href={backHref}
          data-testid="back-to-landscape"
          className="-mb-3 w-fit text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
        >
          ← Landscape
        </Link>
      )}

      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">{pathway.name}</h1>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline" className="gap-1.5">
            <span
              className="size-2 rounded-full"
              style={{ backgroundColor: SETTING_COLORS[settingName] ?? '#a1a1aa' }}
            />
            {SETTING_LABELS[settingName] ?? settingName}
          </Badge>
          <Badge variant="secondary">{`TRL ${pathway.trl}`}</Badge>
          {pathway.isBenchmark && (
            <Badge data-testid="benchmark-badge">Benchmark</Badge>
          )}
        </div>
        <ShortlistActions pathwayId={pathway.id} entry={shortlist} />
      </header>

      <Card id="mechanism">
        <CardHeader>
          <CardTitle>Mechanism</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-sm leading-relaxed [&_p+p]:mt-3 [&_li]:mt-1 [&_ul]:list-disc [&_ul]:pl-5">
            <ReactMarkdown>{pathway.mechanism}</ReactMarkdown>
          </div>
        </CardContent>
      </Card>

      {hasAnyDiagram && (
        <PathwayDiagrams viewState={viewState} pathwayId={pathway.id} />
      )}

      <section id="metrics" className="flex flex-col gap-2">
        <h2 className="text-lg font-semibold tracking-tight">Cited metrics</h2>
        <MetricTable metrics={metrics} citationsById={citationsById} />
      </section>

      {materials.length > 0 && (
        <section id="materials" className="flex flex-col gap-2">
          <h2 className="text-lg font-semibold tracking-tight">Materials</h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {materials.map(({ id: mid, material: m }) => (
              <Link key={mid} href={`/materials/${mid}`} data-testid="material-link" className="group">
                <Card size="sm" className="transition-colors group-hover:bg-muted/40">
                  <CardContent className="flex flex-col gap-1">
                    <span className="font-medium underline-offset-4 group-hover:underline">
                      {m?.name || mid}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {m ? materialClassLabel(m) : 'Material page coming soon'}
                    </span>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        </section>
      )}

      {(pathway.advantages.length > 0 || pathway.challenges.length > 0) && (
        <div className="grid gap-4 md:grid-cols-2">
          {pathway.advantages.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Advantages</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="list-disc space-y-1.5 pl-5 text-sm leading-relaxed">
                  {pathway.advantages.map((item, i) => (
                    <li key={i}>{item}</li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}
          {pathway.challenges.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Challenges</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="list-disc space-y-1.5 pl-5 text-sm leading-relaxed">
                  {pathway.challenges.map((item, i) => (
                    <li key={i}>{item}</li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {pathwayLevelRefIds.length > 0 && (
        <Card id="references" data-testid="pathway-references">
          <CardHeader>
            <CardTitle>References</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3 text-sm">
            <p className="text-muted-foreground">
              Curated sources for this pathway:
            </p>
            <ul className="flex flex-col gap-2">
              {pathwayLevelRefIds.map((id) => {
                const c = citationsById[id]
                if (!c) return null
                return (
                  <li key={id} className="flex flex-col gap-0.5">
                    <a
                      href={c.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-medium underline-offset-4 hover:underline"
                    >
                      {c.title}
                    </a>
                    <span className="text-xs text-muted-foreground">
                      <CitationList citations={[c]} />
                      {' · '}
                      {c.venue}
                    </span>
                  </li>
                )
              })}
            </ul>
          </CardContent>
        </Card>
      )}

      <section id="literature" className="flex flex-col gap-2">
        <LiteratureErrorBoundary>
          <LiteraturePanel pathwayId={pathway.id} />
        </LiteratureErrorBoundary>
      </section>
    </div>
  )
}