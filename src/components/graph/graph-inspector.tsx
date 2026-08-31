'use client'

import { useEffect, useRef } from 'react'

import type { GraphNodeDto, MaterialSummaryDto, MetricRowDto, SourceSummaryDto } from '@/components/graph/graph-types'

interface InspectorData extends Record<string, unknown> {
  label: string
  kind: string
  stage: string
  summary?: string
  materials?: MaterialSummaryDto[]
  sources?: SourceSummaryDto[]
  metrics?: MetricRowDto[]
  connected?: { id: string; label: string }[]
}

interface Props {
  node: GraphNodeDto | null
  inspectorId: string
  triggerSelector: (id: string) => string
  seeMoreHref?: string
  onClose: () => void
}

const formatMetric = (m: MetricRowDto): string => {
  if (m.low === m.high) return `${m.low} ${m.unit}`
  return `${m.low}–${m.high} ${m.unit}`
}

export default function GraphInspector({
  node,
  inspectorId,
  triggerSelector,
  seeMoreHref,
  onClose,
}: Props) {
  const headingRef = useRef<HTMLHeadingElement>(null)

  useEffect(() => {
    if (!node) return
    const heading = headingRef.current
    if (heading) heading.focus()
    // Only re-focus when the selected node identity changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [node?.id])

  useEffect(() => {
    if (!node) return
    const handler = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      onClose()
      const trigger = document.querySelector<HTMLElement>(triggerSelector(node.id))
      trigger?.focus()
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
    // Re-bind only when the selected node or close behaviour changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [node?.id, onClose, triggerSelector])

  if (!node) return null

  const data = node.data as InspectorData
  const materials = data.materials ?? []
  const sources = data.sources ?? []
  const metrics = data.metrics ?? []
  const connected = data.connected ?? []
  const label = data.label || node.id

  return (
    <aside
      id={inspectorId}
      data-testid="graph-inspector"
      data-node-id={node.id}
      className="flex flex-col gap-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-4"
    >
      <h3
        ref={headingRef}
        tabIndex={-1}
        className="text-base font-semibold outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-fg)]"
      >
        {label}
      </h3>
      <p className="text-xs uppercase tracking-wider text-[var(--color-muted)]">
        {data.kind?.toLowerCase()} · stage {data.stage?.toLowerCase()}
      </p>
      {data.summary ? (
        <p className="text-sm leading-relaxed text-[var(--color-fg)]">{data.summary}</p>
      ) : null}
      {metrics.length > 0 ? (
        <ul data-testid="inspector-metrics" className="flex flex-wrap gap-1.5">
          {metrics.map((m) => (
            <li
              key={m.key}
              className="rounded-sm bg-[var(--color-surface-2)] px-2 py-0.5 font-mono text-xs"
            >
              <span className="text-[var(--color-muted)]">{m.key}</span>{' '}
              <span>{formatMetric(m)}</span>
            </li>
          ))}
        </ul>
      ) : null}
      {materials.length > 0 ? (
        <section className="flex flex-col gap-1">
          <h4 className="text-xs font-medium uppercase tracking-wider text-[var(--color-muted)]">
            Materials
          </h4>
          <ul data-testid="inspector-materials" className="flex flex-wrap gap-1.5">
            {materials.map((m) => (
              <li
                key={m.id}
                className="rounded-sm bg-[var(--color-surface-2)] px-2 py-0.5 text-xs"
              >
                {m.name}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      {sources.length > 0 ? (
        <section className="flex flex-col gap-1">
          <h4 className="text-xs font-medium uppercase tracking-wider text-[var(--color-muted)]">
            Sources
          </h4>
          <ul data-testid="inspector-sources" className="flex flex-col gap-0.5 text-xs">
            {sources.map((s) => (
              <li key={s.id}>
                <a
                  className="underline-offset-4 hover:underline"
                  href={s.url}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {s.title}
                </a>{' '}
                <span className="text-[var(--color-muted)]">
                  · {s.authors.join(', ')} · {s.year} · {s.venue}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      {connected.length > 0 ? (
        <section className="flex flex-col gap-1">
          <h4 className="text-xs font-medium uppercase tracking-wider text-[var(--color-muted)]">
            Connected concepts
          </h4>
          <ul data-testid="inspector-connected" className="flex flex-wrap gap-1.5">
            {connected.map((c) => (
              <li
                key={c.id}
                className="rounded-sm bg-[var(--color-surface-2)] px-2 py-0.5 text-xs"
              >
                {c.label}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      {seeMoreHref ? (
        <a
          href={seeMoreHref}
          data-testid="inspector-see-more"
          className="self-start text-sm font-medium underline-offset-4 hover:underline"
        >
          See more →
        </a>
      ) : null}
    </aside>
  )
}
