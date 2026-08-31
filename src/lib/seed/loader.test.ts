import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mkdtempSync, rmSync, cpSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { stringify } from 'yaml'
import { makeSqliteStore } from '@/lib/db/sqlite-store'
import { seedFromDataDir } from './loader'
import { validatePathwayDoc, validateMaterialDoc, UNIT_ALLOWLIST } from './loader'

const citationIds = new Set(['mcqueen2021'])
const materialIds = new Set(['mg2dobpdc'])

const good = {
  id: 'mof-dac', name: 'MOF DAC', setting: 'DAC', trl: 5,
  search_terms: ['mof dac'],
  metrics: { cost: { low: 80, high: 600, unit: 'USD/tCO2', year_basis: 2022, source_ref: 'mcqueen2021' } },
  material_ids: ['mg2dobpdc'],
  source_refs: ['mcqueen2021'],
  mermaid_source: 'flowchart LR\n  A[Air] --> B[Capture]',
  mermaid_sequence_source: 'sequenceDiagram\n  participant A as Air\n  participant B as Capture\n  A->>B: Feed',
}

const processGraph = {
  cycle_policy: 'GRAPH_CYCLE_POLICY_ACYCLIC',
  nodes: [
    { id: 'node:air', label: 'Air intake', kind: 'GRAPH_NODE_KIND_INPUT', stage: 'GRAPH_STAGE_INPUT',
      entity_type: 'GRAPH_ENTITY_TYPE_PATHWAY', entity_id: 'mof-dac', metric_keys: ['cost'],
      material_ids: ['mg2dobpdc'], source_refs: ['mcqueen2021'] },
    { id: 'node:bed', label: 'Sorption bed', kind: 'GRAPH_NODE_KIND_CAPTURE', stage: 'GRAPH_STAGE_CAPTURE' },
  ],
  edges: [
    { id: 'edge:e1', source_node_id: 'node:air', target_node_id: 'node:bed', kind: 'GRAPH_EDGE_KIND_FLOW', label: 'air' },
  ],
}

const operationalGraph = {
  cycle_policy: 'GRAPH_CYCLE_POLICY_ACYCLIC',
  nodes: [
    { id: 'node:ctrl', label: 'Controller', kind: 'GRAPH_NODE_KIND_TRANSPORT', stage: 'GRAPH_STAGE_TRANSPORT' },
    { id: 'node:bed', label: 'Bed', kind: 'GRAPH_NODE_KIND_CAPTURE', stage: 'GRAPH_STAGE_CAPTURE' },
  ],
  edges: [
    { id: 'edge:m1', source_node_id: 'node:ctrl', target_node_id: 'node:bed', kind: 'GRAPH_EDGE_KIND_MESSAGE', label: 'open' },
  ],
}

const goodWithGraphs = { ...good, process_graph: processGraph, operational_graph: operationalGraph }

const landscape = {
  nodes: [
    { id: 'pathway:mof-dac', label: 'MOF DAC', kind: 'GRAPH_NODE_KIND_CAPTURE',
      entity_type: 'GRAPH_ENTITY_TYPE_PATHWAY', entity_id: 'mof-dac', metric_keys: ['cost'] },
    { id: 'setting:DAC', label: 'Direct air capture', entity_type: 'GRAPH_ENTITY_TYPE_SETTING', entity_id: 'DAC' },
    { id: 'material:mg2dobpdc', label: 'Sorbent context', kind: 'GRAPH_NODE_KIND_MATERIAL',
      entity_type: 'GRAPH_ENTITY_TYPE_MATERIAL', entity_id: 'mg2dobpdc', initially_hidden: true },
  ],
  edges: [
    { id: 'edge:r1', source_node_id: 'material:mg2dobpdc', target_node_id: 'pathway:mof-dac', kind: 'GRAPH_EDGE_KIND_RELATION' },
  ],
}

const writePathway = (dir: string, file: string, doc: Record<string, unknown>) =>
  writeFileSync(join(dir, 'pathways', file), stringify(doc))

