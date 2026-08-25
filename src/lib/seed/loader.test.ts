import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mkdtempSync, rmSync, cpSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
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
  const fixturesDir = join(__dirname, 'fixtures')
  let dir: string
  let stores: ReturnType<typeof makeSqliteStore>[]
  const open = () => {
    const store = makeSqliteStore(join(dir, `t-${Math.random().toString(36).slice(2)}.db`))
    void store.initSchema()
    stores.push(store)
    return store
  }
  const copiedFixtures = () => {
    const tmp = mkdtempSync(join(tmpdir(), 'carbon-seed-copy-'))
    cpSync(fixturesDir, tmp, { recursive: true })
    return tmp
  }

  beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'carbon-seed-')); stores = [] })
  afterEach(() => {
    for (const st of stores) st.raw.close()
    rmSync(dir, { recursive: true, force: true })
  })

  it('loads the committed fixtures and returns counts', async () => {
    await expect(seedFromDataDir(open(), fixturesDir)).resolves.toEqual({ citations: 1, materials: 1, pathways: 1 })
  })

  it('fails with filename + ref prefix on unresolved source_ref', async () => {
    const bad = mkdtempSync(join(tmpdir(), 'carbon-seed-bad-'))
    try {
      cpSync(fixturesDir, bad, { recursive: true })
      writeFileSync(join(bad, 'pathways', 'mystery-dac.yaml'), 'id: mystery-dac\nname: Mystery\nsetting: DAC\ntrl: 3\nsource_refs: [nope2020]\n')
      await expect(seedFromDataDir(open(), bad)).rejects.toThrow(/mystery-dac\.yaml.*nope2020/)
    } finally {
      rmSync(bad, { recursive: true, force: true })
    }
  })

  it('rejects duplicate ids across files, listing every colliding file', async () => {
    const dup = mkdtempSync(join(tmpdir(), 'carbon-seed-dup-'))
    try {
      cpSync(fixturesDir, dup, { recursive: true })
      writeFileSync(join(dup, 'pathways', 'mof-dac-again.yaml'), 'id: mof-dac\nname: MOF DAC Again\nsetting: DAC\ntrl: 5\n')
      await expect(seedFromDataDir(open(), dup)).rejects.toThrow(
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
      await expect(seedFromDataDir(open(), tmp)).resolves.toBeTruthy()
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
      await expect(seedFromDataDir(open(), bad)).rejects.toThrow(/sources\/empty\.yaml: expected a YAML mapping, got empty document/)
      rmSync(join(bad, 'sources', 'empty.yaml'))
      await expect(seedFromDataDir(open(), bad)).rejects.toThrow(/sources\/list\.yaml: expected a YAML mapping, got array/)
    } finally {
      rmSync(bad, { recursive: true, force: true })
    }
  })

  it('re-seeding resyncs: removed pathway file means removed row', async () => {
    const store = open()
    const dataDir = copiedFixtures()
    try {
      expect(await seedFromDataDir(store, dataDir)).toEqual({ citations: 1, materials: 1, pathways: 1 })
      rmSync(join(dataDir, 'pathways', 'mof-dac.yaml'))
      expect(await seedFromDataDir(store, dataDir)).toEqual({ citations: 1, materials: 1, pathways: 0 })
      expect(await store.listPathways()).toHaveLength(0)
      expect(await store.listMaterials()).toHaveLength(1)
    } finally {
      rmSync(dataDir, { recursive: true, force: true })
    }
  })

  it('store.seedDrift reports shortlist/journal refs missing from pathways', async () => {
    const store = open()
    await seedFromDataDir(store, fixturesDir)
    await store.putShortlist({ pathwayId: 'mof-dac', status: 'CANDIDATE', rationale: '', updatedAt: '2026-01-01' })
    await store.putShortlist({ pathwayId: 'gone', status: 'CANDIDATE', rationale: '', updatedAt: '2026-01-02' })
    await store.putJournal({ id: 'j1', kind: 'OBSERVATION', title: 't', bodyMarkdown: 'b', pathwayRefs: ['mof-dac', 'ocean'], createdAt: '2026-01-03' })
    expect(await store.seedDrift()).toEqual(['shortlist:gone', 'journal:ocean'])
  })
})
