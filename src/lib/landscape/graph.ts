import type { LandscapeGraph } from '@/lib/gen/carbon/v1/landscape_pb'
import type { Pathway } from '@/lib/gen/carbon/v1/pathway_pb'
import {
  GraphEntityType,
  GraphNodeKind,
  GraphStage,
} from '@/lib/gen/carbon/v1/graph_pb'
import { makeScales, projectPoint } from '@/lib/scatter'
import type {
  GraphEdgeDto,
  GraphNodeDto,
  LandscapeDto,
  MaterialSummaryDto,
  MetricRowDto,
  SourceSummaryDto,
} from '@/components/graph/graph-types'

const PATHWAY_NS = 'pathway:'
const SETTING_NS = 'setting:'
const MATERIAL_NS = 'material:'

export interface PathwayMetricValues {
  x: number | undefined
  y: number | undefined
}

// Server-resolved lookup bag the page hands to the adapter so the landscape
// DTO carries everything the inspector needs (mechanism summary, metric
// ranges, material names, citation sources, connected-concept labels) without
// any per-node client fetches. Keyed by pathway id where values are per-
// pathway (metrics differ across pathways, unlike the shared process adapter).
export interface LandscapeLookups {
  materialSummaries: Record<string, MaterialSummaryDto>
  sourceSummaries: Record<string, SourceSummaryDto>
  pathwayMetrics: Record<string, MetricRowDto[]>
}

export interface BuildLandscapeOptions {
  xKey: string
  yKey: string
  logX: boolean
  w: number
  h: number
}

// Concentric ring offsets so two pathways sharing (x, y) don't overdraw. Stable
// per-pathway because the grouping sorts by node id first; the same input order
// always produces the same offsets.
const RING_SLOTS = 6
const RING_RADII = [0, 14, 22, 30]
const overlapOffset = (index: number): { dx: number; dy: number } => {
  if (index === 0) return { dx: 0, dy: 0 }
  const slot = (index - 1) % RING_SLOTS
  const ring = Math.floor((index - 1) / RING_SLOTS) + 1
  const radius = RING_RADII[ring] ?? 38
  const angle = (slot / RING_SLOTS) * 2 * Math.PI
  return { dx: Math.cos(angle) * radius, dy: Math.sin(angle) * radius }
}

const enumName = (e: Record<string, string | number>, v: string | number): string => {
  if (typeof v === 'string') return v
  for (const [k, val] of Object.entries(e)) {
    if (val === v && typeof val === 'number') return k
  }
  return String(v)
}

const KIND_NAME = enumName.bind(null, GraphNodeKind as unknown as Record<string, string | number>)
const STAGE_NAME = enumName.bind(null, GraphStage as unknown as Record<string, string | number>)
const ENTITY_NAME = enumName.bind(null, GraphEntityType as unknown as Record<string, string | number>)

const splitNs = (id: string): { ns: 'pathway' | 'setting' | 'material'; tail: string } | null => {
  if (id.startsWith(PATHWAY_NS)) return { ns: 'pathway', tail: id.slice(PATHWAY_NS.length) }
  if (id.startsWith(SETTING_NS)) return { ns: 'setting', tail: id.slice(SETTING_NS.length) }
  if (id.startsWith(MATERIAL_NS)) return { ns: 'material', tail: id.slice(MATERIAL_NS.length) }
  return null
}

