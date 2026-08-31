import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fromJson, toJson } from '@bufbuild/protobuf'
import { CitationSchema } from '@/lib/gen/carbon/v1/common_pb'
import { PathwaySchema, Setting } from '@/lib/gen/carbon/v1/pathway_pb'
import { MaterialSchema } from '@/lib/gen/carbon/v1/material_pb'
import { LandscapeGraphSchema, type LandscapeGraph } from '@/lib/gen/carbon/v1/landscape_pb'
import type { CarbonStore } from './store'
import { makeSqliteStore, __setSqliteTestInjectFailure } from './sqlite-store'
import { createTursoStore, __setTursoTestInjectFailure } from './turso-store'

// Adapter-conformance contract: both drivers must behave identically for the
// operations the app relies on. The Turso leg runs only when credentials are
// provided (CARBON_TEST_TURSO_URL / CARBON_TEST_TURSO_TOKEN) so CI stays hermetic;
// run it before wiring a real deployment:
//   CARBON_TEST_TURSO_URL=libsql://… CARBON_TEST_TURSO_TOKEN=… npx vitest run src/lib/db
const tursoUrl = process.env.CARBON_TEST_TURSO_URL

const mkPathway = (id: string, name = id.toUpperCase()) =>
  fromJson(PathwaySchema, { id, name, setting: 'DAC', trl: 5, search_terms: [`${id} lit`] })

const mkCitation = (id: string, year = 2024, title = id) =>
  fromJson(CitationSchema, { id, title, authors: [], year, venue: '', url: '' })

const mkMaterial = (id: string) =>
  fromJson(MaterialSchema, { id, name: id.toUpperCase(), class: 'MATERIAL_CLASS_UNSPECIFIED' })

// Re-encode to protojson for equality comparisons: survives enum int <-> name
// hydration cycles without depending on key ordering or default-scalar elision.
const reencode = (g: LandscapeGraph): string =>
  JSON.stringify(toJson(LandscapeGraphSchema, g, { useProtoFieldName: true }))

