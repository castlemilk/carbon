'use client'

import { useCallback, useMemo, useState } from 'react'

import GraphLoader from '@/components/graph/graph-loader'
import GraphSemanticList from '@/components/graph/graph-semantic-list'
import type {
  GraphNodeDto,
  MaterialSummaryDto,
  MetricRowDto,
  SourceSummaryDto,
} from '@/components/graph/graph-types'
import MermaidErrorBoundary from '@/components/pathway/mermaid-error-boundary'
import MermaidViewer from '@/components/pathway/mermaid-viewer'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  selectDetailView,
  type DetailClientFailure,
  type DetailRenderView,
  type DetailViewState,
} from '@/lib/graph/view-selection'

interface Props {
  /** Serialized graph + Mermaid state resolved server-side by the loading page. */
  viewState: DetailViewState
  pathwayId: string
  graphBaseHref?: string
}

interface NodeData {
  materials?: MaterialSummaryDto[]
  metrics?: MetricRowDto[]
  sources?: SourceSummaryDto[]
}

const seeMoreAnchor = (node: GraphNodeDto): string => {
  const data = (node.data ?? {}) as NodeData
  if ((data.materials?.length ?? 0) > 0) return '#materials'
  if ((data.metrics?.length ?? 0) > 0) return '#metrics'
  if ((data.sources?.length ?? 0) > 0) return '#literature'
  return '#mechanism'
}

function ViewSlot({
  view,
  inspectorId,
  seeMoreHref,
  onError,
}: {
  view: DetailRenderView
  inspectorId: string
  seeMoreHref?: (nodeId: string) => string | undefined
  onError?: () => void
}) {
  if (view.view === 'reactflow') {
    const graph = view.graph
    if ('nodes' in graph) {
      const { nodes, edges } = graph
      return (
        <div className="flex min-w-0 flex-col gap-3">
          <GraphLoader
            nodes={nodes}
            edges={edges}
            inspectorId={inspectorId}
            seeMoreHref={seeMoreHref}
            onError={onError}
          />
          <GraphSemanticList nodes={nodes} edges={edges} caption="Graph node list" />
        </div>
      )
    }
  }
  if (view.view === 'mermaid') {
    return (
      <MermaidErrorBoundary onError={onError}>
        <MermaidViewer source={view.source} title="Process diagram" />
      </MermaidErrorBoundary>
    )
  }
  return (
    <p
      data-testid="diagram-view-unavailable"
      className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] p-4 text-sm text-[var(--color-muted)]"
    >
      No diagram is available for this view. The mechanism and metrics below describe the pathway.
    </p>
  )
}

export default function PathwayDiagrams({ viewState, pathwayId, graphBaseHref }: Props) {
  const [failures, setFailures] = useState<DetailClientFailure>({})

  const resolution = useMemo(
    () => selectDetailView(viewState, failures),
    [viewState, failures],
  )

  const graphHrefPrefix = graphBaseHref ?? `/pathways/${pathwayId}`

  const buildSeeMore = useCallback(
    (graph: { nodes: GraphNodeDto[] }) => {
      const byId = new Map(graph.nodes.map((n) => [n.id, n]))
      return (nodeId: string): string | undefined => {
        const node = byId.get(nodeId)
        if (!node) return undefined
        return `${graphHrefPrefix}${seeMoreAnchor(node)}`
      }
    },
    [graphHrefPrefix],
  )

  return (
    <Card data-testid="pathway-diagrams">
      <CardHeader className="gap-3">
        <div>
          <CardTitle>Process diagrams</CardTitle>
          <p className="mt-1 text-sm text-muted-foreground">
            Follow the physical components first, then the operational handoffs that move carbon through the system.
          </p>
        </div>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="flow">
          <TabsList aria-label="Diagram type" variant="line">
            <TabsTrigger value="flow">System flow</TabsTrigger>
            <TabsTrigger value="sequence">Operational sequence</TabsTrigger>
          </TabsList>
          <TabsContent value="flow" className="mt-0">
            <ViewSlot
              view={resolution.systemFlow}
              inspectorId="graph-inspector"
              seeMoreHref={
                resolution.systemFlow.view === 'reactflow'
                  ? buildSeeMore(resolution.systemFlow.graph)
                  : undefined
              }
              onError={() => setFailures((f) => ({ ...f, process: 'failed' }))}
            />
          </TabsContent>
          <TabsContent value="sequence" className="mt-0">
            <ViewSlot
              view={resolution.operationalSequence}
              inspectorId="graph-inspector"
              seeMoreHref={
                resolution.operationalSequence.view === 'reactflow'
                  ? buildSeeMore(resolution.operationalSequence.graph)
                  : undefined
              }
              onError={() => setFailures((f) => ({ ...f, operational: 'failed' }))}
            />
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  )
}
