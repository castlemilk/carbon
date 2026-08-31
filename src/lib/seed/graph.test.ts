import { describe, it, expect } from 'vitest'
import { create, fromJson, toJson } from '@bufbuild/protobuf'
import type { JsonObject } from '@bufbuild/protobuf'
import {
  ProcessGraphSchema,
  GraphNodeSchema,
  GraphCyclePolicy,
  GraphEdgeKind,
  GraphEntityType,
  GraphNodeKind,
  GraphStage,
} from '@/lib/gen/carbon/v1/graph_pb'
import { LandscapeGraphSchema } from '@/lib/gen/carbon/v1/landscape_pb'
import { PathwaySchema } from '@/lib/gen/carbon/v1/pathway_pb'
import { validateProcessGraph, validateLandscapeGraph, SETTING_NAMES } from './graph'

const acyclicGraph: JsonObject = {
  cycle_policy: 'GRAPH_CYCLE_POLICY_ACYCLIC',
  nodes: [
    {
      id: 'node:input-air',
      label: 'Air intake',
      kind: 'GRAPH_NODE_KIND_INPUT',
      stage: 'GRAPH_STAGE_INPUT',
      entity_type: 'GRAPH_ENTITY_TYPE_PATHWAY',
      entity_id: 'mof-dac',
      material_ids: ['mg2dobpdc'],
      source_refs: ['mcqueen2021'],
      metric_keys: ['cost'],
      order: 1,
    },
    {
      id: 'node:capture-bed',
      label: 'Sorption bed',
      kind: 'GRAPH_NODE_KIND_CAPTURE',
      stage: 'GRAPH_STAGE_CAPTURE',
      asset_id: 'asset:bed-01',
      source_refs: ['mcqueen2021'],
      order: 2,
    },
  ],
  edges: [
    {
      id: 'edge:e1',
      source_node_id: 'node:input-air',
      target_node_id: 'node:capture-bed',
      kind: 'GRAPH_EDGE_KIND_FLOW',
      label: 'air',
    },
  ],
}

const recycleGraph: JsonObject = {
  cycle_policy: 'GRAPH_CYCLE_POLICY_RECYCLE_ALLOWED',
  nodes: [
    { id: 'node:sorb', label: 'Sorbent', kind: 'GRAPH_NODE_KIND_MATERIAL', stage: 'GRAPH_STAGE_CAPTURE' },
    { id: 'node:regen', label: 'Regeneration', kind: 'GRAPH_NODE_KIND_REGENERATION', stage: 'GRAPH_STAGE_REGENERATION' },
  ],
  edges: [
    { id: 'edge:f1', source_node_id: 'node:sorb', target_node_id: 'node:regen', kind: 'GRAPH_EDGE_KIND_FLOW' },
    { id: 'edge:fb1', source_node_id: 'node:regen', target_node_id: 'node:sorb', kind: 'GRAPH_EDGE_KIND_FEEDBACK', label: 'revived sorbent' },
    { id: 'edge:st1', source_node_id: 'node:sorb', target_node_id: 'node:sorb', kind: 'GRAPH_EDGE_KIND_SELF_TRANSITION', label: 'saturation' },
  ],
}

const operationalGraph: JsonObject = {
  cycle_policy: 'GRAPH_CYCLE_POLICY_ACYCLIC',
  nodes: [
    { id: 'node:op-valve', label: 'Valve controller', kind: 'GRAPH_NODE_KIND_TRANSPORT', stage: 'GRAPH_STAGE_TRANSPORT' },
    { id: 'node:op-bed', label: 'Bed', kind: 'GRAPH_NODE_KIND_CAPTURE', stage: 'GRAPH_STAGE_CAPTURE' },
  ],
  edges: [
    { id: 'edge:m1', source_node_id: 'node:op-valve', target_node_id: 'node:op-bed', kind: 'GRAPH_EDGE_KIND_MESSAGE', label: 'open' },
  ],
}

