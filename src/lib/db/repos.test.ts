import { describe, it, expect, beforeEach } from 'vitest'
import { openDb } from './index'
import {
  insertPathway, getPathway, listPathways,
  upsertShortlist, listShortlist, upsertJournal, listJournal, putLitCache, getLitCache,
} from './repos'
import { fromJson } from '@bufbuild/protobuf'
import { PathwaySchema } from '@/lib/gen/carbon/v1/pathway_pb'
import { ShortlistEntrySchema, JournalEntrySchema, ShortlistStatus } from '@/lib/gen/carbon/v1/research_pb'

const dbFile = () => `${__dirname}/tmp-${Math.random().toString(36).slice(2)}.db`
const mkPathway = (id: string) => fromJson(PathwaySchema, { id, name: id.toUpperCase(), setting: 'DAC', trl: 5 })

describe('repos', () => {
  let file: string
  beforeEach(() => { file = dbFile() })

  it('pathway insert + hydrate round-trips through protojson', () => {
    const db = openDb(file)
    const p = mkPathway('mof-dac')
    insertPathway(db, p)
    const got = getPathway(db, 'mof-dac')!
    expect(got.name).toBe('MOF-DAC')
    expect(listPathways(db)).toHaveLength(1)
  })

  it('shortlist + journal persist and hydrate', () => {
    const db = openDb(file)
    upsertShortlist(db, fromJson(ShortlistEntrySchema, { pathway_id: 'mof-dac', status: 'CANDIDATE', rationale: 'promising', updated_at: '2026-08-23T00:00:00.000Z' }))
    expect(listShortlist(db)[0]!.entry.status).toBe(ShortlistStatus.CANDIDATE)   // hydrated = numeric enum
    expect(listShortlist(db)[0]!.existsInSeed).toBe(false)
    expect((db.prepare('SELECT status FROM shortlist').get() as { status: string }).status).toBe('CANDIDATE')  // persisted = name
    upsertJournal(db, fromJson(JournalEntrySchema, { id: 'j1', kind: 'OBSERVATION', title: 'T', body_markdown: 'b', pathway_refs: ['mof-dac'], created_at: '2026-08-23T00:00:00.000Z' }))
    expect(listJournal(db)).toHaveLength(1)
  })

  it('lit cache put/get by pathway id', () => {
    const db = openDb(file)
    putLitCache(db, 'mof-dac', Date.now(), JSON.stringify([{ id: 'openalex:w1' }]))
    expect(JSON.parse(getLitCache(db, 'mof-dac')!.worksJson)[0].id).toBe('openalex:w1')
    expect(getLitCache(db, 'nope')).toBeNull()
  })
})