const fixturesDir = join(__dirname, 'fixtures')
let seedDir: string
let stores: ReturnType<typeof makeSqliteStore>[]
const openSeedStore = () => {
  const store = makeSqliteStore(join(seedDir, `t-${Math.random().toString(36).slice(2)}.db`))
  void store.initSchema()
  stores.push(store)
  return store
}
const copyFixtures = (prefix: string) => {
  const tmp = mkdtempSync(join(tmpdir(), prefix))
  cpSync(fixturesDir, tmp, { recursive: true })
  return tmp
}

describe('seed loader validation', () => {
  it('accepts a valid pathway doc', () => {
    expect(() => validatePathwayDoc(good, citationIds, materialIds)).not.toThrow()
  })
  it('rejects unknown fields with field precision', () => {
    expect(() => validatePathwayDoc({ ...good, bogus_field: 1 }, citationIds, materialIds))
      .toThrow(/bogus_field|mof-dac/)
  })
  it('rejects unresolved source_ref', () => {
    const bad = structuredClone(good)
    bad.source_refs = ['nope2020']
    expect(() => validatePathwayDoc(bad, citationIds, materialIds)).toThrow(/nope2020/)
  })
  it('rejects unresolved metric source_ref and bad unit and inverted range', () => {
    const inv = structuredClone(good); inv.metrics.cost.high = 10
    expect(() => validatePathwayDoc(inv, citationIds, materialIds)).toThrow(/cost/)
    const unit = structuredClone(good); unit.metrics.cost.unit = 'USD'
    expect(() => validatePathwayDoc(unit, citationIds, materialIds)).toThrow(/unit/)
    expect(UNIT_ALLOWLIST).toContain('USD/tCO2')
  })
  it('rejects TRL out of range and unresolved materials', () => {
    expect(() => validatePathwayDoc({ ...good, trl: 11 }, citationIds, materialIds)).toThrow(/trl/i)
    expect(() => validatePathwayDoc({ ...good, material_ids: ['ghost'] }, citationIds, materialIds)).toThrow(/ghost/)
  })
  it('rejects metrics missing low or high (proto3 default trap)', () => {
    const noLow = structuredClone(good); delete (noLow.metrics.cost as Record<string, unknown>).low
    expect(() => validatePathwayDoc(noLow, citationIds, materialIds)).toThrow(/low/)
  })
  it('rejects metrics missing year_basis (same proto3 trap)', () => {
    const noBasis = structuredClone(good); delete (noBasis.metrics.cost as Record<string, unknown>).year_basis
    expect(() => validatePathwayDoc(noBasis, citationIds, materialIds)).toThrow(/year_basis/)
  })
  it('rejects absent setting (SETTING_UNSPECIFIED)', () => {
    const noSetting = structuredClone(good); delete (noSetting as Record<string, unknown>).setting
    expect(() => validatePathwayDoc(noSetting, citationIds, materialIds))
      .toThrow(/setting must be one of POINT_SOURCE\|DAC\|OCEAN_DIC\|MINERALIZATION\|BIOLOGICAL/)
  })
  it('warns but does not throw on unknown metric keys (authoring typos)', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      const typo = structuredClone(good)
      ;(typo.metrics as Record<string, unknown>).energy_thermall = { ...typo.metrics.cost }
      expect(() => validatePathwayDoc(typo, citationIds, materialIds)).not.toThrow()
      expect(warn).toHaveBeenCalledWith(expect.stringMatching(/energy_thermall/))
    } finally {
      warn.mockRestore()
    }
  })
  it('validates materials (unresolved source in property)', () => {
    const m = { id: 'mg2dobpdc', name: 'Mg2(dobpdc)', class: 'MOF',
      properties: { capacity: { low: 2, high: 4, unit: 'mmol/g', year_basis: 2019, source_ref: 'ghost' } } }
    expect(() => validateMaterialDoc(m, citationIds)).toThrow(/ghost/)
  })
  it('requires a non-empty id', () => {
    expect(() => validateMaterialDoc({ name: 'No Id' }, citationIds)).toThrow(/id/)
  })
})