const landscapeFixture: JsonObject = {
  nodes: [
    {
      id: 'pathway:mof-dac',
      label: 'MOF capture',
      kind: 'GRAPH_NODE_KIND_CAPTURE',
      entity_type: 'GRAPH_ENTITY_TYPE_PATHWAY',
      entity_id: 'mof-dac',
      metric_keys: ['cost'],
    },
    {
      id: 'setting:DAC',
      label: 'Direct air capture',
      kind: 'GRAPH_NODE_KIND_UNSPECIFIED',
      entity_type: 'GRAPH_ENTITY_TYPE_SETTING',
      entity_id: 'DAC',
    },
    {
      id: 'material:mg2dobpdc',
      label: 'Sorbent context',
      kind: 'GRAPH_NODE_KIND_MATERIAL',
      entity_type: 'GRAPH_ENTITY_TYPE_MATERIAL',
      entity_id: 'mg2dobpdc',
      summary: 'MOF sorbent providing capture capacity',
      initially_hidden: true,
    },
  ],
  edges: [
    {
      id: 'edge:rel1',
      source_node_id: 'material:mg2dobpdc',
      target_node_id: 'pathway:mof-dac',
      kind: 'GRAPH_EDGE_KIND_RELATION',
    },
  ],
}

describe('graph protojson round-trip', () => {
  it('round-trips an acyclic process graph with full node fields', () => {
    const g = fromJson(ProcessGraphSchema, acyclicGraph)
    expect(g.cyclePolicy).toBe(GraphCyclePolicy.ACYCLIC)
    expect(g.nodes).toHaveLength(2)
    expect(g.nodes[0]!.kind).toBe(GraphNodeKind.INPUT)
    expect(g.nodes[0]!.stage).toBe(GraphStage.INPUT)
    expect(g.nodes[0]!.entityType).toBe(GraphEntityType.PATHWAY)
    expect(g.nodes[0]!.materialIds).toEqual(['mg2dobpdc'])
    expect(g.nodes[0]!.metricKeys).toEqual(['cost'])
    expect(g.nodes[0]!.order).toBe(1)
    expect(g.nodes[1]!.assetId).toBe('asset:bed-01')
    expect(g.edges[0]!.kind).toBe(GraphEdgeKind.FLOW)

    const back = toJson(ProcessGraphSchema, g, { useProtoFieldName: true }) as {
      cycle_policy: string
      nodes: { source_refs: string[]; metric_keys: string[]; asset_id?: string }[]
      edges: { source_node_id: string; target_node_id: string }[]
    }
    expect(back.cycle_policy).toBe('GRAPH_CYCLE_POLICY_ACYCLIC')
    expect(back.nodes[0]!.source_refs).toEqual(['mcqueen2021'])
    expect(back.nodes[0]!.metric_keys).toEqual(['cost'])
    expect(back.nodes[1]!.asset_id).toBe('asset:bed-01')
    expect(back.edges[0]!.source_node_id).toBe('node:input-air')
    expect(back.edges[0]!.target_node_id).toBe('node:capture-bed')
  })

  it('round-trips a recycle-allowed graph with feedback and self-transition edges', () => {
    const g = fromJson(ProcessGraphSchema, recycleGraph)
    expect(g.cyclePolicy).toBe(GraphCyclePolicy.RECYCLE_ALLOWED)
    expect(g.edges.map((e) => e.kind)).toEqual([
      GraphEdgeKind.FLOW,
      GraphEdgeKind.FEEDBACK,
      GraphEdgeKind.SELF_TRANSITION,
    ])
    const self = g.edges[2]!
    expect(self.sourceNodeId).toBe(self.targetNodeId)
    const back = toJson(ProcessGraphSchema, g, { useProtoFieldName: true }) as {
      cycle_policy: string
      edges: { kind: string; label: string }[]
    }
    expect(back.cycle_policy).toBe('GRAPH_CYCLE_POLICY_RECYCLE_ALLOWED')
    expect(back.edges[1]!.kind).toBe('GRAPH_EDGE_KIND_FEEDBACK')
    expect(back.edges[2]!.kind).toBe('GRAPH_EDGE_KIND_SELF_TRANSITION')
    expect(back.edges[2]!.label).toBe('saturation')
  })

  it('round-trips an operational graph with MESSAGE edges', () => {
    const g = fromJson(ProcessGraphSchema, operationalGraph)
    expect(g.edges[0]!.kind).toBe(GraphEdgeKind.MESSAGE)
    const back = toJson(ProcessGraphSchema, g, { useProtoFieldName: true }) as {
      edges: { kind: string; label: string }[]
    }
    expect(back.edges[0]!.kind).toBe('GRAPH_EDGE_KIND_MESSAGE')
    expect(back.edges[0]!.label).toBe('open')
  })

  it('round-trips a namespaced landscape graph with an initially-hidden material node', () => {
    const lg = fromJson(LandscapeGraphSchema, landscapeFixture)
    const hidden = lg.nodes.find((n) => n.initiallyHidden)
    expect(hidden).toBeDefined()
    expect(hidden!.entityType).toBe(GraphEntityType.MATERIAL)
    expect(hidden!.entityId).toBe('mg2dobpdc')
    const setting = lg.nodes.find((n) => n.entityType === GraphEntityType.SETTING)
    expect(setting!.entityId).toBe('DAC')
    expect(lg.edges[0]!.kind).toBe(GraphEdgeKind.RELATION)
    const back = toJson(LandscapeGraphSchema, lg, { useProtoFieldName: true }) as {
      nodes: { id: string; initially_hidden?: boolean; summary?: string; metric_keys?: string[] }[]
      edges: { source_node_id: string }[]
    }
    expect(back.nodes.map((n) => n.id)).toContain('pathway:mof-dac')
    expect(back.nodes.find((n) => n.id === 'pathway:mof-dac')!.metric_keys).toEqual(['cost'])
    expect(back.nodes.find((n) => n.initially_hidden)!.id).toBe('material:mg2dobpdc')
    expect(back.nodes.find((n) => n.initially_hidden)!.summary).toBe('MOF sorbent providing capture capacity')
    expect(back.edges[0]!.source_node_id).toBe('material:mg2dobpdc')
  })

  it('GraphNode schema round-trips a single node from protojson', () => {
    const materialNode = (landscapeFixture.nodes as JsonObject[]).find((n) => n.id === 'material:mg2dobpdc')!
    const node = fromJson(GraphNodeSchema, materialNode)
    expect(node.kind).toBe(GraphNodeKind.MATERIAL)
    expect(node.initiallyHidden).toBe(true)
    expect(node.summary).toBe('MOF sorbent providing capture capacity')
  })

  it('Pathway carries process_graph and operational_graph at fields 15/16', () => {
    const doc = {
      id: 'mof-dac',
      name: 'MOF DAC',
      setting: 'DAC',
      trl: 5,
      mermaid_source: 'flowchart LR\n  A --> B',
      process_graph: acyclicGraph,
      operational_graph: operationalGraph,
    }
    const p = fromJson(PathwaySchema, doc)
    expect(p.mermaidSource).toContain('flowchart')
    expect(p.processGraph?.cyclePolicy).toBe(GraphCyclePolicy.ACYCLIC)
    expect(p.processGraph?.nodes).toHaveLength(2)
    expect(p.operationalGraph?.edges[0]!.kind).toBe(GraphEdgeKind.MESSAGE)
    const back = toJson(PathwaySchema, p, { useProtoFieldName: true }) as {
      mermaid_source: string
      process_graph: { cycle_policy: string }
      operational_graph: { edges: { kind: string }[] }
    }
    expect(back.mermaid_source).toContain('flowchart')
    expect(back.process_graph.cycle_policy).toBe('GRAPH_CYCLE_POLICY_ACYCLIC')
    expect(back.operational_graph.edges[0]!.kind).toBe('GRAPH_EDGE_KIND_MESSAGE')
  })

  it('LandscapeGraph type is exported and constructible', () => {
    const lg = create(LandscapeGraphSchema)
    expect(lg.nodes).toEqual([])
    expect(lg.edges).toEqual([])
  })
})

