import fs from 'node:fs'
import path from 'node:path'
import { parse } from 'yaml'
import { fromJson, type DescMessage, type MessageShape } from '@bufbuild/protobuf'
import type { Database } from 'better-sqlite3'
import { PathwaySchema, Setting } from '@/lib/gen/carbon/v1/pathway_pb'
import { MaterialSchema } from '@/lib/gen/carbon/v1/material_pb'
import { CitationSchema, type Citation } from '@/lib/gen/carbon/v1/common_pb'
import type { Pathway } from '@/lib/gen/carbon/v1/pathway_pb'
import type { Material } from '@/lib/gen/carbon/v1/material_pb'
import { insertCitation, insertMaterial, insertPathway } from '@/lib/db/repos'

const UNIT_VALUES = [
  'USD/tCO2', 'GJ/tCO2', 'GJ-e/tCO2', 'Gt/yr', 'Mt/yr', 'years', 'mmol/g', 'kJ/mol', 'USD/kg',
]
export const UNIT_ALLOWLIST: ReadonlySet<string> = new Set(UNIT_VALUES)

export const KNOWN_METRIC_KEYS = ['cost', 'energy_thermal', 'energy_electric', 'energy_total', 'capacity_potential', 'permanence', 'land_footprint', 'water_footprint']
export const KNOWN_PROPERTY_KEYS = ['working_capacity', 'regeneration_energy', 'selectivity', 'lifetime', 'cost']

type AnyDoc = Record<string, unknown>

// strict protojson: throws with a field path; re-wrapped with the doc id for boot-error precision
function parseStrict<D extends DescMessage>(id: string, schema: D, doc: AnyDoc): MessageShape<D> {
  try {
    return fromJson(schema, doc as never, { ignoreUnknownFields: false })
  } catch (e) {
    throw new Error(`${id}: ${(e as Error).message}`)
  }
}

function requireId(doc: AnyDoc): string {
  const id = typeof doc.id === 'string' ? doc.id.trim() : ''
  if (!id) throw new Error("missing non-empty 'id'")
  return id
}

function checkRanges(ranges: AnyDoc | undefined, id: string, kind: string, citations: Set<string>, knownKeys: string[]) {
  const known = new Set(knownKeys)
  for (const [k, v] of Object.entries(ranges ?? {})) {
    // proto maps are open-ended by spec — unknown keys warn instead of throw so future
    // metric types don't break old loaders, but authoring typos still surface loudly
    if (!known.has(k)) console.warn(`${id}: ${kind} key '${k}' is not a known ${kind} key (typo?)`)
    const m = v as AnyDoc
    // proto3 defaults absent scalars to 0 — explicitly reject missing low/high/year_basis
    if (typeof m.low !== 'number' || typeof m.high !== 'number')
      throw new Error(`${id}: ${kind} '${k}' must define numeric low and high`)
    if (typeof m.year_basis !== 'number')
      throw new Error(`${id}: ${kind} '${k}' must define numeric year_basis`)
    if (typeof m.unit !== 'string' || !UNIT_ALLOWLIST.has(m.unit))
      throw new Error(`${id}: ${kind} '${k}' has unit '${m.unit}' not in allowlist`)
    if ((m.low as number) > (m.high as number)) throw new Error(`${id}: ${kind} '${k}' low > high`)
    if (!m.source_ref) throw new Error(`${id}: ${kind} '${k}' missing source_ref`)
    if (!citations.has(m.source_ref as string))
      throw new Error(`${id}: ${kind} '${k}' source_ref '${m.source_ref}' not found`)
  }
}

function checkRefs(refs: string[] | undefined, known: Set<string>, what: string, id: string) {
  for (const r of refs ?? []) if (!known.has(r)) throw new Error(`${id}: ${what} '${r}' not found`)
}

export function validateCitationDoc(doc: AnyDoc): Citation {
  return parseStrict(requireId(doc), CitationSchema, doc)
}

export function validatePathwayDoc(doc: AnyDoc, citations: Set<string>, materials: Set<string>): Pathway {
  const id = requireId(doc)
  checkRanges(doc.metrics as AnyDoc | undefined, id, 'metric', citations, KNOWN_METRIC_KEYS)
  checkRefs(doc.source_refs as string[], citations, 'source_ref', id)
  checkRefs(doc.material_ids as string[], materials, 'material_id', id)
  const p = parseStrict(id, PathwaySchema, doc)
  if (p.setting === Setting.SETTING_UNSPECIFIED)
    throw new Error(`${id}: setting must be one of POINT_SOURCE|DAC|OCEAN_DIC|MINERALIZATION|BIOLOGICAL`)
  if (p.trl < 1 || p.trl > 9) throw new Error(`${id}: trl ${p.trl} outside 1..9`)
  return p
}

