import Link from 'next/link'

import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { openDb } from '@/lib/db/instance'
import { listMaterials, listPathways } from '@/lib/db/repos'
import { MaterialClass } from '@/lib/gen/carbon/v1/material_pb'
import {
  MATERIAL_CLASS_FILTERS,
  MATERIAL_CLASS_LABELS,
  materialClassLabel,
  parseMaterialClassFilter,
} from '@/lib/material-class'

export const metadata = { title: 'Materials' }

const first = (sp: Record<string, string | string[] | undefined>, key: string): string | undefined => {
  const v = sp[key]
  return Array.isArray(v) ? v[0] : v
}

export default async function MaterialsIndex(props: PageProps<'/materials'>) {
  const sp = await props.searchParams

  const activeClass = parseMaterialClassFilter(first(sp, 'class'))
  const isActive = (name: (typeof MATERIAL_CLASS_FILTERS)[number]) =>
    activeClass !== undefined && MaterialClass[name] === activeClass

  const db = openDb()
  // used-by counts come from scanning pathways' material ids
  const usedBy: Record<string, number> = {}
  for (const p of listPathways(db)) {
    for (const mid of p.materialIds) {
      usedBy[mid] = (usedBy[mid] ?? 0) + 1
    }
  }

  const materials = listMaterials(db)
  const filtered = activeClass === undefined ? materials : materials.filter((m) => m.class === activeClass)

  return (
    <div className="flex min-h-screen flex-col gap-6 p-8">
      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">Materials</h1>
        <nav data-testid="class-filter" aria-label="Filter by material class" className="flex flex-wrap gap-2">
          <Link href="/materials">
            <Badge variant={activeClass === undefined ? 'default' : 'outline'}>All</Badge>
          </Link>
          {MATERIAL_CLASS_FILTERS.map((name) => (
            <Link key={name} href={`/materials?class=${name}`} data-active={isActive(name)}>
              <Badge variant={isActive(name) ? 'default' : 'outline'}>
                {MATERIAL_CLASS_LABELS[name]}
              </Badge>
            </Link>
          ))}
        </nav>
      </header>

      <section>
        <h2 className="mb-2 text-sm font-medium text-muted-foreground">
          {filtered.length} material{filtered.length === 1 ? '' : 's'}
        </h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((m) => {
            const propertyCount = Object.keys(m.properties).length
            const usedByCount = usedBy[m.id] ?? 0
            return (
              <Link key={m.id} href={`/materials/${m.id}`} data-testid="material-card" className="group">
                <Card size="sm" className="transition-colors group-hover:bg-muted/40">
                  <CardContent className="flex flex-col gap-1.5">
                    <span className="font-medium underline-offset-4 group-hover:underline">{m.name}</span>
                    <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs text-muted-foreground">
                      <Badge variant="secondary">{materialClassLabel(m)}</Badge>
                      <span>
                        {propertyCount} propert{propertyCount === 1 ? 'y' : 'ies'}
                      </span>
                      <span>· used by {usedByCount} pathway{usedByCount === 1 ? '' : 's'}</span>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            )
          })}
        </div>
        {filtered.length === 0 && (
          <p className="py-8 text-center text-sm text-muted-foreground">No materials in this class yet.</p>
        )}
      </section>
    </div>
  )
}