const refs = {
  citations: new Set(['mcqueen2021']),
  materials: new Set(['mg2dobpdc']),
  pathways: new Set(['mof-dac']),
}

const node = (id: string, extra: JsonObject = {}): JsonObject => ({
  id,
  label: id,
  kind: 'GRAPH_NODE_KIND_CAPTURE',
  stage: 'GRAPH_STAGE_CAPTURE',
  ...extra,
})

const edge = (id: string, source: string, target: string, extra: JsonObject = {}): JsonObject => ({
  id,
  source_node_id: source,
  target_node_id: target,
  kind: 'GRAPH_EDGE_KIND_FLOW',
  ...extra,
})

const proc = (nodes: JsonObject[], edges: JsonObject[], cyclePolicy: string = 'GRAPH_CYCLE_POLICY_ACYCLIC'): JsonObject => ({
  ...(cyclePolicy ? { cycle_policy: cyclePolicy } : {}),
  nodes,
  edges,
})

const checkProc = (json: JsonObject, ctxOver: Record<string, unknown> = {}) => {
  validateProcessGraph(fromJson(ProcessGraphSchema, json), {
    file: 'pathways/mof-dac.yaml',
    pathwayId: 'mof-dac',
    graphName: 'process_graph',
    refs,
    metricKeys: new Set(['trl', 'cost']),
    ...ctxOver,
  })
}