export function validateMaterialDoc(doc: AnyDoc, citations: Set<string>): Material {
  const id = requireId(doc)
  checkRanges(doc.properties as AnyDoc | undefined, id, 'property', citations, KNOWN_PROPERTY_KEYS)
  return parseStrict(id, MaterialSchema, doc)
}

type LoadedDoc = { file: string; doc: AnyDoc }

// .yaml-only rule: seed authoring is YAML, .yml is deliberately rejected so a mis-suffixed
// file can never be silently skipped during load
const readYamls = (dir: string): LoadedDoc[] =>
  !fs.existsSync(dir) ? [] : fs.readdirSync(dir).filter(f => f.endsWith('.yaml')).sort().flatMap(f => {
    const full = path.join(dir, f)
    if (!fs.statSync(full).isFile()) return []
    let parsed: unknown
    try { parsed = parse(fs.readFileSync(full, 'utf8')) }
    catch (e) { throw new Error(`${path.basename(dir)}/${f}: YAML parse error: ${(e as Error).message}`) }
    const got = parsed === null || parsed === '' ? 'empty document' : Array.isArray(parsed) ? 'array' : typeof parsed
    if (got !== 'object')
      throw new Error(`${path.basename(dir)}/${f}: expected a YAML mapping, got ${got}`)
    return [{ file: `${path.basename(dir)}/${f}`, doc: parsed as AnyDoc }]
  })

function assertUniqueIds(docs: LoadedDoc[], kind: string) {
  const filesById = new Map<string, string[]>()
  for (const { file, doc } of docs) {
    const id = typeof doc.id === 'string' ? doc.id.trim() : ''
    if (!id) continue // empty ids surface via the validator with the same file prefix
    const files = filesById.get(id) ?? []
    files.push(file)
    filesById.set(id, files)
  }
  const dupes = [...filesById.entries()].filter(([, files]) => files.length > 1)
  if (dupes.length)
    throw new Error(dupes.map(([id, files]) => `duplicate ${kind} id '${id}' (${files.join(', ')})`).join('; '))
}

function loadBatch<T>(dir: string, kind: string, validate: (d: AnyDoc) => T): T[] {
  const docs = readYamls(dir)
  assertUniqueIds(docs, kind)
  return docs.map(({ file, doc }) => {
    try { return validate(doc) } catch (e) { throw new Error(`${file}: ${(e as Error).message}`) }
  })
}

export function seedFromDataDir(db: Database, dataDir: string): { citations: number; materials: number; pathways: number } {
  const citations = loadBatch<Citation>(path.join(dataDir, 'sources'), 'citation', d => validateCitationDoc(d))
  const citationIds = new Set(citations.map(c => c.id))
  const materials = loadBatch<Material>(path.join(dataDir, 'materials'), 'material', d => validateMaterialDoc(d, citationIds))
  const materialIds = new Set(materials.map(m => m.id))
  const pathways = loadBatch<Pathway>(path.join(dataDir, 'pathways'), 'pathway', d => validatePathwayDoc(d, citationIds, materialIds))

  let writtenCitations = 0, writtenMaterials = 0, writtenPathways = 0
  const tx = db.transaction(() => {
    // full git-truth resync: tables mirror data/ exactly; shortlist/journal are runtime
    // state and untouched here (drift there is findSeedDrift's job)
    db.prepare('DELETE FROM citations').run()
    db.prepare('DELETE FROM materials').run()
    db.prepare('DELETE FROM pathways').run()
    for (const c of citations) writtenCitations += insertCitation(db, c).changes
    for (const m of materials) writtenMaterials += insertMaterial(db, m).changes
    for (const p of pathways) writtenPathways += insertPathway(db, p).changes
  })
  tx()
  return { citations: writtenCitations, materials: writtenMaterials, pathways: writtenPathways }
}

export function findSeedDrift(db: Database): string[] {
  const pathwayIds = new Set((db.prepare('SELECT id FROM pathways').all() as { id: string }[]).map(r => r.id))
  const drifted: string[] = []
  for (const r of db.prepare('SELECT pathway_id FROM shortlist').all() as { pathway_id: string }[])
    if (!pathwayIds.has(r.pathway_id)) drifted.push(`shortlist:${r.pathway_id}`)
  for (const r of db.prepare('SELECT pathway_refs FROM journal_entries').all() as { pathway_refs: string }[])
    for (const ref of JSON.parse(r.pathway_refs) as string[])
      if (!pathwayIds.has(ref)) drifted.push(`journal:${ref}`)
  return [...new Set(drifted)]
}
