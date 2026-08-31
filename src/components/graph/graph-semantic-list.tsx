'use client'

import type { GraphEdgeDto, GraphNodeDto, MaterialSummaryDto, MetricRowDto, SourceSummaryDto } from '@/components/graph/graph-types'

interface NodeListData extends Record<string, unknown> {
  label: string
  kind: string
  stage: string
  summary?: string
  materials?: MaterialSummaryDto[]
  sources?: SourceSummaryDto[]
  metrics?: MetricRowDto[]
}

interface EdgeListData extends Record<string, unknown> {
  edgeKind: string
  label?: string
}

interface Props {
  nodes: GraphNodeDto[]
  edges: GraphEdgeDto[]
  caption?: string
  selectedId?: string | null
}

const STAGE_ORDER = [
  'INPUT',
  'CAPTURE',
  'CONVERSION',
  'REGENERATION',
  'SEPARATION',
  'TRANSPORT',
  'STORAGE',
  'BYPRODUCT',
] as const

const formatMetric = (m: MetricRowDto): string =>
  m.low === m.high ? `${m.low} ${m.unit}` : `${m.low}–${m.high} ${m.unit}`

const groupByStage = (
  nodes: GraphNodeDto[],
): { stage: string; nodes: GraphNodeDto[] }[] => {
  const buckets = new Map<string, GraphNodeDto[]>()
  for (const node of nodes) {
    const data = node.data as NodeListData
    const stage = data.stage ?? 'UNSPECIFIED'
    const list = buckets.get(stage) ?? []
    list.push(node)
    buckets.set(stage, list)
  }
  const ordered: { stage: string; nodes: GraphNodeDto[] }[] = []
  for (const stage of STAGE_ORDER) {
    if (buckets.has(stage)) ordered.push({ stage, nodes: buckets.get(stage) ?? [] })
  }
  for (const [stage, list] of buckets) {
    if (!STAGE_ORDER.includes(stage as (typeof STAGE_ORDER)[number])) {
      ordered.push({ stage, nodes: list })
    }
  }
  return ordered
}

const nodeLabelById = (nodes: GraphNodeDto[]): Map<string, string> => {
  const map = new Map<string, string>()
  for (const n of nodes) {
    const data = n.data as NodeListData
    map.set(n.id, data.label || n.id)
  }
  return map
}

export default function GraphSemanticList({
  nodes,
  edges,
  caption,
  selectedId,
}: Props) {
  const labels = nodeLabelById(nodes)
  const grouped = groupByStage(nodes)
  return (
    <section
      data-testid="graph-semantic-list"
      aria-label={caption ?? 'Graph node list'}
      className="flex flex-col gap-4 text-sm"
    >
      <div className="min-w-0 overflow-x-auto">
      <table className="w-full border-collapse text-left">
        <caption className="sr-only">{caption ?? 'Graph node list'}</caption>
        <thead>
          <tr className="border-b border-[var(--color-border)] text-xs uppercase tracking-wider text-[var(--color-muted)]">
            <th scope="col" className="py-1 pr-3 font-medium">Stage</th>
            <th scope="col" className="py-1 pr-3 font-medium">Node</th>
            <th scope="col" className="py-1 pr-3 font-medium">Kind</th>
            <th scope="col" className="py-1 pr-3 font-medium">Metrics</th>
            <th scope="col" className="py-1 font-medium">Materials · Sources</th>
          </tr>
        </thead>
        <tbody>
          {grouped.map(({ stage, nodes: stageNodes }) => (
            stageNodes.map((node) => {
              const data = node.data as NodeListData
              const metrics = data.metrics ?? []
              const materials = data.materials ?? []
              const sources = data.sources ?? []
              return (
                <tr
                  key={node.id}
                  data-node-id={node.id}
                  data-selected={selectedId === node.id ? 'true' : undefined}
                  className="border-b border-[var(--color-border)] align-top"
                >
                  <th scope="row" className="py-2 pr-3 font-normal text-[var(--color-muted)]">{stage.toLowerCase()}</th>
                  <td className="py-2 pr-3 font-medium">{data.label || node.id}</td>
                  <td className="py-2 pr-3 text-xs text-[var(--color-muted)]">{data.kind?.toLowerCase()}</td>
                  <td className="py-2 pr-3">
                    <ul className="flex flex-wrap gap-1.5">
                      {metrics.map((m) => (
                        <li
                          key={m.key}
                          className="rounded-sm bg-[var(--color-surface-2)] px-2 py-0.5 font-mono text-xs"
                        >
                          <span className="text-[var(--color-muted)]">{m.key}</span> {formatMetric(m)}
                        </li>
                      ))}
                    </ul>
                  </td>
                  <td className="py-2">
                    <ul className="flex flex-wrap gap-1.5">
                      {materials.map((m) => (
                        <li
                          key={m.id}
                          className="rounded-sm bg-[var(--color-surface-2)] px-2 py-0.5 text-xs"
                        >
                          {m.name}
                        </li>
                      ))}
                      {sources.map((s) => (
                        <li key={s.id} className="rounded-sm bg-[var(--color-surface-2)] px-2 py-0.5 text-xs">
                          <a
                            href={s.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="underline-offset-4 hover:underline"
                          >
                            {s.title}
                          </a>
                        </li>
                      ))}
                    </ul>
                  </td>
                </tr>
              )
            })
          ))}
        </tbody>
      </table>
      </div>
      <details className="text-xs text-[var(--color-muted)]">
        <summary className="cursor-pointer">Relationships ({edges.length})</summary>
        <div className="min-w-0 overflow-x-auto">
        <table className="mt-2 w-full border-collapse text-left">
          <thead>
            <tr className="border-b border-[var(--color-border)] text-xs uppercase tracking-wider">
              <th scope="col" className="py-1 pr-3 font-medium">From</th>
              <th scope="col" className="py-1 pr-3 font-medium">Relationship</th>
              <th scope="col" className="py-1 pr-3 font-medium">Kind</th>
              <th scope="col" className="py-1 font-medium">To</th>
            </tr>
          </thead>
          <tbody>
            {edges.map((e) => {
              const data = (e.data ?? {}) as EdgeListData
              return (
                <tr key={e.id} className="border-b border-[var(--color-border)] align-top">
                  <th scope="row" className="py-1 pr-3 font-normal">{labels.get(e.source) ?? e.source}</th>
                  <td className="py-1 pr-3">{data.label ?? '→'}</td>
                  <td className="py-1 pr-3 font-mono">{data.edgeKind?.toLowerCase() ?? 'flow'}</td>
                  <td className="py-1">{labels.get(e.target) ?? e.target}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
        </div>
      </details>
    </section>
  )
}
