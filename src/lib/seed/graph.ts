import {
  GraphCyclePolicy,
  GraphEdgeKind,
  GraphEntityType,
  GraphNodeKind,
  GraphStage,
  type GraphEdge,
  type GraphNode,
  type ProcessGraph,
} from '@/lib/gen/carbon/v1/graph_pb'
import type { LandscapeGraph } from '@/lib/gen/carbon/v1/landscape_pb'
import { Setting } from '@/lib/gen/carbon/v1/pathway_pb'

// Object.entries (not Object.keys): a TS enum's reverse mapping also exposes
// numeric keys ('0'..'5') which must never validate as Setting names
export const SETTING_NAMES: ReadonlySet<string> = new Set(
  Object.entries(Setting)
    .filter(([, v]) => typeof v === 'number')
    .map(([k]) => k)
    .filter((k) => k !== 'SETTING_UNSPECIFIED'),
)

const SETTING_NAMES_MESSAGE = [...SETTING_NAMES].join('|')

export interface GraphRefSets {
  citations: Set<string>
  materials: Set<string>
  pathways: Set<string>
}

export type ProcessGraphName = 'process_graph' | 'operational_graph'

export interface ProcessGraphContext {
  file: string
  pathwayId: string
  graphName: ProcessGraphName
  refs: GraphRefSets
  metricKeys: ReadonlySet<string>
}

export interface LandscapeGraphContext {
  file: string
  refs: GraphRefSets
  pathwayMetricKeys: ReadonlyMap<string, ReadonlySet<string>>
}

const EDGE_KIND_NAMES = new Map<number, string>(
  Object.entries(GraphEdgeKind)
    .filter(([, v]) => typeof v === 'number')
    .map(([k, v]) => [v as number, k]),
)

const edgeKindName = (kind: GraphEdgeKind): string =>
  (EDGE_KIND_NAMES.get(kind) ?? String(kind)).replace('GRAPH_EDGE_KIND_', '')

class GraphValidationError extends Error {}

const ENTITY_NAMES = new Map<number, string>(
  Object.entries(GraphEntityType)
    .filter(([, v]) => typeof v === 'number')
    .map(([k, v]) => [v as number, k]),
)

const enumValues = (e: Record<string, string | number>): ReadonlySet<number> =>
  new Set(Object.entries(e).filter(([, v]) => typeof v === 'number').map(([, v]) => v as number))

const NODE_KIND_VALUES = enumValues(GraphNodeKind as unknown as Record<string, string | number>)
const STAGE_VALUES = enumValues(GraphStage as unknown as Record<string, string | number>)
const EDGE_KIND_VALUES = enumValues(GraphEdgeKind as unknown as Record<string, string | number>)
const ENTITY_VALUES = enumValues(GraphEntityType as unknown as Record<string, string | number>)
const CYCLE_POLICY_VALUES = enumValues(GraphCyclePolicy as unknown as Record<string, string | number>)

const checkNodeEnums = (n: GraphNode): void => {
  if (!NODE_KIND_VALUES.has(n.kind)) throw new GraphValidationError(`unknown node kind '${n.kind}'`)
  if (!STAGE_VALUES.has(n.stage)) throw new GraphValidationError(`unknown node stage '${n.stage}'`)
}

