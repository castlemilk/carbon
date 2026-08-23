import Link from 'next/link'

import CompareTable, { type CompareRow } from '@/components/compare/compare-table'
import { openDb } from '@/lib/db/instance'
import { listPathways, listShortlist } from '@/lib/db/repos'
import { Setting } from '@/lib/gen/carbon/v1/pathway_pb'

type SearchParams = Record<string, string | string[] | undefined>

const first = (sp: SearchParams, key: string): string | undefined => {
  const v = sp[key]
  return Array.isArray(v) ? v[0] : v
}

export default async function ComparePage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams
  const db = openDb()

  const byId = new Map(listPathways(db).map((p) => [p.id, p]))
  const requested = [...new Set(
    (first(sp, 'ids') ?? '').split(',').map((s) => s.trim()).filter(Boolean),
  )]

  // explicit ids win (unknown ones dropped); default = benchmarks ∪ shortlisted
  const selected =
    requested.length > 0
      ? requested.flatMap((id) => byId.get(id) ?? [])
      : (() => {
          const ids = new Set<string>()
          for (const p of byId.values()) if (p.isBenchmark) ids.add(p.id)
          for (const s of listShortlist(db)) if (byId.has(s.entry.pathwayId)) ids.add(s.entry.pathwayId)
          return [...ids].map((id) => byId.get(id)!)
        })()

  const rows: CompareRow[] = selected.map((p) => ({
    id: p.id,
    name: p.name,
    settingName: Setting[p.setting] ?? 'SETTING_UNSPECIFIED',
    trl: p.trl,
    isBenchmark: p.isBenchmark,
    metrics: Object.fromEntries(
      Object.entries(p.metrics).map(([key, m]) => [
        key,
        { low: m.low, high: m.high, unit: m.unit, year_basis: m.yearBasis },
      ]),
    ),
  }))

  // carry the validated ids back so the landscape checkboxes pre-check them
  const backHref = rows.length > 0 ? `/?ids=${rows.map((r) => r.id).join(',')}` : '/'

  return (
    <div className="flex min-h-screen flex-col gap-6 p-8">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Compare</h1>
        <p className="text-sm text-muted-foreground">
          Side-by-side metrics for selected pathways — add or remove them via the{' '}
          <Link
            href={backHref}
            data-testid="back-to-landscape"
            className="underline underline-offset-4 hover:text-foreground"
          >
            Landscape list
          </Link>
          .
        </p>
      </header>
      <CompareTable rows={rows} />
    </div>
  )
}
