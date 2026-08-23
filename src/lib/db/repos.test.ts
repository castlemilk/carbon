import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Database } from 'better-sqlite3'
import { openDb } from './index'
import {
  insertPathway, getPathway, listPathways,
  insertCitation, getCitation,
  upsertShortlist, listShortlist, upsertJournal, listJournal, deleteJournal, putLitCache, getLitCache,
} from './repos'
import { fromJson } from '@bufbuild/protobuf'
import { PathwaySchema } from '@/lib/gen/carbon/v1/pathway_pb'
import { CitationSchema } from '@/lib/gen/carbon/v1/common_pb'
import { ShortlistEntrySchema, JournalEntrySchema, ShortlistStatus, EntryKind } from '@/lib/gen/carbon/v1/research_pb'

const mkPathway = (id: string) => fromJson(PathwaySchema, { id, name: id.toUpperCase(), setting: 'DAC', trl: 5 })

describe('repos', () => {
  let dir: string
  let dbs: Database[]
  const open = () => {
    const db = openDb(join(dir, `t-${Math.random().toString(36).slice(2)}.db`))
    dbs.push(db)
    return db
  }

  beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'carbon-db-')); dbs = [] })
  afterEach(() => {
    for (const d of dbs) d.close()
    rmSync(dir, { recursive: true, force: true })
  })

  it('pathway insert + hydrate round-trips through protojson', () => {
    const db = open()
    const p = mkPathway('mof-dac')
    insertPathway(db, p)
    const got = getPathway(db, 'mof-dac')!
    expect(got.name).toBe('MOF-DAC')
    expect(got.setting).toBe(p.setting)
    expect(listPathways(db)).toHaveLength(1)
  })

  it('stores docs as snake_case protojson matching the seed-YAML style', () => {
    const db = open()
    insertPathway(db, fromJson(PathwaySchema, {
      id: 'mof-dac',
      name: 'MOF DAC',
      setting: 'DAC',
      trl: 5,
      search_terms: ['mofs'],
      material_ids: ['mof-303'],
      metrics: { thermal_energy: { low: 4, high: 8, unit: 'GJ/tCO2', year_basis: 2026, source_ref: 'c1' } },
    }))
    const row = db.prepare('SELECT doc FROM pathways WHERE id=?').get('mof-dac') as { doc: string }
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

  it('shortlist + journal persist and hydrate', () => {
    const db = open()
    upsertShortlist(db, fromJson(ShortlistEntrySchema, { pathway_id: 'mof-dac', status: 'CANDIDATE', rationale: 'promising', updated_at: '2026-08-23T00:00:00.000Z' }))
    expect(listShortlist(db)[0]!.entry.status).toBe(ShortlistStatus.CANDIDATE)   // hydrated = numeric enum
    expect(listShortlist(db)[0]!.existsInSeed).toBe(false)
    expect((db.prepare('SELECT status FROM shortlist').get() as { status: string }).status).toBe('CANDIDATE')  // persisted = name
    upsertJournal(db, fromJson(JournalEntrySchema, { id: 'j1', kind: 'OBSERVATION', title: 'T', body_markdown: 'b', pathway_refs: ['mof-dac'], created_at: '2026-08-23T00:00:00.000Z' }))
    expect(listJournal(db)).toHaveLength(1)
  })

  it('journal entries keep field fidelity through the extracted-columns round-trip', () => {
    const db = open()
    upsertJournal(db, fromJson(JournalEntrySchema, { id: 'j1', kind: 'OBSERVATION', title: 'Title', body_markdown: '**body**', pathway_refs: ['mof-dac', 'ocean-dic'], created_at: '2026-08-23T00:00:00.000Z' }))
    const got = listJournal(db)[0]!
    expect(got.id).toBe('j1')
    expect(got.kind).toBe(EntryKind.OBSERVATION)
    expect(got.title).toBe('Title')
    expect(got.bodyMarkdown).toBe('**body**')
    expect(got.pathwayRefs).toEqual(['mof-dac', 'ocean-dic'])
    expect(got.createdAt).toBe('2026-08-23T00:00:00.000Z')
    // journal_entries has no doc column: enum persists as NAME, refs as a JSON array
    const row = db.prepare('SELECT kind, pathway_refs FROM journal_entries WHERE id=?').get('j1') as { kind: string; pathway_refs: string }
    expect(row.kind).toBe('OBSERVATION')
    expect(JSON.parse(row.pathway_refs)).toEqual(['mof-dac', 'ocean-dic'])
  })

  it('deleteJournal removes the entry', () => {
    const db = open()
    upsertJournal(db, fromJson(JournalEntrySchema, { id: 'j1', kind: 'OBSERVATION', title: 'T', body_markdown: 'b', pathway_refs: [], created_at: '2026-08-23T00:00:00.000Z' }))
    expect(listJournal(db)).toHaveLength(1)
    deleteJournal(db, 'j1')
    expect(listJournal(db)).toHaveLength(0)
  })

  it('citations round-trip repeated authors and year', () => {
    const db = open()
    insertCitation(db, fromJson(CitationSchema, { id: 'c1', title: 'MOFs for DAC', authors: ['A One', 'B Two'], year: 2024, venue: 'Nature', url: 'https://example.com/paper' }))
    const got = getCitation(db, 'c1')!
    expect(got.title).toBe('MOFs for DAC')
    expect(got.authors).toEqual(['A One', 'B Two'])
    expect(got.year).toBe(2024)
    expect(getCitation(db, 'nope')).toBeUndefined()
  })

  it('existsInSeed is true when the pathway was inserted first', () => {
    const db = open()
    insertPathway(db, mkPathway('mof-dac'))
    upsertShortlist(db, fromJson(ShortlistEntrySchema, { pathway_id: 'mof-dac', status: 'CANDIDATE', rationale: 'promising', updated_at: '2026-08-23T00:00:00.000Z' }))
    expect(listShortlist(db)[0]!.existsInSeed).toBe(true)
  })

  it('lit cache put/get by pathway id', () => {
    const db = open()
    putLitCache(db, 'mof-dac', Date.now(), JSON.stringify([{ id: 'openalex:w1' }]))
    expect(JSON.parse(getLitCache(db, 'mof-dac')!.worksJson)[0].id).toBe('openalex:w1')
    expect(getLitCache(db, 'nope')).toBeNull()
  })
})