const checkNodeEntity = (n: GraphNode, refs: GraphRefSets): void => {
  const entityType = n.entityType
  if (!ENTITY_VALUES.has(entityType)) throw new GraphValidationError(`unknown entity_type '${entityType}'`)
  if (entityType === GraphEntityType.UNSPECIFIED) {
    if (n.entityId) throw new GraphValidationError('entity_id must be empty when entity_type is UNSPECIFIED')
    return
  }
  const entityName = ENTITY_NAMES.get(entityType) ?? String(entityType)
  if (!n.entityId) throw new GraphValidationError(`entity_type ${entityName} requires a non-empty entity_id`)
  switch (entityType) {
    case GraphEntityType.PATHWAY:
      if (!refs.pathways.has(n.entityId))
        throw new GraphValidationError(`PATHWAY entity_id '${n.entityId}' not found`)
      break
    case GraphEntityType.MATERIAL:
      if (!refs.materials.has(n.entityId))
        throw new GraphValidationError(`MATERIAL entity_id '${n.entityId}' not found`)
      break
    case GraphEntityType.CITATION:
      if (!refs.citations.has(n.entityId))
        throw new GraphValidationError(`CITATION entity_id '${n.entityId}' not found`)
      break
    case GraphEntityType.SETTING:
      if (!SETTING_NAMES.has(n.entityId))
        throw new GraphValidationError(`SETTING entity_id '${n.entityId}' must be one of ${SETTING_NAMES_MESSAGE}`)
      break
  }
}

const checkRefs = (refs: string[], known: Set<string>, what: string): void => {
  for (const r of refs) if (!known.has(r)) throw new GraphValidationError(`${what} '${r}' not found`)
}

// shared by process + landscape graphs: uniqueness across the combined node+edge
// id namespace; prefix rules are enforced separately (process graphs: node:/edge:,
// landscape: namespace dispatch + edge:)
const makeIdClaim = () => {
  const ids = new Set<string>()
  return (id: string, what: 'node' | 'edge'): void => {
    if (!id) throw new GraphValidationError(`${what} has an empty id`)
    if (ids.has(id)) throw new GraphValidationError(`duplicate id '${id}'`)
    ids.add(id)
  }
}

const requireIdPrefix = (id: string, what: 'node' | 'edge', prefix: string): void => {
  if (!id.startsWith(prefix) || id.length === prefix.length)
    throw new GraphValidationError(`${what} id '${id}' must be '${prefix}<stable-id>'`)
}

const wrap = (pfx: string, run: () => void): void => {
  try {
    run()
  } catch (e) {
    if (e instanceof GraphValidationError) throw new Error(`${pfx}: ${e.message}`)
    throw e
  }
}

function assertFlowAcyclic(graph: ProcessGraph): void {
  const targets = new Map<string, string[]>()
  const indegree = new Map<string, number>()
  for (const n of graph.nodes) {
    targets.set(n.id, [])
    indegree.set(n.id, 0)
  }
  for (const e of graph.edges) {
    if (e.kind !== GraphEdgeKind.FLOW) continue
    if (e.sourceNodeId === e.targetNodeId)
      throw new GraphValidationError(`FLOW edge '${e.id}' from '${e.sourceNodeId}' to itself is a cycle`)
    targets.get(e.sourceNodeId)!.push(e.targetNodeId)
    indegree.set(e.targetNodeId, indegree.get(e.targetNodeId)! + 1)
  }
  const queue = [...indegree.entries()].filter(([, d]) => d === 0).map(([id]) => id)
  let processed = 0
  while (queue.length) {
    const id = queue.pop()!
    processed++
    for (const t of targets.get(id)!) {
      const d = indegree.get(t)! - 1
      indegree.set(t, d)
      if (d === 0) queue.push(t)
    }
  }
  if (processed !== graph.nodes.length) {
    const cyclic = [...indegree.entries()].filter(([, d]) => d > 0).map(([id]) => id)
    throw new GraphValidationError(`cycle detected among FLOW edges (nodes involved in or downstream of a cycle: ${cyclic.join(', ')})`)
  }
}

function checkProcessEdgeKind(e: GraphEdge, graphName: ProcessGraphName): void {
  if (!EDGE_KIND_VALUES.has(e.kind)) throw new GraphValidationError(`unknown edge kind '${e.kind}'`)
  if (e.kind === GraphEdgeKind.UNSPECIFIED)
    throw new GraphValidationError('edge kind must be set')
  if (e.kind === GraphEdgeKind.MESSAGE && graphName !== 'operational_graph')
    throw new GraphValidationError('MESSAGE edges are only allowed in operational_graph')
  if (e.kind === GraphEdgeKind.RELATION)
    throw new GraphValidationError('RELATION edges are only allowed in the landscape graph')
}

