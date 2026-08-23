import fs from 'node:fs'
import path from 'node:path'
import { parse } from 'yaml'
import { fromJson, type DescMessage, type MessageShape } from '@bufbuild/protobuf'
import type { Database } from 'better-sqlite3'
import { PathwaySchema } from '@/lib/gen/carbon/v1/pathway_pb'
import { MaterialSchema } from '@/lib/gen/carbon/v1/material_pb'
import { CitationSchema, type Citation } from '@/lib/gen/carbon/v1/common_pb'
import type { Pathway } from '@/lib/gen/carbon/v1/pathway_pb'
import type { Material } from '@/lib/gen/carbon/v1/material_pb'
import { insertCitation, insertMaterial, insertPathway } from '@/lib/db/repos'

export const UNIT_ALLOWLIST = [
  'USD/tCO2', 'GJ/tCO2', 'GJ-e/tCO2', 'Gt/yr', 'Mt/yr', 'years', 'mmol/g', 'kJ/mol', 'USD/kg',
] as const

type AnyDoc = Record<string, unknown>

// strict protojson: throws with a field path; re-wrapped with the doc id for boot-error precision
function parseStrict<D extends DescMessage>(id: string, schema: D, doc: AnyDoc): MessageShape<D> {
  try {
    return fromJson(schema, doc as never, { ignoreUnknownFields: false })
  } catch (e) {
    throw new Error(`${id}: ${(e as Error).message}`)
  }
}

function checkRanges(ranges: AnyDoc | undefined, id: string, kind: string, citations: Set<string>) {
  for (const [k, v] of Object.entries(ranges ?? {})) {
    const m = v as AnyDoc
    // proto3 defaults absent scalars to 0 — explicitly reject missing low/high
    if (typeof m.low !== 'number' || typeof m.high !== 'number')
      throw new Error(`${id}: ${kind} '${k}' must define numeric low and high`)
    if (!UNIT_ALLOWLIST.includes(m.unit as never))
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
  return parseStrict(String(doc.id ?? '?'), CitationSchema, doc)
}

export function validatePathwayDoc(doc: AnyDoc, citations: Set<string>, materials: Set<string>): Pathway {
  const id = String(doc.id ?? '?')
  checkRanges(doc.metrics as AnyDoc | undefined, id, 'metric', citations)
  checkRefs(doc.source_refs as string[], citations, 'source_ref', id)
  checkRefs(doc.material_ids as string[], materials, 'material_id', id)
  const p = parseStrict(id, PathwaySchema, doc)
  if (p.trl < 1 || p.trl > 9) throw new Error(`${id}: trl ${p.trl} outside 1..9`)
  return p
}

export function validateMaterialDoc(doc: AnyDoc, citations: Set<string>): Material {
  const id = String(doc.id ?? '?')
  checkRanges(doc.properties as AnyDoc | undefined, id, 'property', citations)
  return parseStrict(id, MaterialSchema, doc)
}

const readYamls = (dir: string, validate: (d: AnyDoc) => unknown): unknown[] =>
  !fs.existsSync(dir) ? [] : fs.readdirSync(dir).filter(f => f.endsWith('.yaml')).sort().map(f => {
    let doc: AnyDoc
    try { doc = parse(fs.readFileSync(path.join(dir, f), 'utf8')) as AnyDoc }
    catch (e) { throw new Error(`${f}: YAML parse error: ${(e as Error).message}`) }
    try { return validate(doc) } catch (e) { throw new Error(`${f}: ${(e as Error).message}`) }
  })

export function seedFromDataDir(db: Database, dataDir: string): { citations: number; materials: number; pathways: number } {
  const citations = readYamls(path.join(dataDir, 'sources'), d => validateCitationDoc(d)) as Citation[]
  const citationIds = new Set(citations.map(c => c.id))
  const materials = readYamls(path.join(dataDir, 'materials'), d => validateMaterialDoc(d, citationIds)) as Material[]
  const materialIds = new Set(materials.map(m => m.id))
  const pathways = readYamls(path.join(dataDir, 'pathways'), d => validatePathwayDoc(d, citationIds, materialIds)) as Pathway[]
  const tx = db.transaction(() => {
    for (const c of citations) insertCitation(db, c)
    for (const m of materials) insertMaterial(db, m)
    for (const p of pathways) insertPathway(db, p)
  })
  tx()
  return { citations: citations.length, materials: materials.length, pathways: pathways.length }
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
