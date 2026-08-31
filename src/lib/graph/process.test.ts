import { describe, it, expect } from 'vitest'
import { fromJson, type JsonObject } from '@bufbuild/protobuf'
import {
  ProcessGraphSchema,
  type ProcessGraph,
} from '@/lib/gen/carbon/v1/graph_pb'

import {
  buildProcessDto,
  type ProcessLookups,
} from './process'

const baseLookups: ProcessLookups = {
  materialSummaries: {
    mat1: { id: 'mat1', name: 'Mat1', summary: 'A summary' },
    mat2: { id: 'mat2', name: 'Mat2' },
  },
  sourceSummaries: {
    cite1: {
      id: 'cite1',
      title: 'Paper one',
      authors: ['Doe'],
      year: 2020,
      venue: 'Nature',
      url: 'https://example.com/c1',
    },
    cite2: {
      id: 'cite2',
      title: 'Paper two',
      authors: ['Roe'],
      year: 2021,
      venue: 'Science',
      url: 'https://example.com/c2',
    },
  },
  pathwayMetrics: {
    cost: {
      key: 'cost',
      low: 100,
      high: 200,
      unit: 'USD/tCO2',
      yearBasis: 2020,
      sourceRef: 'cite1',
    },
    trl: {
      key: 'trl',
      low: 5,
      high: 5,
      unit: 'years',
      yearBasis: 2020,
      sourceRef: 'cite1',
    },
  },
}

const acyclic: JsonObject = {
  cycle_policy: 'GRAPH_CYCLE_POLICY_ACYCLIC',
  nodes: [
    {
      id: 'node:air',
      label: 'Air',
      kind: 'GRAPH_NODE_KIND_INPUT',
      stage: 'GRAPH_STAGE_INPUT',
      order: 1,
    },
    {
      id: 'node:fan',
      label: 'Fan',
      kind: 'GRAPH_NODE_KIND_CAPTURE',
      stage: 'GRAPH_STAGE_CAPTURE',
      order: 1,
    },
    {
      id: 'node:bed',
      label: 'Bed',
      kind: 'GRAPH_NODE_KIND_CAPTURE',
      stage: 'GRAPH_STAGE_CAPTURE',
      order: 2,
    },
    {
      id: 'node:react',
      label: 'Reaction',
      kind: 'GRAPH_NODE_KIND_CONVERSION',
      stage: 'GRAPH_STAGE_CONVERSION',
      order: 1,
    },
    {
      id: 'node:waste',
      label: 'Waste',
      kind: 'GRAPH_NODE_KIND_WASTE',
      stage: 'GRAPH_STAGE_BYPRODUCT',
      order: 1,
    },
  ],
  edges: [
    {
      id: 'edge:e1',
      source_node_id: 'node:air',
      target_node_id: 'node:fan',
      kind: 'GRAPH_EDGE_KIND_FLOW',
    },
    {
      id: 'edge:e2',
      source_node_id: 'node:fan',
      target_node_id: 'node:bed',
      kind: 'GRAPH_EDGE_KIND_FLOW',
    },
    {
      id: 'edge:e3',
      source_node_id: 'node:bed',
      target_node_id: 'node:react',
      kind: 'GRAPH_EDGE_KIND_FLOW',
    },
    {
      id: 'edge:e4',
      source_node_id: 'node:react',
      target_node_id: 'node:waste',
      kind: 'GRAPH_EDGE_KIND_FLOW',
    },
  ],
}

const buildGraph = (json: JsonObject): ProcessGraph =>
  fromJson(ProcessGraphSchema, json)