export function validateProcessGraph(graph: ProcessGraph, ctx: ProcessGraphContext): void {
  const pfx = `${ctx.file}: ${ctx.pathwayId}: ${ctx.graphName}`
  wrap(pfx, () => {
    if (!CYCLE_POLICY_VALUES.has(graph.cyclePolicy))
      throw new GraphValidationError(`unknown cycle_policy '${graph.cyclePolicy}'`)
    if (graph.cyclePolicy === GraphCyclePolicy.UNSPECIFIED)
      throw new GraphValidationError('cycle_policy must be GRAPH_CYCLE_POLICY_ACYCLIC or GRAPH_CYCLE_POLICY_RECYCLE_ALLOWED')

    const claimId = makeIdClaim()

    if (graph.cyclePolicy === GraphCyclePolicy.ACYCLIC) {
      for (const e of graph.edges) {
        if (e.kind === GraphEdgeKind.FEEDBACK)
          throw new GraphValidationError(`edge '${e.id}': FEEDBACK edges require GRAPH_CYCLE_POLICY_RECYCLE_ALLOWED`)
        if (e.kind === GraphEdgeKind.SELF_TRANSITION)
          throw new GraphValidationError(`edge '${e.id}': SELF_TRANSITION edges require GRAPH_CYCLE_POLICY_RECYCLE_ALLOWED`)
      }
    }

    for (const n of graph.nodes) {
      claimId(n.id, 'node')
      requireIdPrefix(n.id, 'node', 'node:')
      try {
        checkNodeEnums(n)
        checkNodeEntity(n, ctx.refs)
        checkRefs(n.materialIds, ctx.refs.materials, 'material_id')
        checkRefs(n.sourceRefs, ctx.refs.citations, 'source_ref')
        for (const mk of n.metricKeys)
          if (!ctx.metricKeys.has(mk))
            throw new GraphValidationError(`metric_key '${mk}' is not 'trl' or a metric of pathway '${ctx.pathwayId}'`)
        if (n.initiallyHidden)
          throw new GraphValidationError('initially_hidden is only allowed on landscape material nodes')
      } catch (e) {
        if (e instanceof GraphValidationError) throw new GraphValidationError(`${n.id}: ${e.message}`)
        throw e
      }
    }

    const nodeIds = new Set(graph.nodes.map((n) => n.id))
    for (const edge of graph.edges) {
      claimId(edge.id, 'edge')
      requireIdPrefix(edge.id, 'edge', 'edge:')
      try {
        if (!nodeIds.has(edge.sourceNodeId))
          throw new GraphValidationError(`source_node_id '${edge.sourceNodeId}' not found`)
        if (!nodeIds.has(edge.targetNodeId))
          throw new GraphValidationError(`target_node_id '${edge.targetNodeId}' not found`)
        checkRefs(edge.sourceRefs, ctx.refs.citations, 'source_ref')
        checkProcessEdgeKind(edge, ctx.graphName)
        if (edge.kind === GraphEdgeKind.SELF_TRANSITION && edge.sourceNodeId !== edge.targetNodeId)
          throw new GraphValidationError('SELF_TRANSITION source and target must be the same node')
      } catch (e) {
        if (e instanceof GraphValidationError) throw new GraphValidationError(`${edge.id}: ${e.message}`)
        throw e
      }
    }

    assertFlowAcyclic(graph)
  })
}

const PATHWAY_NS = 'pathway:'
const SETTING_NS = 'setting:'
const MATERIAL_NS = 'material:'