const checkLandscape = (json: JsonObject, ctxOver: Record<string, unknown> = {}) => {
  validateLandscapeGraph(fromJson(LandscapeGraphSchema, json), {
    file: 'landscape.yaml',
    refs,
    pathwayMetricKeys: new Map([['mof-dac', new Set(['trl', 'cost'])]]),
    ...ctxOver,
  })
}

describe('process graph validation', () => {
  it('accepts the committed acyclic fixture', () => {
    expect(() => checkProc(acyclicGraph)).not.toThrow()
  })

  it('rejects an empty node id', () => {
    expect(() => checkProc(proc([node('')], []))).toThrow(/empty id/)
  })

  it('rejects duplicate node ids and node/edge id collisions in one namespace', () => {
    expect(() => checkProc(proc([node('node:a'), node('node:a')], []))).toThrow(/duplicate id 'node:a'/)
    expect(() => checkProc(proc([node('node:x')], [edge('node:x', 'node:x', 'node:x')])))
      .toThrow(/duplicate id 'node:x'/)
    expect(() => checkProc(proc([node('node:a')], [edge('edge:a', 'node:a', 'node:a'), edge('edge:a', 'node:a', 'node:a')])))
      .toThrow(/duplicate id 'edge:a'/)
  })

  it('requires the node:/edge: id prefixes', () => {
    expect(() => checkProc(proc([node('input-air')], []))).toThrow(/'input-air' must be 'node:<stable-id>'/)
    expect(() => checkProc(proc([node('node:a')], [edge('e1', 'node:a', 'node:a')])))
      .toThrow(/'e1' must be 'edge:<stable-id>'/)
    expect(() => checkProc(proc([node('node:')], []))).toThrow(/must be 'node:<stable-id>'/)
  })

  it('requires a non-unspecified cycle_policy', () => {
    expect(() => checkProc(proc([node('node:a')], [], ''))).toThrow(/cycle_policy must be/)
  })

  it('rejects unknown enum values', () => {
    const unknownKind = fromJson(ProcessGraphSchema, proc([node('node:a')], []))
    unknownKind.nodes[0]!.kind = 999 as GraphNodeKind
    expect(() => validateProcessGraph(unknownKind, {
      file: 'pathways/mof-dac.yaml', pathwayId: 'mof-dac', graphName: 'process_graph', refs,
      metricKeys: new Set(['trl', 'cost']),
    })).toThrow(/unknown node kind/)

    const unknownEntity = fromJson(ProcessGraphSchema, proc([node('node:a')], []))
    unknownEntity.nodes[0]!.entityType = 999 as GraphEntityType
    expect(() => validateProcessGraph(unknownEntity, {
      file: 'pathways/mof-dac.yaml', pathwayId: 'mof-dac', graphName: 'process_graph', refs,
      metricKeys: new Set(['trl', 'cost']),
    })).toThrow(/unknown entity_type/)
  })

  it('rejects edges referencing unknown nodes', () => {
    expect(() => checkProc(proc([node('node:a')], [edge('edge:e', 'node:ghost', 'node:a')])))
      .toThrow(/edge:e: source_node_id 'node:ghost' not found/)
    expect(() => checkProc(proc([node('node:a')], [edge('edge:e', 'node:a', 'node:ghost')])))
      .toThrow(/edge:e: target_node_id 'node:ghost' not found/)
  })

  it('rejects entity ids missing from the seed sets', () => {
    const withEntity = (entityType: string, entityId: string) =>
      checkProc(proc([node('node:a', { entity_type: entityType, entity_id: entityId })], []))
    expect(() => withEntity('GRAPH_ENTITY_TYPE_PATHWAY', 'ghost-pathway')).toThrow(/PATHWAY entity_id 'ghost-pathway' not found/)
    expect(() => withEntity('GRAPH_ENTITY_TYPE_MATERIAL', 'ghost')).toThrow(/MATERIAL entity_id 'ghost' not found/)
    expect(() => withEntity('GRAPH_ENTITY_TYPE_CITATION', 'ghost2020')).toThrow(/CITATION entity_id 'ghost2020' not found/)
    expect(() => withEntity('GRAPH_ENTITY_TYPE_SETTING', 'BOGUS')).toThrow(/SETTING entity_id 'BOGUS'/)
    expect(() => withEntity('GRAPH_ENTITY_TYPE_SETTING', 'DAC')).not.toThrow()
  })

  it('rejects entity presence/absence mismatches', () => {
    expect(() => checkProc(proc([node('node:a', { entity_id: 'mof-dac' })], [])))
      .toThrow(/entity_id must be empty when entity_type is UNSPECIFIED/)
    expect(() => checkProc(proc([node('node:a', { entity_type: 'GRAPH_ENTITY_TYPE_PATHWAY' })], [])))
      .toThrow(/entity_type PATHWAY requires a non-empty entity_id/)
  })

  it('rejects unknown node material_ids and node/edge source_refs', () => {
    expect(() => checkProc(proc([node('node:a', { material_ids: ['ghost'] })], []))).toThrow(/material_id 'ghost' not found/)
    expect(() => checkProc(proc([node('node:a', { source_refs: ['ghost2020'] })], []))).toThrow(/source_ref 'ghost2020' not found/)
    expect(() => checkProc(proc([node('node:a')], [edge('edge:e', 'node:a', 'node:a', { source_refs: ['ghost2020'] })])))
      .toThrow(/source_ref 'ghost2020' not found/)
  })

  it('validates metric_keys against trl + the containing pathway metrics', () => {
    expect(() => checkProc(proc([node('node:a', { metric_keys: ['bogus'] })], [])))
      .toThrow(/metric_key 'bogus' is not 'trl' or a metric of pathway 'mof-dac'/)
    expect(() => checkProc(proc([node('node:a', { metric_keys: ['trl'] })], []))).not.toThrow()
    expect(() => checkProc(proc([node('node:a', { metric_keys: ['cost'] })], []))).not.toThrow()
  })

  it('rejects initially_hidden on process graph nodes', () => {
    expect(() => checkProc(proc([node('node:a', { initially_hidden: true })], [])))
      .toThrow(/initially_hidden is only allowed on landscape material nodes/)
  })

  it('restricts edge kinds per graph type', () => {
    expect(() => checkProc(proc([node('node:a')], [edge('edge:e', 'node:a', 'node:a', { kind: 'GRAPH_EDGE_KIND_MESSAGE' })])))
      .toThrow(/MESSAGE edges are only allowed in operational_graph/)
    expect(() => checkProc(proc([node('node:a')], [edge('edge:e', 'node:a', 'node:a', { kind: 'GRAPH_EDGE_KIND_RELATION' })])))
      .toThrow(/RELATION edges are only allowed in the landscape graph/)
    expect(() => checkProc(proc([node('node:a'), node('node:b')], [edge('edge:e', 'node:a', 'node:b')], 'GRAPH_CYCLE_POLICY_ACYCLIC')))
      .not.toThrow()
    expect(() => checkProc(proc([node('node:a')], [edge('edge:e', 'node:a', 'node:a', { kind: 'GRAPH_EDGE_KIND_MESSAGE' })], 'GRAPH_CYCLE_POLICY_RECYCLE_ALLOWED')))
      .toThrow(/MESSAGE edges are only allowed in operational_graph/)
  })

  it('rejects unspecified edge kinds', () => {
    expect(() => checkProc(proc([node('node:a')], [edge('edge:e', 'node:a', 'node:a', { kind: 'GRAPH_EDGE_KIND_UNSPECIFIED' })], 'GRAPH_CYCLE_POLICY_RECYCLE_ALLOWED')))
      .toThrow(/edge kind must be set/)
  })

  it('allows MESSAGE and rejects RELATION in operational graphs', () => {
    const ctx = { graphName: 'operational_graph' as const }
    expect(() => checkProc(proc([node('node:a'), node('node:b')],
      [edge('edge:m', 'node:a', 'node:b', { kind: 'GRAPH_EDGE_KIND_MESSAGE' })]), ctx)).not.toThrow()
    expect(() => checkProc(proc([node('node:a')], [edge('edge:e', 'node:a', 'node:a', { kind: 'GRAPH_EDGE_KIND_RELATION' })]), ctx))
      .toThrow(/RELATION edges are only allowed in the landscape graph/)
  })

  it('requires SELF_TRANSITION endpoints to match', () => {
    expect(() => checkProc(proc([node('node:a'), node('node:b')],
      [edge('edge:st', 'node:a', 'node:b', { kind: 'GRAPH_EDGE_KIND_SELF_TRANSITION' })], 'GRAPH_CYCLE_POLICY_RECYCLE_ALLOWED')))
      .toThrow(/SELF_TRANSITION source and target must be the same node/)
  })

  it('ACYCLIC rejects FEEDBACK and SELF_TRANSITION edges', () => {
    expect(() => checkProc(proc([node('node:a'), node('node:b')],
      [edge('edge:f', 'node:b', 'node:a', { kind: 'GRAPH_EDGE_KIND_FEEDBACK' })], 'GRAPH_CYCLE_POLICY_ACYCLIC')))
      .toThrow(/FEEDBACK edges require GRAPH_CYCLE_POLICY_RECYCLE_ALLOWED/)
    expect(() => checkProc(proc([node('node:a')],
      [edge('edge:st', 'node:a', 'node:a', { kind: 'GRAPH_EDGE_KIND_SELF_TRANSITION' })], 'GRAPH_CYCLE_POLICY_ACYCLIC')))
      .toThrow(/SELF_TRANSITION edges require GRAPH_CYCLE_POLICY_RECYCLE_ALLOWED/)
  })

  it('ACYCLIC rejects cycles and self-edges among FLOW edges', () => {
    const ring = proc(
      [node('node:a'), node('node:b')],
      [edge('edge:1', 'node:a', 'node:b'), edge('edge:2', 'node:b', 'node:a')],
      'GRAPH_CYCLE_POLICY_ACYCLIC',
    )
    expect(() => checkProc(ring)).toThrow(/cycle detected among FLOW edges/)
    expect(() => checkProc(proc([node('node:a')], [edge('edge:1', 'node:a', 'node:a')], 'GRAPH_CYCLE_POLICY_ACYCLIC')))
      .toThrow(/FLOW edge 'edge:1' from 'node:a' to itself is a cycle/)
  })

  it('RECYCLE_ALLOWED accepts feedback and self-transitions when FLOW edges are acyclic', () => {
    expect(() => checkProc(proc(
      [node('node:sorb'), node('node:regen')],
      [
        edge('edge:f1', 'node:sorb', 'node:regen'),
        edge('edge:fb1', 'node:regen', 'node:sorb', { kind: 'GRAPH_EDGE_KIND_FEEDBACK' }),
        edge('edge:st1', 'node:sorb', 'node:sorb', { kind: 'GRAPH_EDGE_KIND_SELF_TRANSITION' }),
      ],
      'GRAPH_CYCLE_POLICY_RECYCLE_ALLOWED'),
    )).not.toThrow()
  })

  it('RECYCLE_ALLOWED still rejects cycles among FLOW edges', () => {
    expect(() => checkProc(proc(
      [node('node:a'), node('node:b')],
      [edge('edge:1', 'node:a', 'node:b'), edge('edge:2', 'node:b', 'node:a')],
      'GRAPH_CYCLE_POLICY_RECYCLE_ALLOWED'),
    )).toThrow(/cycle detected among FLOW edges/)
  })

  it('ignores MESSAGE edges when checking cycles in operational graphs', () => {
    expect(() => checkProc(proc(
      [node('node:a'), node('node:b')],
      [
        edge('edge:m1', 'node:a', 'node:b', { kind: 'GRAPH_EDGE_KIND_MESSAGE' }),
        edge('edge:m2', 'node:b', 'node:a', { kind: 'GRAPH_EDGE_KIND_MESSAGE' }),
      ],
      'GRAPH_CYCLE_POLICY_ACYCLIC',
    ), { graphName: 'operational_graph' })).not.toThrow()
  })
})

