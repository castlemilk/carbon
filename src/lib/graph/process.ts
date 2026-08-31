import {
  GraphCyclePolicy,
  GraphEdgeKind,
  GraphNodeKind,
  GraphStage,
  type ProcessGraph,
} from '@/lib/gen/carbon/v1/graph_pb'
import type {
  GraphEdgeDto,
  GraphNodeDto,
  MaterialSummaryDto,
  MetricRowDto,
  ProcessDto,
  ProcessLookups,
  SourceSummaryDto,
} from '@/components/graph/graph-types'

export type { ProcessLookups }

const STAGE_ORDER: GraphStage[] = [
  GraphStage.INPUT,
  GraphStage.CAPTURE,
  GraphStage.CONVERSION,
  GraphStage.REGENERATION,
  GraphStage.SEPARATION,
  GraphStage.TRANSPORT,
  GraphStage.STORAGE,
  GraphStage.BYPRODUCT,
]

const STAGE_X_STEP = 220
const STAGE_X_PADDING = 80
const NODE_Y_STEP = 110
const NODE_Y_PADDING = 60

const enumName = (e: Record<string, string | number>, v: string | number): string => {
  if (typeof v === 'string') return v
  for (const [k, val] of Object.entries(e)) {
    if (val === v && typeof val === 'number') return k
  }
  return String(v)
}

const KIND_NAME = enumName.bind(null, GraphNodeKind as unknown as Record<string, string | number>)
const STAGE_NAME = enumName.bind(null, GraphStage as unknown as Record<string, string | number>)
const EDGE_KIND_NAME = enumName.bind(null, GraphEdgeKind as unknown as Record<string, string | number>)
const CYCLE_POLICY_NAME = enumName.bind(null, GraphCyclePolicy as unknown as Record<string, string | number>)

const stageIndex = (stage: GraphStage): number => {
  const i = STAGE_ORDER.indexOf(stage)
  return i >= 0 ? i : STAGE_ORDER.length
}

export interface BuildProcessOptions {
  kind: 'process' | 'operational'
}

export function buildProcessDto(
  graph: ProcessGraph,
  lookups: ProcessLookups,
  opts: BuildProcessOptions,
): ProcessDto {
  const sortedNodes = [...graph.nodes].sort((a, b) => {
    const ax = stageIndex(a.stage)
    const bx = stageIndex(b.stage)
    if (ax !== bx) return ax - bx
    if (a.order !== b.order) return a.order - b.order
    return a.id.localeCompare(b.id)
  })

  const cursorByStage = new Map<number, number>()
  const nodes: GraphNodeDto[] = []

  for (const node of sortedNodes) {
    const s = stageIndex(node.stage)
    const yIndex = cursorByStage.get(s) ?? 0
    cursorByStage.set(s, yIndex + 1)

    const materials: MaterialSummaryDto[] = []
    for (const mid of node.materialIds) {
      const summary = lookups.materialSummaries[mid]
      if (summary) materials.push(summary)
    }
    const sources: SourceSummaryDto[] = []
    for (const ref of node.sourceRefs) {
      const summary = lookups.sourceSummaries[ref]
      if (summary) sources.push(summary)
    }
    const metrics: MetricRowDto[] = []
    for (const key of node.metricKeys) {
      const row = lookups.pathwayMetrics[key]
      if (row) metrics.push(row)
    }

    const kindName = KIND_NAME(node.kind)
    const stageName = STAGE_NAME(node.stage)

    nodes.push({
      id: node.id,
      type: kindName.toLowerCase(),
      position: {
        x: STAGE_X_PADDING + s * STAGE_X_STEP,
        y: NODE_Y_PADDING + yIndex * NODE_Y_STEP,
      },
      data: {
        label: node.label,
        kind: kindName,
         stage: stageName,
         handleLayout: 'horizontal',
         summary: node.summary,
        assetId: node.assetId,
        order: node.order,
        materialIds: [...node.materialIds],
        sourceRefs: [...node.sourceRefs],
        metricKeys: [...node.metricKeys],
        materials,
        sources,
        metrics,
      },
    })
  }

  const edges: GraphEdgeDto[] = graph.edges.map((e) => {
    const edgeKind = EDGE_KIND_NAME(e.kind)
    return {
      id: e.id,
      source: e.sourceNodeId,
      target: e.targetNodeId,
      type: edgeKind.toLowerCase(),
      data: {
        edgeKind,
        label: e.label,
        sourceRefs: [...e.sourceRefs],
      },
    }
  })

  return {
    nodes,
    edges,
    meta: {
      kind: opts.kind,
      cyclePolicy: CYCLE_POLICY_NAME(graph.cyclePolicy),
    },
  }
}
