import Link from 'next/link'
import { notFound } from 'next/navigation'

import ReactMarkdown from 'react-markdown'

import StructureErrorBoundary from '@/components/materials/structure-error-boundary'
import StructureLinks from '@/components/materials/structure-links'
import StructureViewer from '@/components/materials/structure-viewer'
import MetricTable, {
  titleCaseKey,
  type CitationSummary,
  type MetricRow,
} from '@/components/pathway/metric-table'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { openDb } from '@/lib/db/instance'
import { getCitation, getMaterial, listPathways } from '@/lib/db/repos'
import { materialClassLabel } from '@/lib/material-class'

export default async function MaterialDetail(props: PageProps<'/materials/[id]'>) {
  const { id } = await props.params

  const db = openDb()
  const material = getMaterial(db, id)
  if (!material) notFound()

  // citations referenced by each property's source_ref
  const citationsById: Record<string, CitationSummary> = {}
  for (const ref of Object.values(material.properties).map((p) => p.sourceRef)) {
    if (!ref || citationsById[ref]) continue
    const c = getCitation(db, ref)
    if (c) {
      citationsById[ref] = { id: c.id, title: c.title, authors: [...c.authors], year: c.year, venue: c.venue, url: c.url }
    }
  }

  const properties: Record<string, MetricRow> = Object.fromEntries(
    Object.entries(material.properties).map(([key, p]) => [
      key,
      { low: p.low, high: p.high, unit: p.unit, yearBasis: p.yearBasis, sourceRef: p.sourceRef },
    ]),
  )

  const usedBy = listPathways(db)
    .filter((p) => p.materialIds.includes(id))

  const uniprot = material.uniprotId.trim()
  const pdbIds = material.pdbIdsCsv
    .split(',')
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean)
  const hasStructure = Boolean(uniprot) || pdbIds.length > 0

  return (
    <div className="flex min-h-screen flex-col gap-6 p-8">
      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">{material.name}</h1>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline">{materialClassLabel(material)}</Badge>
        </div>
      </header>

      {material.summary && (
        <Card>
          <CardHeader>
            <CardTitle>Summary</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-sm leading-relaxed [&_p+p]:mt-3 [&_li]:mt-1 [&_ul]:list-disc [&_ul]:pl-5">
              <ReactMarkdown>{material.summary}</ReactMarkdown>
            </div>
          </CardContent>
        </Card>
      )}

      {Object.keys(properties).length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="text-lg font-semibold tracking-tight">Properties</h2>
          <MetricTable
            metrics={properties}
            citationsById={citationsById}
            keyLabel="Property"
            humanizeKey={titleCaseKey}
            emptyMessage="No properties recorded for this material."
          />
        </section>
      )}

      {usedBy.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="text-lg font-semibold tracking-tight">Used by pathways</h2>
          <div className="flex flex-wrap gap-2">
            {usedBy.map((p) => (
              <Link
                key={p.id}
                href={`/pathways/${p.id}`}
                data-testid="used-by-pathway-link"
                className="rounded-md border px-3 py-1.5 text-sm transition-colors hover:bg-muted/40"
              >
                {p.name}
              </Link>
            ))}
          </div>
        </section>
      )}

      {hasStructure && (
        <section data-testid="structure-section" className="flex flex-col gap-2">
          <h2 className="text-lg font-semibold tracking-tight">Structure</h2>
          <StructureErrorBoundary>
            <StructureViewer uniprot={uniprot || undefined} pdbIds={pdbIds} />
          </StructureErrorBoundary>
          <StructureLinks uniprot={uniprot || undefined} pdbIds={pdbIds} />
        </section>
      )}
    </div>
  )
}
