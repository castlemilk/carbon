'use client'

import dynamic from 'next/dynamic'
import type { ComponentType } from 'react'

import type { GraphEdgeDto, GraphNodeDto } from '@/components/graph/graph-types'
import GraphErrorBoundary from '@/components/graph/graph-error-boundary'

const GraphCanvas = dynamic(
  () => import('@/components/graph/graph-canvas'),
  {
    ssr: false,
    loading: () => (
      <div
        data-testid="graph-loader-skeleton"
        className="flex h-[min(560px,70vh)] min-h-[320px] w-full items-center justify-center rounded-lg border border-dashed border-[var(--color-border)] bg-[var(--color-surface-2)] text-sm text-[var(--color-muted)]"
      >
        Loading graph…
      </div>
    ),
  },
) as ComponentType<{
  nodes: GraphNodeDto[]
  edges: GraphEdgeDto[]
  inspectorId?: string
  seeMoreHref?: (nodeId: string) => string | undefined
  fitPadding?: number
  onError?: () => void
}>

interface Props {
  nodes: GraphNodeDto[]
  edges: GraphEdgeDto[]
  inspectorId?: string
  seeMoreHref?: (nodeId: string) => string | undefined
  onError?: () => void
}

export default function GraphLoader({
  nodes,
  edges,
  inspectorId,
  seeMoreHref,
  onError,
}: Props) {
  if (nodes.length === 0) return null
  return (
    <GraphErrorBoundary
      resetKey={`${nodes.length}:${edges.length}`}
      onError={() => onError?.()}
      fallback={(_error, reset) => (
        <div
          data-testid="graph-loader-error"
          className="flex flex-col items-start gap-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] p-4 text-sm"
        >
          <p>The graph could not be loaded.</p>
          <button
            type="button"
            onClick={reset}
            className="rounded-sm border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1 text-xs font-medium"
          >
            Try again
          </button>
        </div>
      )}
    >
      <GraphCanvas
        nodes={nodes}
        edges={edges}
        inspectorId={inspectorId}
        seeMoreHref={seeMoreHref}
        onError={onError}
      />
    </GraphErrorBoundary>
  )
}