describe.each([
  ['sqlite', () => {
    const dir = mkdtempSync(join(tmpdir(), 'carbon-conf-'))
    const store = makeSqliteStore(join(dir, 'conf.db'))
    return { store: store as CarbonStore, cleanup: async () => { await store.close(); rmSync(dir, { recursive: true, force: true }) } }
  }],
  ...(tursoUrl ? [['turso', () => {
    const store = createTursoStore({ url: tursoUrl!, authToken: process.env.CARBON_TEST_TURSO_TOKEN })
    // unique table namespace per run is unnecessary: replaceSeed resyncs deterministically
    return { store: store as CarbonStore, cleanup: async () => { await store.close() } }
  }]] : []),
])('store conformance: %s', (_kind, factory) => {
  let ctx: { store: CarbonStore; cleanup: () => Promise<void> }

  beforeAll(async () => {
    ctx = (factory as () => { store: CarbonStore; cleanup: () => Promise<void> })()
    await ctx.store.initSchema()
  })
  afterAll(async () => { await ctx.cleanup() })
  // module-level flag — must reset between tests so a prior failure-injection
  // test doesn't leak into adjacent ones in the same describe block
  afterEach(() => {
    __setSqliteTestInjectFailure(false)
    __setTursoTestInjectFailure(false)
  })

  it('replaceSeed is a full resync and counts rows written', async () => {
    expect(await ctx.store.replaceSeed({ citations: [], materials: [], pathways: [mkPathway('a'), mkPathway('b')] }))
      .toEqual({ citations: 0, materials: 0, pathways: 2, landscapeGraphCount: 0 })
    expect(await ctx.store.replaceSeed({ citations: [], materials: [], pathways: [mkPathway('a', 'A Only')] }))
      .toEqual({ citations: 0, materials: 0, pathways: 1, landscapeGraphCount: 0 })
    expect((await ctx.store.listPathways()).map(p => p.id)).toEqual(['a'])
    expect((await ctx.store.listPathways())[0]!.name).toBe('A Only')
  })

  it('hydrates protojson with numeric enums and preserves list order by name', async () => {
    await ctx.store.replaceSeed({
      citations: [],
      materials: [],
      pathways: [mkPathway('zz'), fromJson(PathwaySchema, { id: 'aa', name: 'AA', setting: 'OCEAN_DIC', trl: 3 })],
    })
    const all = await ctx.store.listPathways()
    expect(all.map(p => p.id)).toEqual(['aa', 'zz']) // ORDER BY name
    const ocean = all.find(p => p.id === 'aa')!
    expect(ocean.setting).toBe(Setting.OCEAN_DIC)
  })

  it('shortlist/journal/lit-cache round-trip with existsInSeed + drift detection', async () => {
    await ctx.store.replaceSeed({ citations: [], materials: [], pathways: [mkPathway('mof-dac')] })
    await ctx.store.putShortlist({ pathwayId: 'ghost', status: 'CANDIDATE', rationale: '', updatedAt: '2026-01-01' })
    await ctx.store.putJournal({ id: 'j1', kind: 'OBSERVATION', title: 't', bodyMarkdown: 'b', pathwayRefs: ['gone'], createdAt: '2026-01-02' })
    await ctx.store.putLitCache('mof-dac', 1234, '[{"id":"openalex:w1"}]')

    expect(await ctx.store.getLitCache('mof-dac')).toMatchObject({ fetchedAt: 1234 })
    expect(await ctx.store.seedDrift()).toEqual(['shortlist:ghost', 'journal:gone'])
    const shortlist = await ctx.store.listShortlist()
    expect(shortlist[0]!.entry.pathwayId).toBe('ghost')
    expect(shortlist[0]!.existsInSeed).toBe(false)

    await ctx.store.deleteJournal('j1')
    expect(await ctx.store.seedDrift()).toEqual(['shortlist:ghost'])
  })

  it('listCitations returns all citations ordered by year DESC, title ASC', async () => {
    const mkCitation = (id: string, year: number, title: string) =>
      fromJson(CitationSchema, { id, title, authors: [], year, venue: '', url: '' })
    await ctx.store.replaceSeed({
      citations: [
        mkCitation('old', 2010, 'B paper'),
        mkCitation('new', 2024, 'A paper'),
        mkCitation('mid', 2018, 'Z paper'),
      ],
      materials: [],
      pathways: [mkPathway('p')],
    })
    const all = await ctx.store.listCitations()
    expect(all.map(c => c.id)).toEqual(['new', 'mid', 'old'])
    expect((await ctx.store.getCitation('new'))?.year).toBe(2024)
  })

  it('replaceSeed persists the landscape graph atomically with the rest of the seed', async () => {
    const graph = fromJson(LandscapeGraphSchema, {
      nodes: [
        { id: 'setting:DAC', label: 'Direct air capture', entity_type: 'GRAPH_ENTITY_TYPE_SETTING', entity_id: 'DAC' },
        { id: 'pathway:p1', label: 'P1', entity_type: 'GRAPH_ENTITY_TYPE_PATHWAY', entity_id: 'p1', metric_keys: ['trl'] },
      ],
      edges: [{ id: 'edge:sp1', source_node_id: 'setting:DAC', target_node_id: 'pathway:p1', kind: 'GRAPH_EDGE_KIND_RELATION' }],
    })
    const counts = await ctx.store.replaceSeed({
      citations: [],
      materials: [],
      pathways: [mkPathway('p1')],
      landscapeGraph: graph,
    })
    expect(counts.landscapeGraphCount).toBe(2)

    const got = await ctx.store.getLandscapeGraph()
    expect(got).toBeDefined()
    expect(reencode(got!)).toBe(reencode(graph))
  })

  it('re-seeding without a landscape graph clears the prior row', async () => {
    const graph = fromJson(LandscapeGraphSchema, {
      nodes: [{ id: 'setting:DAC', label: 'DAC', entity_type: 'GRAPH_ENTITY_TYPE_SETTING', entity_id: 'DAC' }],
      edges: [],
    })
    await ctx.store.replaceSeed({ citations: [], materials: [], pathways: [mkPathway('p1')], landscapeGraph: graph })
    expect(await ctx.store.getLandscapeGraph()).toBeDefined()

    await ctx.store.replaceSeed({ citations: [], materials: [], pathways: [mkPathway('p1')] })
    expect(await ctx.store.getLandscapeGraph()).toBeUndefined()

    // a subsequent replaceSeed WITH a graph puts it back — confirming the row is
    // re-created, not stuck at absent
    await ctx.store.replaceSeed({ citations: [], materials: [], pathways: [mkPathway('p1')], landscapeGraph: graph })
    expect(await ctx.store.getLandscapeGraph()).toBeDefined()
  })

  it('a failure injected mid-seed leaves every seed table in its prior state', async () => {
    const originalGraph = fromJson(LandscapeGraphSchema, {
      nodes: [
        { id: 'setting:DAC', label: 'DAC', entity_type: 'GRAPH_ENTITY_TYPE_SETTING', entity_id: 'DAC' },
        { id: 'pathway:p1', label: 'P1', entity_type: 'GRAPH_ENTITY_TYPE_PATHWAY', entity_id: 'p1', metric_keys: ['trl'] },
      ],
      edges: [{ id: 'edge:sp1', source_node_id: 'setting:DAC', target_node_id: 'pathway:p1', kind: 'GRAPH_EDGE_KIND_RELATION' }],
    })
    await ctx.store.replaceSeed({
      citations: [mkCitation('c1')],
      materials: [mkMaterial('m1')],
      pathways: [mkPathway('p1')],
      landscapeGraph: originalGraph,
    })

    const priorPathways = (await ctx.store.listPathways()).map(p => p.id)
    const priorCitations = (await ctx.store.listCitations()).map(c => c.id)
    const priorMaterials = (await ctx.store.listMaterials()).map(m => m.id)
    const priorLandscape = await ctx.store.getLandscapeGraph()
    expect(priorLandscape).toBeDefined()

    // failure fires AFTER deletes run, BEFORE inserts reach the server:
    // the adapter's transactional rollback must restore prior state
    __setSqliteTestInjectFailure(true)
    __setTursoTestInjectFailure(true)
    await expect(ctx.store.replaceSeed({
      citations: [mkCitation('c2', 1999, 'Different')],
      materials: [mkMaterial('m2')],
      pathways: [mkPathway('p2')],
      // omit landscape — would clear the prior row if reached
    })).rejects.toThrow()

    expect((await ctx.store.listPathways()).map(p => p.id)).toEqual(priorPathways)
    expect((await ctx.store.listCitations()).map(c => c.id)).toEqual(priorCitations)
    expect((await ctx.store.listMaterials()).map(m => m.id)).toEqual(priorMaterials)
    const postLandscape = await ctx.store.getLandscapeGraph()
    expect(postLandscape).toBeDefined()
    expect(reencode(postLandscape!)).toBe(reencode(priorLandscape!))
  })
})
