import Link from 'next/link'
import { notFound } from 'next/navigation'

import ReactMarkdown from 'react-markdown'

import MetricTable, {
  type CitationSummary,
  type MetricRow,
} from '@/components/pathway/metric-table'
import ShortlistActions from '@/components/pathway/shortlist-actions'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { openDb } from '@/lib/db/instance'
import { getCitation, getMaterial, getPathway, listShortlist } from '@/lib/db/repos'
import { MaterialClass, type Material } from '@/lib/gen/carbon/v1/material_pb'
import { Setting } from '@/lib/gen/carbon/v1/pathway_pb'
import { ShortlistStatus } from '@/lib/gen/carbon/v1/research_pb'
import { SETTING_COLORS, SETTING_LABELS } from '@/lib/settings'

const MATERIAL_CLASS_LABELS: Record<string, string> = {
  AMINE_SORBENT: 'Amine sorbent',
  MOF: 'MOF',
  LIQUID_SOLVENT: 'Liquid solvent',
  ENZYME: 'Enzyme',
  ELECTRODE_MATERIAL: 'Electrode material',
  MINERAL: 'Mineral',
  OTHER: 'Other',
}

const decodeBack = (raw: string): string => {
  try {
    return decodeURIComponent(raw)
  } catch {
    return raw
  }
}

export default async function PathwayDetail(props: PageProps<'/pathways/[id]'>) {
  const { id } = await props.params
  const sp = await props.searchParams
  const backRaw = typeof sp.back === 'string' ? sp.back : undefined

  const db = openDb()
  const pathway = getPathway(db, id)
  if (!pathway) notFound()

  // citations referenced by the pathway itself AND by each metric's source_ref
  const citationsById: Record<string, CitationSummary> = {}
  for (const ref of [...pathway.sourceRefs, ...Object.values(pathway.metrics).map((m) => m.sourceRef)]) {
    if (!ref || citationsById[ref]) continue
    const c = getCitation(db, ref)
    if (c) {
      citationsById[ref] = {
        id: c.id,
        title: c.title,
        authors: [...c.authors],
        year: c.year,
        venue: c.venue,
        url: c.url,
      }
    }
  }

  // plain-object copies of proto messages before handing to components
  const metrics: Record<string, MetricRow> = Object.fromEntries(
    Object.entries(pathway.metrics).map(([key, m]) => [
      key,
      { low: m.low, high: m.high, unit: m.unit, yearBasis: m.yearBasis, sourceRef: m.sourceRef },
    ]),
  )

  // keep dangling ids visible as links even when the material row is absent
  const materials: { id: string; material: Material | undefined }[] = pathway.materialIds.map((mid) => ({
    id: mid,
    material: getMaterial(db, mid),
  }))

  // plain-object shortlist entry (enum name, not hydrated number) for the client action bar
  const shortlistEntry = listShortlist(db).find((s) => s.entry.pathwayId === id)
  const shortlist = shortlistEntry
    ? {
        status: ShortlistStatus[shortlistEntry.entry.status] ?? '',
        rationale: shortlistEntry.entry.rationale,
        updatedAt: shortlistEntry.entry.updatedAt,
      }
    : null

  const settingName = Setting[pathway.setting] ?? 'SETTING_UNSPECIFIED'
  const backHref = backRaw ? `/?${decodeBack(backRaw)}` : undefined

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

      <Card>
        <CardHeader>
          <CardTitle>Mechanism</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-sm leading-relaxed [&_p+p]:mt-3 [&_li]:mt-1 [&_ul]:list-disc [&_ul]:pl-5">
            <ReactMarkdown>{pathway.mechanism}</ReactMarkdown>
          </div>
        </CardContent>
      </Card>

      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-semibold tracking-tight">Cited metrics</h2>
        <MetricTable metrics={metrics} citationsById={citationsById} />
      </section>

      {materials.length > 0 && (
        <section className="flex flex-col gap-2">
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
                      {m ? MATERIAL_CLASS_LABELS[MaterialClass[m.class]] ?? mid : 'Material page coming soon'}
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

      {/* Task 10 mounts the literature panel here (cached OpenLibrary works for pathway.searchTerms) */}
    </div>
  )
}