describe('buildProcessDto', () => {
  it('maps a process_graph into a serializable DTO with stable ids', () => {
    const dto = buildProcessDto(buildGraph(acyclic), baseLookups, { kind: 'process' })
    expect(dto.nodes.map((n) => n.id)).toEqual([
      'node:air',
      'node:fan',
      'node:bed',
      'node:react',
      'node:waste',
    ])
    expect(dto.edges.map((e) => e.id)).toEqual([
      'edge:e1',
      'edge:e2',
      'edge:e3',
      'edge:e4',
    ])
    expect(dto.meta).toEqual({ kind: 'process', cyclePolicy: 'ACYCLIC' })
  })

  it('places nodes by stage order (input → capture → conversion → ... → byproduct)', () => {
    const dto = buildProcessDto(buildGraph(acyclic), baseLookups, { kind: 'process' })
    const byLabel = new Map(dto.nodes.map((n) => [String(n.data.label), n]))
    expect(byLabel.get('Air')!.position.x).toBeLessThan(byLabel.get('Fan')!.position.x)
    expect(byLabel.get('Fan')!.position.x).toBe(byLabel.get('Bed')!.position.x)
    expect(byLabel.get('Bed')!.position.x).toBeLessThan(byLabel.get('Reaction')!.position.x)
    expect(byLabel.get('Reaction')!.position.x).toBeLessThan(byLabel.get('Waste')!.position.x)
  })

  it('marks process nodes for horizontal handles', () => {
    const dto = buildProcessDto(buildGraph(acyclic), baseLookups, { kind: 'process' })
    expect(dto.nodes.every((node) => node.data.handleLayout === 'horizontal')).toBe(true)
  })

  it('orders nodes within each stage by node.order, then by id for stability', () => {
    const dto = buildProcessDto(buildGraph(acyclic), baseLookups, { kind: 'process' })
    const captureNodes = dto.nodes.filter((n) => n.data.stage === 'CAPTURE')
    expect(captureNodes.map((n) => n.data.label)).toEqual(['Fan', 'Bed'])
    const captureY = captureNodes.map((n) => n.position.y)
    expect(captureY[0]).toBeLessThan(captureY[1]!)
  })

  it('carries edgeKind on each edge for downstream rendering (FLOW)', () => {
    const dto = buildProcessDto(buildGraph(acyclic), baseLookups, { kind: 'process' })
    expect(dto.edges.map((e) => e.data?.edgeKind)).toEqual(['FLOW', 'FLOW', 'FLOW', 'FLOW'])
  })

  it('renders FEEDBACK, MESSAGE and SELF_TRANSITION edges with the right directed edgeKind', () => {
    const json: JsonObject = {
      cycle_policy: 'GRAPH_CYCLE_POLICY_RECYCLE_ALLOWED',
      nodes: [
        { id: 'node:a', label: 'A', kind: 'GRAPH_NODE_KIND_CAPTURE', stage: 'GRAPH_STAGE_CAPTURE' },
        { id: 'node:b', label: 'B', kind: 'GRAPH_NODE_KIND_REGENERATION', stage: 'GRAPH_STAGE_REGENERATION' },
        { id: 'node:ctrl', label: 'Ctl', kind: 'GRAPH_NODE_KIND_TRANSPORT', stage: 'GRAPH_STAGE_TRANSPORT' },
      ],
      edges: [
        { id: 'edge:fb', source_node_id: 'node:b', target_node_id: 'node:a', kind: 'GRAPH_EDGE_KIND_FEEDBACK' },
        { id: 'edge:st', source_node_id: 'node:a', target_node_id: 'node:a', kind: 'GRAPH_EDGE_KIND_SELF_TRANSITION' },
        { id: 'edge:m', source_node_id: 'node:ctrl', target_node_id: 'node:a', kind: 'GRAPH_EDGE_KIND_MESSAGE' },
      ],
    }
    const dto = buildProcessDto(buildGraph(json), baseLookups, { kind: 'operational' })
    expect(dto.edges.find((e) => e.id === 'edge:fb')!.data?.edgeKind).toBe('FEEDBACK')
    expect(dto.edges.find((e) => e.id === 'edge:st')!.data?.edgeKind).toBe('SELF_TRANSITION')
    expect(dto.edges.find((e) => e.id === 'edge:m')!.data?.edgeKind).toBe('MESSAGE')
    const self = dto.edges.find((e) => e.id === 'edge:st')!
    expect(self.source).toBe(self.target)
    expect(dto.meta.kind).toBe('operational')
  })

  it('includes resolved material/source/metric summaries in node.data inspector payload', () => {
    const json: JsonObject = {
      cycle_policy: 'GRAPH_CYCLE_POLICY_ACYCLIC',
      nodes: [
        {
          id: 'node:a',
          label: 'A',
          kind: 'GRAPH_NODE_KIND_CAPTURE',
          stage: 'GRAPH_STAGE_CAPTURE',
          material_ids: ['mat1', 'mat2'],
          source_refs: ['cite1'],
          metric_keys: ['cost'],
        },
      ],
      edges: [],
    }
    const dto = buildProcessDto(buildGraph(json), baseLookups, { kind: 'process' })
    const node = dto.nodes[0]!
    const materials = node.data.materials as { id: string; name: string; summary?: string }[]
    const sources = node.data.sources as { id: string; title: string }[]
    const metrics = node.data.metrics as { key: string; low: number }[]
    expect(materials.map((m) => m.id)).toEqual(['mat1', 'mat2'])
    expect(materials[0]).toMatchObject({ id: 'mat1', name: 'Mat1', summary: 'A summary' })
    expect(sources.map((s) => s.id)).toEqual(['cite1'])
    expect(metrics.map((m) => m.key)).toEqual(['cost'])
    expect(metrics[0]).toMatchObject({ key: 'cost', low: 100, high: 200 })
  })

  it('omits resolved entries when lookups do not provide them', () => {
    const json: JsonObject = {
      cycle_policy: 'GRAPH_CYCLE_POLICY_ACYCLIC',
      nodes: [
        {
          id: 'node:a',
          label: 'A',
          kind: 'GRAPH_NODE_KIND_CAPTURE',
          stage: 'GRAPH_STAGE_CAPTURE',
          material_ids: ['unknown'],
          source_refs: ['unknown'],
          metric_keys: ['unknown-metric'],
        },
      ],
      edges: [],
    }
    const dto = buildProcessDto(buildGraph(json), baseLookups, { kind: 'process' })
    const node = dto.nodes[0]!
    expect(node.data.materials).toEqual([])
    expect(node.data.sources).toEqual([])
    expect(node.data.metrics).toEqual([])
  })

  it('is deterministic: two calls produce identical DTOs', () => {
    const graph = buildGraph(acyclic)
    const a = buildProcessDto(graph, baseLookups, { kind: 'process' })
    const b = buildProcessDto(graph, baseLookups, { kind: 'process' })
    expect(a).toEqual(b)
  })

  it('produces stable node positions across input orderings', () => {
    const reordered: JsonObject = {
      cycle_policy: 'GRAPH_CYCLE_POLICY_ACYCLIC',
      nodes: [...(acyclic.nodes as JsonObject[])].slice().reverse(),
      edges: [...(acyclic.edges as JsonObject[])].slice().reverse(),
    }
    const a = buildProcessDto(buildGraph(acyclic), baseLookups, { kind: 'process' })
    const b = buildProcessDto(buildGraph(reordered), baseLookups, { kind: 'process' })
    expect(a.nodes.map((n) => n.id)).toEqual(b.nodes.map((n) => n.id))
    expect(a.nodes.map((n) => n.position)).toEqual(b.nodes.map((n) => n.position))
  })

  it('serializes to JSON without throwing and uses plain-object nodes/edges', () => {
    const dto = buildProcessDto(buildGraph(acyclic), baseLookups, { kind: 'process' })
    const json = JSON.stringify(dto)
    expect(json).toContain('"kind":"process"')
    expect(json).toContain('"cyclePolicy":"ACYCLIC"')
    for (const n of dto.nodes) expect(n.constructor).toBe(Object)
    for (const e of dto.edges) expect(e.constructor).toBe(Object)
  })
})
