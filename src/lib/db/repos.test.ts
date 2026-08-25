import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { makeSqliteStore } from './sqlite-store'
import { fromJson } from '@bufbuild/protobuf'
import { PathwaySchema } from '@/lib/gen/carbon/v1/pathway_pb'
import { CitationSchema } from '@/lib/gen/carbon/v1/common_pb'
import { ShortlistEntrySchema, JournalEntrySchema, ShortlistStatus, EntryKind } from '@/lib/gen/carbon/v1/research_pb'

const mkPathway = (id: string) => fromJson(PathwaySchema, { id, name: id.toUpperCase(), setting: 'DAC', trl: 5 })

describe('sqlite store', () => {
  let dir: string
  let stores: ReturnType<typeof makeSqliteStore>[]
  const open = () => {
    const store = makeSqliteStore(join(dir, `t-${Math.random().toString(36).slice(2)}.db`))
    stores.push(store)
    return store
  }

  beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'carbon-db-')); stores = [] })
  afterEach(() => {
    for (const st of stores) st.raw.close()
    rmSync(dir, { recursive: true, force: true })
  })

  it('pathway insert + hydrate round-trips through protojson', async () => {
    const store = open()
    await store.initSchema()
    const p = mkPathway('mof-dac')
    await store.replaceSeed({ citations: [], materials: [], pathways: [p] })
    const got = await store.getPathway('mof-dac')
    expect(got!.name).toBe('MOF-DAC')
    expect(got!.setting).toBe(p.setting)
    expect(await store.listPathways()).toHaveLength(1)
  })

  it('stores docs as snake_case protojson matching the seed-YAML style', async () => {
    const store = open()
    await store.initSchema()
    await store.replaceSeed({ citations: [], materials: [], pathways: [fromJson(PathwaySchema, {
      id: 'mof-dac',
      name: 'MOF DAC',
      setting: 'DAC',
      trl: 5,
      search_terms: ['mofs'],
      material_ids: ['mof-303'],
      metrics: { thermal_energy: { low: 4, high: 8, unit: 'GJ/tCO2', year_basis: 2026, source_ref: 'c1' } },
    })] })
    const row = store.raw.prepare('SELECT doc FROM pathways WHERE id=?').get('mof-dac') as { doc: string }
    const doc = JSON.parse(row.doc) as Record<string, unknown>
    expect(doc.setting).toBe('DAC')
    expect(doc.search_terms).toEqual(['mofs'])
    expect(doc.material_ids).toEqual(['mof-303'])
    const metric = doc.metrics as Record<string, Record<string, unknown>>
    expect(metric.thermal_energy!.year_basis).toBe(2026)
    expect(metric.thermal_energy!.source_ref).toBe('c1')
    expect(Object.keys(doc)).not.toContain('searchTerms')
    expect(Object.keys(metric.thermal_energy!)).not.toContain('yearBasis')
  })

  it('shortlist + journal persist and hydrate', async () => {
    const store = open()
    await store.initSchema()
    await store.putShortlist({ pathwayId: 'mof-dac', status: 'CANDIDATE', rationale: 'promising', updatedAt: '2026-08-23T00:00:00.000Z' })
    const rows = await store.listShortlist()
    expect(rows[0]!.entry.status).toBe(ShortlistStatus.CANDIDATE)   // hydrated = numeric enum
    expect(rows[0]!.existsInSeed).toBe(false)
    expect((store.raw.prepare('SELECT status FROM shortlist').get() as { status: string }).status).toBe('CANDIDATE')  // persisted = name
    await store.putJournal({ id: 'j1', kind: 'OBSERVATION', title: 'T', bodyMarkdown: 'b', pathwayRefs: ['mof-dac'], createdAt: '2026-08-23T00:00:00.000Z' })
    expect(await store.listJournal()).toHaveLength(1)
  })

  it('journal entries keep field fidelity through the extracted-columns round-trip', async () => {
    const store = open()
    await store.initSchema()
    await store.putJournal({ id: 'j1', kind: 'OBSERVATION', title: 'Title', bodyMarkdown: '**body**', pathwayRefs: ['mof-dac', 'ocean-dic'], createdAt: '2026-08-23T00:00:00.000Z' })
    const got = (await store.listJournal())[0]!
    expect(got.id).toBe('j1')
    expect(got.kind).toBe(EntryKind.OBSERVATION)
    expect(got.title).toBe('Title')
    expect(got.bodyMarkdown).toBe('**body**')
    expect(got.pathwayRefs).toEqual(['mof-dac', 'ocean-dic'])
    expect(got.createdAt).toBe('2026-08-23T00:00:00.000Z')
    // journal_entries has no doc column: enum persists as NAME, refs as a JSON array
    const row = store.raw.prepare('SELECT kind, pathway_refs FROM journal_entries WHERE id=?').get('j1') as { kind: string; pathway_refs: string }
    expect(row.kind).toBe('OBSERVATION')
    expect(JSON.parse(row.pathway_refs)).toEqual(['mof-dac', 'ocean-dic'])
  })

  it('deleteJournal removes the entry', async () => {
    const store = open()
    await store.initSchema()
    await store.putJournal({ id: 'j1', kind: 'OBSERVATION', title: 'T', bodyMarkdown: 'b', pathwayRefs: [], createdAt: '2026-08-23T00:00:00.000Z' })
    expect(await store.listJournal()).toHaveLength(1)
    await store.deleteJournal('j1')
    expect(await store.listJournal()).toHaveLength(0)
  })

  it('citations round-trip repeated authors and year', async () => {
    const store = open()
    await store.initSchema()
    await store.replaceSeed({ citations: [fromJson(CitationSchema, { id: 'c1', title: 'MOFs for DAC', authors: ['A One', 'B Two'], year: 2024, venue: 'Nature', url: 'https://example.com/paper' })], materials: [], pathways: [] })
    const got = await store.getCitation('c1')
    expect(got!.title).toBe('MOFs for DAC')
    expect(got!.authors).toEqual(['A One', 'B Two'])
    expect(got!.year).toBe(2024)
    expect(await store.getCitation('nope')).toBeUndefined()
  })

  it('existsInSeed is true when the pathway was inserted first', async () => {
    const store = open()
    await store.initSchema()
    await store.replaceSeed({ citations: [], materials: [], pathways: [mkPathway('mof-dac')] })
    await store.putShortlist({ pathwayId: 'mof-dac', status: 'CANDIDATE', rationale: '', updatedAt: '2026-08-23T00:00:00.000Z' })
    expect((await store.listShortlist())[0]!.existsInSeed).toBe(true)
  })

  it('lit cache put/get by pathway id', async () => {
    const store = open()
    await store.initSchema()
    await store.putLitCache('mof-dac', Date.now(), JSON.stringify([{ id: 'openalex:w1' }]))
    const cached = await store.getLitCache('mof-dac')
    expect(JSON.parse(cached!.worksJson)[0].id).toBe('openalex:w1')
    expect(await store.getLitCache('nope')).toBeNull()
  })
})
