import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, cpSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Database } from 'better-sqlite3'
import { openDb } from '@/lib/db'
import { seedFromDataDir, findSeedDrift } from './loader'
import { validatePathwayDoc, validateMaterialDoc, UNIT_ALLOWLIST } from './loader'

const citationIds = new Set(['mcqueen2021'])
const materialIds = new Set(['mg2dobpdc'])

const good = {
  id: 'mof-dac', name: 'MOF DAC', setting: 'DAC', trl: 5,
  search_terms: ['mof dac'],
  metrics: { cost: { low: 80, high: 600, unit: 'USD/tCO2', year_basis: 2022, source_ref: 'mcqueen2021' } },
  material_ids: ['mg2dobpdc'],
  source_refs: ['mcqueen2021'],
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
  it('validates materials (unresolved source in property)', () => {
    const m = { id: 'mg2dobpdc', name: 'Mg2(dobpdc)', class: 'MOF',
      properties: { capacity: { low: 2, high: 4, unit: 'mmol/g', year_basis: 2019, source_ref: 'ghost' } } }
    expect(() => validateMaterialDoc(m, citationIds)).toThrow(/ghost/)
  })
})

describe('seedFromDataDir', () => {
  const fixturesDir = join(__dirname, 'fixtures')
  let dir: string
  let dbs: Database[]
  const open = () => {
    const db = openDb(join(dir, `t-${Math.random().toString(36).slice(2)}.db`))
    dbs.push(db)
    return db
  }

  beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'carbon-seed-')); dbs = [] })
  afterEach(() => {
    for (const d of dbs) d.close()
    rmSync(dir, { recursive: true, force: true })
  })

  it('loads the committed fixtures and returns counts', () => {
    expect(seedFromDataDir(open(), fixturesDir)).toEqual({ citations: 1, materials: 1, pathways: 1 })
  })

  it('fails with filename + ref prefix on unresolved source_ref', () => {
    const bad = mkdtempSync(join(tmpdir(), 'carbon-seed-bad-'))
    try {
      cpSync(fixturesDir, bad, { recursive: true })
      writeFileSync(join(bad, 'pathways', 'mystery-dac.yaml'), 'id: mystery-dac\nname: Mystery\nsetting: DAC\ntrl: 3\nsource_refs: [nope2020]\n')
      expect(() => seedFromDataDir(open(), bad)).toThrow(/mystery-dac\.yaml.*nope2020/)
    } finally {
      rmSync(bad, { recursive: true, force: true })
    }
  })

  it('findSeedDrift reports shortlist/journal refs missing from pathways', () => {
    const db = open()
    seedFromDataDir(db, fixturesDir)
    db.prepare(`INSERT OR REPLACE INTO shortlist (pathway_id,status,rationale,updated_at) VALUES ('mof-dac','CANDIDATE','','2026-01-01')`).run()
    db.prepare(`INSERT OR REPLACE INTO shortlist (pathway_id,status,rationale,updated_at) VALUES ('gone','CANDIDATE','','2026-01-02')`).run()
    db.prepare(`INSERT OR REPLACE INTO journal_entries (id,kind,title,body,pathway_refs,created_at) VALUES ('j1','OBSERVATION','t','b','["mof-dac","ocean"]','2026-01-03')`).run()
    expect(findSeedDrift(db)).toEqual(['shortlist:gone', 'journal:ocean'])
  })
})