export function buildLandscapeDto(
  graph: LandscapeGraph | undefined,
  pathways: Pathway[],
  metrics: Record<string, PathwayMetricValues>,
  opts: BuildLandscapeOptions,
  lookups?: LandscapeLookups,
): LandscapeDto {
  const pathwaysById = new Map(pathways.map((p) => [p.id, p]))
  const filteredPathwayIds = new Set(pathwaysById.keys())
  const nodes: GraphNodeDto[] = []
  const nodeIds = new Set<string>()
  const nodeById = new Map<string, GraphNodeDto>()
  let unmapped: string[] = []

  if (graph) {
    const positionedBuckets = new Map<string, GraphNodeDto[]>()
    const unmappedQueue: GraphNodeDto[] = []
    const contextQueue: GraphNodeDto[] = []
    let settingContextIndex = 0
    let materialContextIndex = 0

    for (const node of graph.nodes) {
      const split = splitNs(node.id)
      if (!split) continue

      if (split.ns === 'pathway') {
        if (!filteredPathwayIds.has(split.tail)) continue
        const pathway = pathwaysById.get(split.tail)!
        const m = metrics[split.tail]
        const missingX = !m || m.x === undefined || (opts.logX && m.x <= 0)
        const missingY = !m || m.y === undefined
        const data: Record<string, unknown> = {
          label: pathway.name,
          pathwayId: pathway.id,
          setting: ENTITY_NAME(pathway.setting),
          trl: pathway.trl,
          isBenchmark: pathway.isBenchmark,
          kind: KIND_NAME(node.kind),
          stage: STAGE_NAME(node.stage),
          metricKeys: [...node.metricKeys],
          materialIds: [...node.materialIds],
          sourceRefs: [...node.sourceRefs],
          initiallyHidden: node.initiallyHidden,
          summary: pathway.mechanism,
          metrics: lookups?.pathwayMetrics[pathway.id] ?? [],
          materials: lookups ? resolveMaterials(lookups.materialSummaries, node.materialIds) : [],
          sources: lookups ? resolveSources(lookups.sourceSummaries, pathway, node.sourceRefs) : [],
        }
        if (missingX || missingY) {
          data.unmapped = true
          unmappedQueue.push({ id: node.id, type: 'pathway', position: { x: 0, y: 0 }, data })
          continue
        }
        const key = `${m!.x}|${m!.y}`
        const list = positionedBuckets.get(key) ?? []
        list.push({ id: node.id, type: 'pathway', position: { x: m!.x!, y: m!.y! }, data })
        positionedBuckets.set(key, list)
      } else {
        const data: Record<string, unknown> = {
          label: node.label,
          kind: KIND_NAME(node.kind),
          entityType: ENTITY_NAME(node.entityType),
          entityId: node.entityId,
          summary: node.summary,
          initiallyHidden: node.initiallyHidden,
        }
        if (split.ns === 'material') {
          const material = lookups?.materialSummaries[node.entityId]
          data.materials = material ? [material] : []
        }
        contextQueue.push({
          id: node.id,
          type: split.ns,
          position:
            split.ns === 'setting'
              ? { x: 80 + settingContextIndex++ * 190, y: -120 }
              : { x: 80 + materialContextIndex++ * 190, y: opts.h + 120 },
          data,
        })
      }
    }

    let totalPositioned = 0
    for (const bucket of positionedBuckets.values()) totalPositioned += bucket.length

    if (totalPositioned > 0) {
      const pts = [...positionedBuckets.values()].flat().map((n) => ({
        id: n.id,
        x: n.position.x,
        y: n.position.y,
      }))
      const scales = makeScales(pts, { w: opts.w, h: opts.h, logX: opts.logX })
      for (const bucket of positionedBuckets.values()) {
        bucket.sort((a, b) => a.id.localeCompare(b.id))
        bucket.forEach((n, i) => {
          const { cx, cy } = projectPoint(
            { id: n.id, x: n.position.x, y: n.position.y },
            scales,
          )
          const { dx, dy } = overlapOffset(i)
          n.position = { x: cx + dx, y: cy + dy }
          nodes.push(n)
          nodeIds.add(n.id)
        })
      }
    }

    const sortedUnmapped = unmappedQueue.slice().sort((a, b) => a.id.localeCompare(b.id))
    unmapped = sortedUnmapped.map((n) => n.id)
    sortedUnmapped.forEach((n, i) => {
      n.position = { x: 0, y: opts.h + 40 + i * 24 }
      nodes.push(n)
      nodeIds.add(n.id)
    })

    for (const node of contextQueue) {
      nodes.push(node)
      nodeIds.add(node.id)
    }
  }

  const edges: GraphEdgeDto[] = []
  if (graph) {
    for (const e of graph.edges) {
      if (!nodeIds.has(e.sourceNodeId) || !nodeIds.has(e.targetNodeId)) continue
      edges.push({
        id: e.id,
        source: e.sourceNodeId,
        target: e.targetNodeId,
        type: 'relation',
        data: { edgeKind: 'RELATION' },
      })
    }
  }

  for (const n of nodes) nodeById.set(n.id, n)
  attachConnectedLabels(nodes, edges, nodeById)

  return {
    nodes,
    edges,
    unmapped,
    meta: {
      xKey: opts.xKey,
      yKey: opts.yKey,
      logX: opts.logX,
      w: opts.w,
      h: opts.h,
    },
  }
}

const resolveMaterials = (
  lookup: Record<string, MaterialSummaryDto>,
  ids: string[],
): MaterialSummaryDto[] => {
  const out: MaterialSummaryDto[] = []
  for (const id of ids) {
    const s = lookup[id]
    if (s) out.push(s)
  }
  return out
}

const resolveSources = (
  lookup: Record<string, SourceSummaryDto>,
  pathway: Pathway,
  graphRefs: readonly string[],
): SourceSummaryDto[] => {
  const seen = new Set<string>()
  const out: SourceSummaryDto[] = []
  for (const ref of [...pathway.sourceRefs, ...graphRefs]) {
    if (!ref || seen.has(ref)) continue
    seen.add(ref)
    const s = lookup[ref]
    if (s) out.push(s)
  }
  return out
}

// Resolve each pathway node's connected-concept labels from the relationship
// edges so the inspector can list them without a client fetch. Deterministic:
// sorted by the connected node id.
const attachConnectedLabels = (
  nodes: GraphNodeDto[],
  edges: GraphEdgeDto[],
  nodeById: Map<string, GraphNodeDto>,
): void => {
  if (nodes.length === 0 || edges.length === 0) return
  const connectedByNode = new Map<string, { id: string; label: string }[]>()
  for (const e of edges) {
    const targetLabel = (nodeById.get(e.target)?.data.label ?? e.target) as string
    const sourceLabel = (nodeById.get(e.source)?.data.label ?? e.source) as string
    const targets = connectedByNode.get(e.source) ?? []
    targets.push({ id: e.target, label: targetLabel })
    connectedByNode.set(e.source, targets)
    const sources = connectedByNode.get(e.target) ?? []
    sources.push({ id: e.source, label: sourceLabel })
    connectedByNode.set(e.target, sources)
  }
  for (const node of nodes) {
    if (node.type !== 'pathway') continue
    const connected = connectedByNode.get(node.id)
    if (!connected || connected.length === 0) continue
    connected.sort((a, b) => a.id.localeCompare(b.id))
    node.data.connected = connected
  }
}
