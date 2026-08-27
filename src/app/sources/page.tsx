import Link from 'next/link'

import { CitationList } from '@/components/citation/citation-badge'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { listCitations } from '@/lib/db/repos'
import { type Citation } from '@/lib/gen/carbon/v1/common_pb'

export const metadata = { title: 'Sources' }

interface Group {
  year: number
  citations: Citation[]
}

export default async function SourcesPage() {
  const citations = await listCitations()
  const groups = new Map<number, Citation[]>()
  for (const c of citations) {
    const key = c.year > 0 ? c.year : 0
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key)!.push(c)
  }
  const sorted: Group[] = [...groups.entries()]
    .sort((a, b) => b[0] - a[0])
    .map(([year, cs]) => ({ year, citations: cs.sort((x, y) => x.title.localeCompare(y.title)) }))

  return (
    <div className="flex min-h-screen flex-col gap-6 p-8">
      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">Bibliography</h1>
        <p className="text-sm text-muted-foreground">
          {citations.length} curated source{citations.length === 1 ? '' : 's'} backing the metrics and
          descriptions across the platform. Year groups are sorted newest-first; entries within each
          year are alphabetical.
        </p>
      </header>

      <section className="flex flex-col gap-4">
        {sorted.map((g) => (
          <div key={g.year || 'undated'} className="flex flex-col gap-2">
            <h2 className="type-label text-[var(--color-muted)]">
              {g.year > 0 ? g.year : 'Undated'}
            </h2>
            <div className="flex flex-col gap-3">
              {g.citations.map((c) => (
                <Card key={c.id} size="sm" data-testid="source-card">
                  <CardContent className="flex flex-col gap-1">
                    <a
                      href={c.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-medium underline-offset-4 hover:underline"
                    >
                      {c.title}
                    </a>
                    <p className="text-sm text-muted-foreground">
                      <CitationList citations={[c]} />
                      {c.venue && <span>{' · '}{c.venue}</span>}
                    </p>
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                      <Badge variant="outline" className="font-mono">{c.id}</Badge>
                      <Link href={`/pathways`} className="underline-offset-4 hover:underline">
                        See pathways citing this
                      </Link>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        ))}
        {sorted.length === 0 && (
          <p className="py-8 text-center text-sm text-muted-foreground">
            No sources have been curated yet.
          </p>
        )}
      </section>
    </div>
  )
}