describe('seedFromDataDir', () => {
  beforeEach(() => { seedDir = mkdtempSync(join(tmpdir(), 'carbon-seed-')); stores = [] })
  afterEach(() => {
    for (const st of stores) st.raw.close()
    rmSync(seedDir, { recursive: true, force: true })
  })

  it('loads the committed fixtures and returns counts', async () => {
    await expect(seedFromDataDir(openSeedStore(), fixturesDir)).resolves.toMatchObject({
      citations: 1, materials: 1, pathways: 1,
      processGraphCount: 0, operationalGraphCount: 0, landscapeNodeCount: 0,
    })
    const info = await seedFromDataDir(openSeedStore(), fixturesDir)
    expect(info.landscapeGraph).toBeUndefined()
  })

  it('fails with filename + ref prefix on unresolved source_ref', async () => {
    const bad = mkdtempSync(join(tmpdir(), 'carbon-seed-bad-'))
    try {
      cpSync(fixturesDir, bad, { recursive: true })
      writeFileSync(join(bad, 'pathways', 'mystery-dac.yaml'), 'id: mystery-dac\nname: Mystery\nsetting: DAC\ntrl: 3\nsource_refs: [nope2020]\n')
      await expect(seedFromDataDir(openSeedStore(), bad)).rejects.toThrow(/mystery-dac\.yaml.*nope2020/)
    } finally {
      rmSync(bad, { recursive: true, force: true })
    }
  })

  it('rejects duplicate ids across files, listing every colliding file', async () => {
    const dup = mkdtempSync(join(tmpdir(), 'carbon-seed-dup-'))
    try {
      cpSync(fixturesDir, dup, { recursive: true })
      writeFileSync(join(dup, 'pathways', 'mof-dac-again.yaml'), 'id: mof-dac\nname: MOF DAC Again\nsetting: DAC\ntrl: 5\n')
      await expect(seedFromDataDir(openSeedStore(), dup)).rejects.toThrow(
        /duplicate pathway id 'mof-dac' \(pathways\/mof-dac-again\.yaml, pathways\/mof-dac\.yaml\)|duplicate pathway id 'mof-dac' \(pathways\/mof-dac\.yaml, pathways\/mof-dac-again\.yaml\)/)
    } finally {
      rmSync(dup, { recursive: true, force: true })
    }
  })

  it('prefixes unknown-metric-key warnings with the file', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const tmp = mkdtempSync(join(tmpdir(), 'carbon-seed-typo-'))
    try {
      cpSync(fixturesDir, tmp, { recursive: true })
      writeFileSync(join(tmp, 'pathways', 'typo-dac.yaml'),
        'id: typo-dac\nname: Typo\nsetting: DAC\ntrl: 3\nmetrics:\n  energy_thermall:\n    low: 1\n    high: 2\n    unit: GJ/tCO2\n    year_basis: 2020\n    source_ref: mcqueen2021\n')
      await expect(seedFromDataDir(openSeedStore(), tmp)).resolves.toBeTruthy()
      expect(warn).toHaveBeenCalledWith(expect.stringMatching(/pathways\/typo-dac\.yaml: typo-dac: unknown metric key 'energy_thermall'/))
    } finally {
      rmSync(tmp, { recursive: true, force: true })
      warn.mockRestore()
    }
  })

  it('rejects non-mapping YAML docs with a precise message', async () => {
    const bad = mkdtempSync(join(tmpdir(), 'carbon-seed-empty-'))
    try {
      cpSync(fixturesDir, bad, { recursive: true })
      writeFileSync(join(bad, 'sources', 'empty.yaml'), '')
      writeFileSync(join(bad, 'sources', 'list.yaml'), '- a\n- b\n')
      await expect(seedFromDataDir(openSeedStore(), bad)).rejects.toThrow(/sources\/empty\.yaml: expected a YAML mapping, got empty document/)
      rmSync(join(bad, 'sources', 'empty.yaml'))
      await expect(seedFromDataDir(openSeedStore(), bad)).rejects.toThrow(/sources\/list\.yaml: expected a YAML mapping, got array/)
    } finally {
      rmSync(bad, { recursive: true, force: true })
    }
  })

  it('re-seeding resyncs: removed pathway file means removed row', async () => {
    const store = openSeedStore()
    const dataDir = copyFixtures('carbon-seed-copy-')
    try {
      expect(await seedFromDataDir(store, dataDir)).toEqual({
        citations: 1, materials: 1, pathways: 1, landscapeGraphCount: 0,
        processGraphCount: 0, operationalGraphCount: 0, landscapeNodeCount: 0, landscapeGraph: undefined,
      })
      rmSync(join(dataDir, 'pathways', 'mof-dac.yaml'))
      expect(await seedFromDataDir(store, dataDir)).toEqual({
        citations: 1, materials: 1, pathways: 0, landscapeGraphCount: 0,
        processGraphCount: 0, operationalGraphCount: 0, landscapeNodeCount: 0, landscapeGraph: undefined,
      })
      expect(await store.listPathways()).toHaveLength(0)
      expect(await store.listMaterials()).toHaveLength(1)
    } finally {
      rmSync(dataDir, { recursive: true, force: true })
    }
  })

  it('store.seedDrift reports shortlist/journal refs missing from pathways', async () => {
    const store = openSeedStore()
    await seedFromDataDir(store, fixturesDir)
    await store.putShortlist({ pathwayId: 'mof-dac', status: 'CANDIDATE', rationale: '', updatedAt: '2026-01-01' })
    await store.putShortlist({ pathwayId: 'gone', status: 'CANDIDATE', rationale: '', updatedAt: '2026-01-02' })
    await store.putJournal({ id: 'j1', kind: 'OBSERVATION', title: 't', bodyMarkdown: 'b', pathwayRefs: ['mof-dac', 'ocean'], createdAt: '2026-01-03' })
    expect(await store.seedDrift()).toEqual(['shortlist:gone', 'journal:ocean'])
  })
})

