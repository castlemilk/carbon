'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'

import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { CitationBadge } from '@/components/citation/citation-badge'
import { formatRange, type Range } from '@/lib/format'
import { SETTING_COLORS, SETTING_LABELS } from '@/lib/settings'
import type { Citation } from '@/lib/gen/carbon/v1/common_pb'

export interface ListRow {
  id: string
  name: string
  setting: string
  trl: number
  isBenchmark: boolean
  costRange?: Range | undefined
  sources?: Citation[]
}

interface Props {
  rows: ListRow[]
  search: string
  ids: string[]
}

export default function PathwayList({ rows, search, ids }: Props) {
  const router = useRouter()
  const selected = new Set(ids)

  const toggleId = (id: string) => {
    const q = new URLSearchParams(search)
    const next = new Set(selected)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    if (next.size === 0) q.delete('ids')
    else q.set('ids', [...next].join(','))
    router.push(`/?${q.toString()}`, { scroll: false })
  }

  return (
    <div className="overflow-x-auto rounded-lg border">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b bg-muted/50 text-left text-xs text-muted-foreground">
            <th className="px-3 py-2 font-medium">Compare</th>
            <th className="px-3 py-2 font-medium">Pathway</th>
            <th className="px-3 py-2 font-medium">Setting</th>
            <th className="px-3 py-2 font-medium">TRL</th>
            <th className="px-3 py-2 font-medium">Cost</th>
            <th className="px-3 py-2 font-medium">Sources</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} data-testid="pathway-row" data-id={r.id} className="border-b last:border-b-0 align-top hover:bg-muted/40">
              <td className="px-3 py-2">
                <Label className="cursor-pointer justify-center font-normal">
                  <Checkbox
                    checked={selected.has(r.id)}
                    onCheckedChange={() => toggleId(r.id)}
                    aria-label={`Compare ${r.name}`}
                    data-testid={`compare-${r.id}`}
                  />
                </Label>
              </td>
              <td className="px-3 py-2">
                <Link
                  href={`/pathways/${r.id}?back=${encodeURIComponent(search)}`}
                  className="font-medium underline-offset-4 hover:underline"
                >
                  {r.name}
                  {r.isBenchmark && <span title="Benchmark" className="ml-1.5 text-xs text-muted-foreground">★</span>}
                </Link>
              </td>
              <td className="px-3 py-2">
                <Badge variant="outline" className="gap-1.5">
                  <span className="size-2 rounded-full" style={{ backgroundColor: SETTING_COLORS[r.setting] ?? '#a1a1aa' }} />
                  {SETTING_LABELS[r.setting] ?? r.setting}
                </Badge>
              </td>
              <td className="px-3 py-2 tabular-nums">{r.trl}</td>
              <td className="px-3 py-2 tabular-nums">{r.costRange ? formatRange(r.costRange) : '—'}</td>
              <td className="px-3 py-2">
                {r.sources && r.sources.length > 0 ? (
                  <div className="flex max-w-[260px] flex-wrap gap-1">
                    {r.sources.map((c) => (
                      <CitationBadge key={c.id} citation={c} />
                    ))}
                  </div>
                ) : (
                  <span className="text-xs text-muted-foreground">—</span>
                )}
              </td>
            </tr>
          ))}
          {rows.length === 0 && (
            <tr>
              <td colSpan={6} className="px-3 py-8 text-center text-sm text-muted-foreground">
                No pathways match the current filters.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  )
}
