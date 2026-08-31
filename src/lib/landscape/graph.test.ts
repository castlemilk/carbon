import { describe, it, expect } from 'vitest'
import { fromJson, type JsonObject } from '@bufbuild/protobuf'
import { LandscapeGraphSchema, type LandscapeGraph } from '@/lib/gen/carbon/v1/landscape_pb'
import { PathwaySchema, type Pathway } from '@/lib/gen/carbon/v1/pathway_pb'

import { buildLandscapeDto } from './graph'
import type { LandscapeLookups, PathwayMetricValues } from './graph'

const PATHWAY_NS = 'pathway:'
const SETTING_NS = 'setting:'
const MATERIAL_NS = 'material:'

const makePathway = (id: string): Pathway =>
  fromJson(PathwaySchema, {
    id,
    name: id.toUpperCase(),
    setting: 'DAC',
    trl: 5,
    source_refs: ['mcqueen2021'],
    material_ids: [],
  })

const landscapeJson = ({
  pathwayIds,
  materialIds = [],
  nodeMaterialIds = {},
  edges = [],
}: {
  pathwayIds: string[]
  materialIds?: string[]
  nodeMaterialIds?: Record<string, string[]>
  edges?: { id: string; source: string; target: string }[]
}): JsonObject => ({
  nodes: [
    ...pathwayIds.map((pid) => ({
      id: `${PATHWAY_NS}${pid}`,
      label: pid,
      kind: 'GRAPH_NODE_KIND_CAPTURE',
      entity_type: 'GRAPH_ENTITY_TYPE_PATHWAY',
      entity_id: pid,
      metric_keys: ['trl'],
      material_ids: nodeMaterialIds[pid] ?? [],
    })),
    {
      id: `${SETTING_NS}DAC`,
      label: 'Direct air capture',
      entity_type: 'GRAPH_ENTITY_TYPE_SETTING',
      entity_id: 'DAC',
    },
    ...materialIds.map((mid) => ({
      id: `${MATERIAL_NS}${mid}`,
      label: mid,
      kind: 'GRAPH_NODE_KIND_MATERIAL',
      entity_type: 'GRAPH_ENTITY_TYPE_MATERIAL',
      entity_id: mid,
      initially_hidden: true,
    })),
  ],
  edges: edges.map((e) => ({
    id: e.id,
    source_node_id: e.source,
    target_node_id: e.target,
    kind: 'GRAPH_EDGE_KIND_RELATION',
  })),
})

const buildGraph = (json: JsonObject): LandscapeGraph =>
  fromJson(LandscapeGraphSchema, json)

const buildDto = (
  graph: LandscapeGraph,
  pathwayIds: string[],
  metrics: Record<string, PathwayMetricValues>,
  opts?: { logX?: boolean },
  lookups?: LandscapeLookups,
) =>
  buildLandscapeDto(graph, pathwayIds.map(makePathway), metrics, {
    xKey: 'cost',
    yKey: 'trl',
    logX: opts?.logX ?? false,
    w: 800,
    h: 400,
  }, lookups)

