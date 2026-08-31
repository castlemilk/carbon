'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'

import GraphLoader from '@/components/graph/graph-loader'
import type { LandscapeDto } from '@/components/graph/graph-types'
import PathwayList, { type ListRow } from '@/components/landscape/pathway-list'
import ScatterPlot, { type PlotPoint } from '@/components/landscape/scatter-plot'
import { axisLabel } from '@/lib/format'
import {
  selectOverviewView,
  type GraphLoadState,
  type OverviewClientFailure,
} from '@/lib/graph/view-selection'

interface Props {
  viewState: GraphLoadState
  points: PlotPoint[]
  xKey: string
  yKey: string
  logX: boolean
  search: string
  rows: ListRow[]
  ids: string[]
  missingXCount: number
  missingYCount: number
}

const note = (count: number, axis: string): React.JSX.Element | null => {
  if (count === 0) return null
  return (
    <p data-testid={`missing-${axis}`} className="text-sm text-muted-foreground">
      {count} pathway{count === 1 ? '' : 's'} lack{count === 1 ? 's' : ''} {axisLabel(axis)} data
      — excluded from the plot.
    </p>
  )
}

export default function LandscapeGraph({
  viewState,
  points,
  xKey,
  yKey,
  logX,
  search,
  rows,
  ids,
  missingXCount,
  missingYCount,
}: Props) {
  const [failure, setFailure] = useState<OverviewClientFailure>('healthy')

  // Consume the Task 5 view selector as-is: 'reactflow' whenever a landscape
  // DTO is present and the client surface has not failed, else 'scatter'.
  const resolution = useMemo(
    () => selectOverviewView(viewState, failure),
    [viewState, failure],
  )

  const graph = resolution.view === 'reactflow' ? (resolution.graph as LandscapeDto) : null

  const nodeById = useMemo(() => {
    if (!graph) return new Map<string, import('@/components/graph/graph-types').GraphNodeDto>()
    return new Map(graph.nodes.map((n) => [n.id, n]))
  }, [graph])

  const seeMoreHref = useMemo(() => {
    return (nodeId: string): string | undefined => {
      const node = nodeById.get(nodeId)
      if (!node) return undefined
      const pathwayId = node.data.pathwayId
      if (typeof pathwayId !== 'string' || pathwayId.length === 0) return undefined
      return `/pathways/${pathwayId}?back=${encodeURIComponent(search)}`
    }
  }, [nodeById, search])

  return (
    <>
      <section className="flex flex-col gap-4">
        {graph ? (
          <>
            <GraphLoader
              nodes={graph.nodes}
              edges={graph.edges}
              seeMoreHref={seeMoreHref}
              onError={() => setFailure('failed')}
            />
            {graph.unmapped.length > 0 && (
              <aside
                data-testid="unmapped-rail"
                className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] px-4 py-3"
              >
                <h3 className="text-sm font-semibold tracking-tight">Unmapped on this view</h3>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {graph.unmapped.length} pathway{graph.unmapped.length === 1 ? '' : 's'} lack{' '}
                  {axisLabel(xKey)} or {axisLabel(yKey)} data — shown here instead of an axis
                  position, and still listed in the table below.
                </p>
                <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm">
                  {graph.unmapped.map((id) => {
                    const node = nodeById.get(id)
                    if (!node) return null
                    const pathwayId = node.data.pathwayId
                    const label = node.data.label
                    if (typeof pathwayId !== 'string' || typeof label !== 'string') return null
                    return (
                      <li key={id}>
                        <Link
                          data-testid="unmapped-item"
                          data-id={pathwayId}
                          href={`/pathways/${pathwayId}?back=${encodeURIComponent(search)}`}
                          className="font-medium underline-offset-4 hover:underline"
                        >
                          {label}
                        </Link>
                      </li>
                    )
                  })}
                </ul>
              </aside>
            )}
          </>
        ) : (
          <>
            <ScatterPlot points={points} xKey={xKey} yKey={yKey} logX={logX} search={search} />
            {note(missingXCount, xKey)}
            {yKey !== xKey && note(missingYCount, yKey)}
          </>
        )}
      </section>
      <section>
        <h2 className="mb-2 text-sm font-medium text-muted-foreground">All pathways ({rows.length})</h2>
        <PathwayList rows={rows} search={search} ids={ids} />
      </section>
    </>
  )
}