describe('seedFromDataDir graph loading', () => {
  beforeEach(() => { seedDir = mkdtempSync(join(tmpdir(), 'carbon-seed-')); stores = [] })
  afterEach(() => {
    for (const st of stores) st.raw.close()
    rmSync(seedDir, { recursive: true, force: true })
  })

  it('loads pathway graphs and reports graph counts', async () => {
    const tmp = copyFixtures('carbon-seed-graph-')
    try {
      writePathway(tmp, 'mof-dac.yaml', goodWithGraphs)
      const info = await seedFromDataDir(openSeedStore(), tmp)
      expect(info.processGraphCount).toBe(1)
      expect(info.operationalGraphCount).toBe(1)
      expect(info.landscapeNodeCount).toBe(0)
      expect(info.landscapeGraph).toBeUndefined()
    } finally {
      rmSync(tmp, { recursive: true, force: true })
    }
  })

  it('rejects an invalid pathway graph with file, pathway, graph and node ids', async () => {
    const tmp = copyFixtures('carbon-seed-graph-')
    try {
      const bad = structuredClone(goodWithGraphs)
      ;(bad.process_graph as Record<string, unknown>).nodes = [
        { id: 'air-intake', label: 'Air', kind: 'GRAPH_NODE_KIND_INPUT', stage: 'GRAPH_STAGE_INPUT' },
      ]
      writePathway(tmp, 'mof-dac.yaml', bad)
      await expect(seedFromDataDir(openSeedStore(), tmp))
        .rejects.toThrow(/mof-dac\.yaml: mof-dac: process_graph: node id 'air-intake' must be 'node:<stable-id>'/)
    } finally {
      rmSync(tmp, { recursive: true, force: true })
    }
  })

  it('resolves graph entity refs against the full corpus regardless of file order', async () => {
    const tmp = copyFixtures('carbon-seed-graph-')
    try {
      const early = structuredClone(goodWithGraphs)
      early.id = 'a-early'
      early.name = 'Early Pathway'
      ;(early.process_graph as { nodes: Record<string, unknown>[] }).nodes[0]!.entity_id = 'z-late'
      const late = structuredClone(goodWithGraphs)
      late.id = 'z-late'
      late.name = 'Late Pathway'
      ;(late.process_graph as { nodes: Record<string, unknown>[] }).nodes[0]!.entity_id = 'z-late'
      rmSync(join(tmp, 'pathways', 'mof-dac.yaml'))
      writePathway(tmp, 'a-early.yaml', early)
      writePathway(tmp, 'z-late.yaml', late)
      const info = await seedFromDataDir(openSeedStore(), tmp)
      expect(info.pathways).toBe(2)
      expect(info.processGraphCount).toBe(2)
    } finally {
      rmSync(tmp, { recursive: true, force: true })
    }
  })

  it('loads and validates landscape.yaml, returning it with a node count', async () => {
    const tmp = copyFixtures('carbon-seed-graph-')
    try {
      writePathway(tmp, 'mof-dac.yaml', goodWithGraphs)
      writeFileSync(join(tmp, 'landscape.yaml'), stringify(landscape))
      const info = await seedFromDataDir(openSeedStore(), tmp)
      expect(info.landscapeNodeCount).toBe(3)
      expect(info.landscapeGraph?.nodes.map((n) => n.id)).toContain('setting:DAC')
      expect(info.landscapeGraph?.edges).toHaveLength(1)
    } finally {
      rmSync(tmp, { recursive: true, force: true })
    }
  })

  it('rejects a landscape referencing a pathway with no pathway node', async () => {
    const tmp = copyFixtures('carbon-seed-graph-')
    try {
      const partial = { nodes: landscape.nodes.filter((n) => n.id !== 'pathway:mof-dac'), edges: [] }
      writeFileSync(join(tmp, 'landscape.yaml'), stringify(partial))
      await expect(seedFromDataDir(openSeedStore(), tmp))
        .rejects.toThrow(/landscape\.yaml: landscape: pathway 'mof-dac' has no pathway node/)
    } finally {
      rmSync(tmp, { recursive: true, force: true })
    }
  })

  it('rejects a non-mapping landscape document', async () => {
    const tmp = copyFixtures('carbon-seed-graph-')
    try {
      writeFileSync(join(tmp, 'landscape.yaml'), '- a\n- b\n')
      await expect(seedFromDataDir(openSeedStore(), tmp))
        .rejects.toThrow(/landscape\.yaml: expected a YAML mapping, got array/)
    } finally {
      rmSync(tmp, { recursive: true, force: true })
    }
  })

  it('non-strict mode accepts a corpus with no graphs at all', async () => {
    await expect(seedFromDataDir(openSeedStore(), fixturesDir)).resolves.toMatchObject({ pathways: 1, processGraphCount: 0 })
  })

  it('strict mode rejects a corpus missing pathway graphs and landscape', async () => {
    const tmp = copyFixtures('carbon-seed-graph-')
    try {
      await expect(seedFromDataDir(openSeedStore(), tmp, { requireCompleteGraphs: true }))
        .rejects.toThrow(/mof-dac\.yaml: mof-dac: missing process_graph/)
    } finally {
      rmSync(tmp, { recursive: true, force: true })
    }
  })

  it('strict mode rejects a landscape-less corpus once pathway graphs exist', async () => {
    const tmp = copyFixtures('carbon-seed-graph-')
    try {
      writePathway(tmp, 'mof-dac.yaml', goodWithGraphs)
      await expect(seedFromDataDir(openSeedStore(), tmp, { requireCompleteGraphs: true }))
        .rejects.toThrow(/landscape\.yaml: missing landscape graph/)
    } finally {
      rmSync(tmp, { recursive: true, force: true })
    }
  })

  it('strict mode accepts a complete corpus with graphs and landscape', async () => {
    const tmp = copyFixtures('carbon-seed-graph-')
    try {
      writePathway(tmp, 'mof-dac.yaml', goodWithGraphs)
      writeFileSync(join(tmp, 'landscape.yaml'), stringify(landscape))
      const info = await seedFromDataDir(openSeedStore(), tmp, { requireCompleteGraphs: true })
      expect(info).toMatchObject({ pathways: 1, processGraphCount: 1, operationalGraphCount: 1, landscapeNodeCount: 3 })
    } finally {
      rmSync(tmp, { recursive: true, force: true })
    }
  })
})