export function validateLandscapeGraph(graph: LandscapeGraph, ctx: LandscapeGraphContext): void {
  const pfx = `${ctx.file}: landscape`
  wrap(pfx, () => {
    const claimId = makeIdClaim()
    const pathwayNodeIds = new Set<string>()

    for (const n of graph.nodes) {
      claimId(n.id, 'node')
      try {
        checkNodeEnums(n)
        if (n.id.startsWith(PATHWAY_NS)) {
          const pid = n.id.slice(PATHWAY_NS.length)
          if (n.entityType !== GraphEntityType.PATHWAY || n.entityId !== pid)
            throw new GraphValidationError(`pathway node '${n.id}' must have entity_type PATHWAY and entity_id '${pid}'`)
          if (!ctx.refs.pathways.has(pid))
            throw new GraphValidationError(`pathway '${pid}' not found`)
          pathwayNodeIds.add(pid)
          const allowed = ctx.pathwayMetricKeys.get(pid)
          for (const mk of n.metricKeys)
            if (!allowed || !allowed.has(mk))
              throw new GraphValidationError(`metric_key '${mk}' is not 'trl' or a metric of pathway '${pid}'`)
          if (n.initiallyHidden)
            throw new GraphValidationError('initially_hidden is only allowed on landscape material nodes')
        } else if (n.id.startsWith(SETTING_NS)) {
          const name = n.id.slice(SETTING_NS.length)
          if (n.entityType !== GraphEntityType.SETTING || n.entityId !== name)
            throw new GraphValidationError(`setting node '${n.id}' must have entity_type SETTING and entity_id '${name}'`)
          if (!SETTING_NAMES.has(name))
            throw new GraphValidationError(`'${name}' is not a valid Setting name (one of ${SETTING_NAMES_MESSAGE})`)
          if (n.metricKeys.length)
            throw new GraphValidationError('only pathway nodes may carry metric_keys')
          if (n.initiallyHidden)
            throw new GraphValidationError('initially_hidden is only allowed on landscape material nodes')
        } else if (n.id.startsWith(MATERIAL_NS)) {
          const mid = n.id.slice(MATERIAL_NS.length)
          if (n.entityType !== GraphEntityType.MATERIAL || n.entityId !== mid)
            throw new GraphValidationError(`material node '${n.id}' must have entity_type MATERIAL and entity_id '${mid}'`)
          if (!ctx.refs.materials.has(mid))
            throw new GraphValidationError(`material '${mid}' not found`)
          if (n.metricKeys.length)
            throw new GraphValidationError('only pathway nodes may carry metric_keys')
        } else {
          throw new GraphValidationError(`landscape node id '${n.id}' must be '${PATHWAY_NS}<pathway-id>', '${SETTING_NS}<SETTING>' or '${MATERIAL_NS}<material-id>'`)
        }
        checkRefs(n.materialIds, ctx.refs.materials, 'material_id')
        checkRefs(n.sourceRefs, ctx.refs.citations, 'source_ref')
      } catch (e) {
        if (e instanceof GraphValidationError) throw new GraphValidationError(`${n.id}: ${e.message}`)
        throw e
      }
    }

    const nodeIds = new Set(graph.nodes.map((n) => n.id))
    for (const edge of graph.edges) {
      claimId(edge.id, 'edge')
      requireIdPrefix(edge.id, 'edge', 'edge:')
      try {
        if (!nodeIds.has(edge.sourceNodeId))
          throw new GraphValidationError(`source_node_id '${edge.sourceNodeId}' not found`)
        if (!nodeIds.has(edge.targetNodeId))
          throw new GraphValidationError(`target_node_id '${edge.targetNodeId}' not found`)
        if (edge.kind !== GraphEdgeKind.RELATION)
          throw new GraphValidationError(`only RELATION edges are allowed in the landscape graph (got ${edgeKindName(edge.kind)})`)
        checkRefs(edge.sourceRefs, ctx.refs.citations, 'source_ref')
      } catch (e) {
        if (e instanceof GraphValidationError) throw new GraphValidationError(`${edge.id}: ${e.message}`)
        throw e
      }
    }

    const missing = [...ctx.refs.pathways].filter((pid) => !pathwayNodeIds.has(pid))
    if (missing.length)
      throw new GraphValidationError(`pathway '${missing[0]}' has no pathway node (missing: ${missing.join(', ')})`)
  })
}