describe('landscape graph validation', () => {
  it('accepts the committed landscape fixture', () => {
    expect(() => checkLandscape(landscapeFixture)).not.toThrow()
  })

  it('exposes Setting enum names (minus UNSPECIFIED) for entity validation', () => {
    expect(SETTING_NAMES.has('DAC')).toBe(true)
    expect(SETTING_NAMES.has('POINT_SOURCE')).toBe(true)
    expect(SETTING_NAMES.has('SETTING_UNSPECIFIED')).toBe(false)
    expect(SETTING_NAMES.has('2')).toBe(false)
    expect(SETTING_NAMES.has('0')).toBe(false)
  })

  it('requires pathway:/setting:/material: namespaces with matching entity type and id', () => {
    expect(() => checkLandscape({ nodes: [node('mof-dac')], edges: [] }))
      .toThrow(/must be 'pathway:<pathway-id>', 'setting:<SETTING>' or 'material:<material-id>'/)
    expect(() => checkLandscape({
      nodes: [node('pathway:mof-dac', { entity_type: 'GRAPH_ENTITY_TYPE_MATERIAL', entity_id: 'mg2dobpdc' })], edges: [],
    })).toThrow(/pathway node 'pathway:mof-dac' must have entity_type PATHWAY and entity_id 'mof-dac'/)
    expect(() => checkLandscape({
      nodes: [node('pathway:mof-dac', { entity_type: 'GRAPH_ENTITY_TYPE_PATHWAY', entity_id: 'z-late' })], edges: [],
    })).toThrow(/must have entity_type PATHWAY and entity_id 'mof-dac'/)
    expect(() => checkLandscape({
      nodes: [node('setting:DAC', { entity_type: 'GRAPH_ENTITY_TYPE_SETTING', entity_id: 'DAC' }), node('pathway:mof-dac', { entity_type: 'GRAPH_ENTITY_TYPE_PATHWAY', entity_id: 'mof-dac' })], edges: [],
    })).not.toThrow()
    expect(() => checkLandscape({
      nodes: [node('setting:OCEAN_DIC', { entity_type: 'GRAPH_ENTITY_TYPE_SETTING', entity_id: 'DAC' })], edges: [],
    })).toThrow(/setting node 'setting:OCEAN_DIC' must have entity_type SETTING and entity_id 'OCEAN_DIC'/)
  })

  it('rejects pathway/setting/material nodes referencing unknown entities', () => {
    expect(() => checkLandscape({ nodes: [node('pathway:ghost', { entity_type: 'GRAPH_ENTITY_TYPE_PATHWAY', entity_id: 'ghost' })], edges: [] }))
      .toThrow(/pathway 'ghost' not found/)
    expect(() => checkLandscape({ nodes: [node('setting:BOGUS', { entity_type: 'GRAPH_ENTITY_TYPE_SETTING', entity_id: 'BOGUS' })], edges: [] }))
      .toThrow(/is not a valid Setting name/)
    expect(() => checkLandscape({ nodes: [node('material:ghost', { entity_type: 'GRAPH_ENTITY_TYPE_MATERIAL', entity_id: 'ghost' })], edges: [] }))
      .toThrow(/material 'ghost' not found/)
  })

  it('rejects Setting entity_ids that are numeric reverse-mapping keys', () => {
    expect(() => checkLandscape({ nodes: [node('setting:2', { entity_type: 'GRAPH_ENTITY_TYPE_SETTING', entity_id: '2' })], edges: [] }))
      .toThrow(/is not a valid Setting name/)
  })

  it('rejects empty and duplicate ids across nodes and edges', () => {
    expect(() => checkLandscape({ nodes: [node('')], edges: [] })).toThrow(/empty id/)
    expect(() => checkLandscape({
      nodes: [node('pathway:mof-dac', { entity_type: 'GRAPH_ENTITY_TYPE_PATHWAY', entity_id: 'mof-dac' }), node('pathway:mof-dac', { entity_type: 'GRAPH_ENTITY_TYPE_PATHWAY', entity_id: 'mof-dac' })],
      edges: [],
    })).toThrow(/duplicate id 'pathway:mof-dac'/)
    expect(() => checkLandscape({
      nodes: [node('setting:DAC', { entity_type: 'GRAPH_ENTITY_TYPE_SETTING', entity_id: 'DAC' })],
      edges: [
        edge('edge:r1', 'setting:DAC', 'setting:DAC', { kind: 'GRAPH_EDGE_KIND_RELATION' }),
        edge('edge:r1', 'setting:DAC', 'setting:DAC', { kind: 'GRAPH_EDGE_KIND_RELATION' }),
      ],
    })).toThrow(/duplicate id 'edge:r1'/)
  })

  it('requires edge: prefixed ids, existing endpoints and RELATION edges', () => {
    expect(() => checkLandscape({
      nodes: [node('setting:DAC', { entity_type: 'GRAPH_ENTITY_TYPE_SETTING', entity_id: 'DAC' })],
      edges: [edge('rel-1', 'setting:DAC', 'setting:DAC', { kind: 'GRAPH_EDGE_KIND_RELATION' })],
    })).toThrow(/must be 'edge:<stable-id>'/)
    expect(() => checkLandscape({
      nodes: [node('setting:DAC', { entity_type: 'GRAPH_ENTITY_TYPE_SETTING', entity_id: 'DAC' })],
      edges: [edge('edge:r', 'setting:ghost', 'setting:DAC', { kind: 'GRAPH_EDGE_KIND_RELATION' })],
    })).toThrow(/edge:r: source_node_id 'setting:ghost' not found/)
    expect(() => checkLandscape({
      nodes: [node('setting:DAC', { entity_type: 'GRAPH_ENTITY_TYPE_SETTING', entity_id: 'DAC' })],
      edges: [edge('edge:r', 'setting:DAC', 'setting:DAC')],
    })).toThrow(/only RELATION edges are allowed in the landscape graph/)
  })

  it('allows initially_hidden only on material nodes and metric_keys only on pathway nodes', () => {
    expect(() => checkLandscape({
      nodes: [node('pathway:mof-dac', { entity_type: 'GRAPH_ENTITY_TYPE_PATHWAY', entity_id: 'mof-dac', initially_hidden: true })],
      edges: [],
    })).toThrow(/initially_hidden is only allowed on landscape material nodes/)
    expect(() => checkLandscape({
      nodes: [node('setting:DAC', { entity_type: 'GRAPH_ENTITY_TYPE_SETTING', entity_id: 'DAC', metric_keys: ['cost'] })],
      edges: [],
    })).toThrow(/only pathway nodes may carry metric_keys/)
    expect(() => checkLandscape({
      nodes: [node('pathway:mof-dac', { entity_type: 'GRAPH_ENTITY_TYPE_PATHWAY', entity_id: 'mof-dac', metric_keys: ['ghost-metric'] })],
      edges: [],
    })).toThrow(/metric_key 'ghost-metric' is not 'trl' or a metric of pathway 'mof-dac'/)
  })

  it('requires exactly one pathway node per loaded pathway', () => {
    const twoPathways = {
      refs: { ...refs, pathways: new Set(['mof-dac', 'z-late']) },
      pathwayMetricKeys: new Map([['mof-dac', new Set(['trl', 'cost'])], ['z-late', new Set(['trl'])]]),
    }
    expect(() => checkLandscape({
      nodes: [node('pathway:mof-dac', { entity_type: 'GRAPH_ENTITY_TYPE_PATHWAY', entity_id: 'mof-dac' })],
      edges: [],
    }, twoPathways)).toThrow(/pathway 'z-late' has no pathway node/)
    expect(() => checkLandscape({
      nodes: [
        node('pathway:mof-dac', { entity_type: 'GRAPH_ENTITY_TYPE_PATHWAY', entity_id: 'mof-dac' }),
        node('pathway:z-late', { entity_type: 'GRAPH_ENTITY_TYPE_PATHWAY', entity_id: 'z-late' }),
        node('pathway:z-late', { entity_type: 'GRAPH_ENTITY_TYPE_PATHWAY', entity_id: 'z-late', label: 'dup' }),
      ],
      edges: [],
    }, twoPathways)).toThrow(/duplicate id 'pathway:z-late'/)
  })
})