describe('buildLandscapeDto', () => {
  it('returns an empty payload with no nodes and no NaN positions when pathways is empty', () => {
    const emptyGraph = buildGraph({ nodes: [], edges: [] })
    const dto = buildDto(emptyGraph, [], {}, {})
    expect(dto.nodes).toEqual([])
    expect(dto.edges).toEqual([])
    expect(dto.unmapped).toEqual([])
    for (const n of dto.nodes) {
      expect(Number.isFinite(n.position.x)).toBe(true)
      expect(Number.isFinite(n.position.y)).toBe(true)
    }
  })

  it('does not call makeScales when there are no positive x values to plot', () => {
    const graph = buildGraph(landscapeJson({ pathwayIds: ['a'] }))
    const dto = buildDto(
      graph,
      ['a'],
      { a: { x: undefined, y: 5 } },
      { logX: true },
    )
    const a = dto.nodes.find((n) => n.id === `${PATHWAY_NS}a`)!
    expect(Number.isFinite(a.position.x)).toBe(true)
    expect(Number.isFinite(a.position.y)).toBe(true)
    expect(dto.unmapped).toContain(`${PATHWAY_NS}a`)
  })

  it('positions pathway nodes using makeScales semantics with screen-Y inversion', () => {
    const graph = buildGraph(landscapeJson({ pathwayIds: ['lo', 'mid', 'hi'] }))
    const dto = buildDto(graph, ['lo', 'mid', 'hi'], {
      lo: { x: 10, y: 1 },
      mid: { x: 100, y: 5 },
      hi: { x: 1000, y: 9 },
    })
    const byId = new Map(dto.nodes.map((n) => [n.id, n]))
    const lo = byId.get(`${PATHWAY_NS}lo`)!
    const mid = byId.get(`${PATHWAY_NS}mid`)!
    const hi = byId.get(`${PATHWAY_NS}hi`)!
    expect(lo.position.x).toBeLessThan(mid.position.x)
    expect(mid.position.x).toBeLessThan(hi.position.x)
    expect(lo.position.y).toBeGreaterThan(mid.position.y)
    expect(mid.position.y).toBeGreaterThan(hi.position.y)
    expect(mid.position.x).toBeGreaterThan(0)
    expect(mid.position.x).toBeLessThan(800)
    expect(mid.position.y).toBeGreaterThan(0)
    expect(mid.position.y).toBeLessThan(400)
  })

  it('routes non-positive logX values to the unmapped rail and never feeds them into makeScales', () => {
    const graph = buildGraph(landscapeJson({ pathwayIds: ['pos', 'zero', 'neg'] }))
    const dto = buildDto(
      graph,
      ['pos', 'zero', 'neg'],
      {
        pos: { x: 100, y: 5 },
        zero: { x: 0, y: 5 },
        neg: { x: -10, y: 5 },
      },
      { logX: true },
    )
    expect(dto.unmapped).toEqual(expect.arrayContaining([`${PATHWAY_NS}zero`, `${PATHWAY_NS}neg`]))
    expect(dto.unmapped).not.toContain(`${PATHWAY_NS}pos`)
    const positioned = dto.nodes.filter(
      (n) => n.id.startsWith(PATHWAY_NS) && !dto.unmapped.includes(n.id),
    )
    expect(positioned.map((n) => n.id)).toEqual([`${PATHWAY_NS}pos`])
  })

  it('routes missing y values to the unmapped rail while keeping x-positioned nodes', () => {
    const graph = buildGraph(landscapeJson({ pathwayIds: ['a', 'b'] }))
    const dto = buildDto(graph, ['a', 'b'], {
      a: { x: 100, y: 5 },
      b: { x: 200, y: undefined },
    })
    expect(dto.unmapped).toContain(`${PATHWAY_NS}b`)
    expect(dto.unmapped).not.toContain(`${PATHWAY_NS}a`)
    const positioned = dto.nodes.find((n) => n.id === `${PATHWAY_NS}a`)!
    expect(Number.isFinite(positioned.position.x)).toBe(true)
  })

  it('routes missing x values to the unmapped rail', () => {
    const graph = buildGraph(landscapeJson({ pathwayIds: ['a'] }))
    const dto = buildDto(graph, ['a'], { a: { x: undefined, y: 5 } })
    expect(dto.unmapped).toContain(`${PATHWAY_NS}a`)
    const a = dto.nodes.find((n) => n.id === `${PATHWAY_NS}a`)!
    expect(Number.isFinite(a.position.x)).toBe(true)
    expect(Number.isFinite(a.position.y)).toBe(true)
  })

  it('applies deterministic overlap offsets when multiple pathways share the same (x,y)', () => {
    const graph = buildGraph(landscapeJson({ pathwayIds: ['a', 'b', 'c'] }))
    const dtoA = buildDto(graph, ['a', 'b', 'c'], {
      a: { x: 100, y: 5 },
      b: { x: 100, y: 5 },
      c: { x: 100, y: 5 },
    })
    const dtoB = buildDto(graph, ['b', 'a', 'c'], {
      a: { x: 100, y: 5 },
      b: { x: 100, y: 5 },
      c: { x: 100, y: 5 },
    })
    const posOf = (dto: ReturnType<typeof buildDto>, pid: string) =>
      dto.nodes.find((n) => n.id === `${PATHWAY_NS}${pid}`)!.position
    const aA = posOf(dtoA, 'a')
    const bA = posOf(dtoA, 'b')
    const cA = posOf(dtoA, 'c')
    const aB = posOf(dtoB, 'a')
    const bB = posOf(dtoB, 'b')
    const cB = posOf(dtoB, 'c')
    expect(aA).toEqual(aB)
    expect(bA).toEqual(bB)
    expect(cA).toEqual(cB)
    const seen = new Set([aA, bA, cA].map((p) => `${p.x}|${p.y}`))
    expect(seen.size).toBeGreaterThan(1)
  })

  it('orders the unmapped rail deterministically regardless of input order', () => {
    const graph = buildGraph(landscapeJson({ pathwayIds: ['zeta', 'alpha', 'mu'] }))
    // mark all three unmapped by withholding their metric values
    const dtoA = buildDto(graph, ['zeta', 'alpha', 'mu'], {})
    const dtoB = buildDto(graph, ['mu', 'zeta', 'alpha'], {})
    const idsIn = (dto: ReturnType<typeof buildDto>) =>
      dto.unmapped.slice()
    expect(idsIn(dtoA)).toEqual(idsIn(dtoB))
    expect(idsIn(dtoA)).toEqual(['pathway:alpha', 'pathway:mu', 'pathway:zeta'])
  })

  it('serializes every filtered pathway, setting, and material context node with initially_hidden preserved', () => {
    const graph = buildGraph(
      landscapeJson({
        pathwayIds: ['a', 'b'],
        materialIds: ['mat1', 'mat2'],
        edges: [
          { id: 'edge:r1', source: `${PATHWAY_NS}a`, target: `${SETTING_NS}DAC` },
          { id: 'edge:r2', source: `${MATERIAL_NS}mat1`, target: `${PATHWAY_NS}a` },
          { id: 'edge:r3', source: `${PATHWAY_NS}b`, target: `${MATERIAL_NS}mat2` },
        ],
      }),
    )
    const dto = buildDto(graph, ['a', 'b'], {
      a: { x: 50, y: 3 },
      b: { x: 200, y: 7 },
    })
    const ids = dto.nodes.map((n) => n.id)
    expect(ids).toEqual(
      expect.arrayContaining([
        `${PATHWAY_NS}a`,
        `${PATHWAY_NS}b`,
        `${SETTING_NS}DAC`,
        `${MATERIAL_NS}mat1`,
        `${MATERIAL_NS}mat2`,
      ]),
    )
    const mat1 = dto.nodes.find((n) => n.id === `${MATERIAL_NS}mat1`)!
    expect(mat1.data.initiallyHidden).toBe(true)
    const setting = dto.nodes.find((n) => n.id === `${SETTING_NS}DAC`)!
    expect(setting.data.initiallyHidden).toBe(false)
    expect(setting.type).toBe('setting')
    expect(mat1.type).toBe('material')
    const pathwayA = dto.nodes.find((n) => n.id === `${PATHWAY_NS}a`)!
    expect(pathwayA.type).toBe('pathway')
  })

  it('keeps hidden material context nodes in the node map so edges stay resolvable', () => {
    const graph = buildGraph(
      landscapeJson({
        pathwayIds: ['a'],
        materialIds: ['hidden-mat'],
        edges: [
          { id: 'edge:r1', source: `${PATHWAY_NS}a`, target: `${MATERIAL_NS}hidden-mat` },
        ],
      }),
    )
    const dto = buildDto(graph, ['a'], { a: { x: 50, y: 5 } })
    const hidden = dto.nodes.find((n) => n.id === `${MATERIAL_NS}hidden-mat`)
    expect(hidden).toBeDefined()
    expect(hidden!.data.initiallyHidden).toBe(true)
    const edge = dto.edges.find((e) => e.id === 'edge:r1')
    expect(edge).toBeDefined()
    expect(edge!.source).toBe(`${PATHWAY_NS}a`)
    expect(edge!.target).toBe(`${MATERIAL_NS}hidden-mat`)
  })

  it('drops edges whose endpoints are not both present in the DTO', () => {
    const graph = buildGraph(
      landscapeJson({
        pathwayIds: ['a', 'b'],
        edges: [
          { id: 'edge:keep', source: `${PATHWAY_NS}a`, target: `${SETTING_NS}DAC` },
          { id: 'edge:drop', source: `${PATHWAY_NS}b`, target: `${SETTING_NS}DAC` },
        ],
      }),
    )
    const dto = buildDto(graph, ['a'], { a: { x: 50, y: 5 } })
    expect(dto.edges.find((e) => e.id === 'edge:keep')).toBeDefined()
    expect(dto.edges.find((e) => e.id === 'edge:drop')).toBeUndefined()
  })

  it('omits process and operational graph DTOs from the landscape payload (lite shape)', () => {
    const graph = buildGraph(landscapeJson({ pathwayIds: ['a'] }))
    const dto = buildDto(graph, ['a'], { a: { x: 100, y: 5 } })
    expect((dto as unknown as Record<string, unknown>).processGraph).toBeUndefined()
    expect((dto as unknown as Record<string, unknown>).operationalGraph).toBeUndefined()
    const json = JSON.stringify(dto)
    expect(json).not.toMatch(/processGraph/)
    expect(json).not.toMatch(/operationalGraph/)
  })

  it('returns a serializable plain-object DTO with no proto message instances', () => {
    const graph = buildGraph(landscapeJson({ pathwayIds: ['a'] }))
    const dto = buildDto(graph, ['a'], { a: { x: 100, y: 5 } })
    expect(typeof dto).toBe('object')
    expect(dto).not.toBeNull()
    expect(() => JSON.stringify(dto)).not.toThrow()
    for (const node of dto.nodes) {
      expect(node.constructor).toBe(Object)
    }
    for (const edge of dto.edges) {
      expect(edge.constructor).toBe(Object)
    }
  })

  it('preserves log-X monotonic ordering across a wide positive range', () => {
    const graph = buildGraph(landscapeJson({ pathwayIds: ['p1', 'p2', 'p3', 'p4'] }))
    const dto = buildDto(
      graph,
      ['p1', 'p2', 'p3', 'p4'],
      {
        p1: { x: 1, y: 5 },
        p2: { x: 10, y: 5 },
        p3: { x: 100, y: 5 },
        p4: { x: 1000, y: 5 },
      },
      { logX: true },
    )
    const xs = (['p1', 'p2', 'p3', 'p4'] as const).map(
      (pid) => dto.nodes.find((n) => n.id === `${PATHWAY_NS}${pid}`)!.position.x,
    )
    for (let i = 1; i < xs.length; i++) expect(xs[i]!).toBeGreaterThan(xs[i - 1]!)
  })

  it('routes pathway nodes that are not in the filtered list out of the DTO', () => {
    const graph = buildGraph(
      landscapeJson({
        pathwayIds: ['a', 'b'],
        edges: [{ id: 'edge:r', source: `${PATHWAY_NS}a`, target: `${SETTING_NS}DAC` }],
      }),
    )
    const dto = buildDto(graph, ['a'], { a: { x: 50, y: 5 } })
    expect(dto.nodes.find((n) => n.id === `${PATHWAY_NS}a`)).toBeDefined()
    expect(dto.nodes.find((n) => n.id === `${PATHWAY_NS}b`)).toBeUndefined()
  })

  it('returns an empty landscape and never invokes makeScales when all pathways are missing values', () => {
    const graph = buildGraph(landscapeJson({ pathwayIds: ['a', 'b'] }))
    const dto = buildDto(
      graph,
      ['a', 'b'],
      {
        a: { x: undefined, y: undefined },
        b: { x: undefined, y: undefined },
      },
      { logX: false },
    )
    expect(dto.unmapped).toEqual(expect.arrayContaining([`${PATHWAY_NS}a`, `${PATHWAY_NS}b`]))
    for (const n of dto.nodes) {
      expect(Number.isFinite(n.position.x)).toBe(true)
      expect(Number.isFinite(n.position.y)).toBe(true)
    }
  })

  describe('server-resolved inspector lookups', () => {
    const lookups: LandscapeLookups = {
      materialSummaries: {
        mat1: { id: 'mat1', name: 'Material one', summary: 'soft rock' },
        mat2: { id: 'mat2', name: 'Material two' },
      },
      sourceSummaries: {
        mcqueen2021: {
          id: 'mcqueen2021',
          title: 'Carbon dioxide removal by sorbents',
          authors: ['McQueen, N.'],
          year: 2021,
          venue: 'Joule',
          url: 'https://example.org/mcqueen2021',
        },
      },
      pathwayMetrics: {
        a: [
          { key: 'cost', low: 40, high: 90, unit: 'USD/tCO2', yearBasis: 2021, sourceRef: 'mcqueen2021' },
          { key: 'trl', low: 5, high: 5, unit: 'years', yearBasis: 0, sourceRef: '' },
        ],
      },
    }

    it('attaches mechanism summary, metric ranges, materials, and sources to pathway nodes', () => {
      const graph = buildGraph(
        landscapeJson({
          pathwayIds: ['a'],
          materialIds: ['mat1'],
          nodeMaterialIds: { a: ['mat1'] },
          edges: [
            { id: 'edge:r1', source: `${PATHWAY_NS}a`, target: `${SETTING_NS}DAC` },
            { id: 'edge:r2', source: `${PATHWAY_NS}a`, target: `${MATERIAL_NS}mat1` },
          ],
        }),
      )
      const plain = buildDto(graph, ['a'], { a: { x: 50, y: 5 } }, {}, lookups)
      const a = plain.nodes.find((n) => n.id === `${PATHWAY_NS}a`)!
      expect(a.data.metrics).toEqual(lookups.pathwayMetrics.a)
      expect(a.data.materials).toEqual([lookups.materialSummaries.mat1])
      expect(a.data.sources).toEqual([lookups.sourceSummaries.mcqueen2021])
      const mat = plain.nodes.find((n) => n.id === `${MATERIAL_NS}mat1`)!
      expect(mat.data.materials).toEqual([lookups.materialSummaries.mat1])
    })

    it('resolves connected-concept labels for pathway nodes from relationship edges', () => {
      const graph = buildGraph(
        landscapeJson({
          pathwayIds: ['a', 'b'],
          materialIds: ['mat1', 'mat2'],
          nodeMaterialIds: { a: ['mat1'], b: ['mat2'] },
          edges: [
            { id: 'edge:r1', source: `${PATHWAY_NS}a`, target: `${SETTING_NS}DAC` },
            { id: 'edge:r2', source: `${PATHWAY_NS}a`, target: `${MATERIAL_NS}mat1` },
            { id: 'edge:r3', source: `${PATHWAY_NS}b`, target: `${MATERIAL_NS}mat2` },
          ],
        }),
      )
      const plain = buildDto(graph, ['a', 'b'], { a: { x: 50, y: 5 }, b: { x: 200, y: 7 } }, {}, lookups)
      const a = plain.nodes.find((n) => n.id === `${PATHWAY_NS}a`)!
      const connected = a.data.connected as { id: string; label: string }[]
      expect(connected.map((c) => c.id)).toEqual([`${MATERIAL_NS}mat1`, `${SETTING_NS}DAC`])
      const b = plain.nodes.find((n) => n.id === `${PATHWAY_NS}b`)!
      expect((b.data.connected as { id: string }[]).map((c) => c.id)).toEqual([`${MATERIAL_NS}mat2`])
      // context nodes are not tagged with connected labels
      const setting = plain.nodes.find((n) => n.id === `${SETTING_NS}DAC`)!
      expect(setting.data.connected).toBeUndefined()
    })

    it('omits resolved inspector fields when no lookups are provided (lite fallback)', () => {
      const graph = buildGraph(landscapeJson({ pathwayIds: ['a'] }))
      const dto = buildDto(graph, ['a'], { a: { x: 50, y: 5 } })
      const a = dto.nodes.find((n) => n.id === `${PATHWAY_NS}a`)!
      expect(a.data.summary).toBe('')
      expect(a.data.metrics).toEqual([])
      expect(a.data.materials).toEqual([])
      expect(a.data.sources).toEqual([])
      expect(a.data.connected).toBeUndefined()
    })
  })
})
