import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fromJson } from '@bufbuild/protobuf'
import { PathwaySchema, Setting } from '@/lib/gen/carbon/v1/pathway_pb'
import type { CarbonStore } from './store'
import { makeSqliteStore } from './sqlite-store'
import { createTursoStore } from './turso-store'

// Adapter-conformance contract: both drivers must behave identically for the
// operations the app relies on. The Turso leg runs only when credentials are
// provided (CARBON_TEST_TURSO_URL / CARBON_TEST_TURSO_TOKEN) so CI stays hermetic;
// run it before wiring a real deployment:
//   CARBON_TEST_TURSO_URL=libsql://… CARBON_TEST_TURSO_TOKEN=… npx vitest run src/lib/db
const tursoUrl = process.env.CARBON_TEST_TURSO_URL

const mkPathway = (id: string, name = id.toUpperCase()) =>
  fromJson(PathwaySchema, { id, name, setting: 'DAC', trl: 5, search_terms: [`${id} lit`] })

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

  it('replaceSeed is a full resync and counts rows written', async () => {
    expect(await ctx.store.replaceSeed({ citations: [], materials: [], pathways: [mkPathway('a'), mkPathway('b')] }))
      .toEqual({ citations: 0, materials: 0, pathways: 2 })
    expect(await ctx.store.replaceSeed({ citations: [], materials: [], pathways: [mkPathway('a', 'A Only')] }))
      .toEqual({ citations: 0, materials: 0, pathways: 1 })
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
})
