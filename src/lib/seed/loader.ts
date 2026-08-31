import fs from 'node:fs'
import path from 'node:path'
import { parse } from 'yaml'
import { fromJson, type DescMessage, type MessageShape } from '@bufbuild/protobuf'
import { PathwaySchema, Setting } from '@/lib/gen/carbon/v1/pathway_pb'
import { MaterialSchema } from '@/lib/gen/carbon/v1/material_pb'
import { CitationSchema, type Citation } from '@/lib/gen/carbon/v1/common_pb'
import type { Pathway } from '@/lib/gen/carbon/v1/pathway_pb'
import type { Material } from '@/lib/gen/carbon/v1/material_pb'
import { LandscapeGraphSchema, type LandscapeGraph } from '@/lib/gen/carbon/v1/landscape_pb'
import { validateLandscapeGraph, validateProcessGraph } from './graph'
import type { CarbonStore, SeedCounts } from '@/lib/db/store'

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

function checkRanges(ranges: AnyDoc | undefined, id: string, kind: string, citations: Set<string>, knownKeys: string[], ctx?: string) {
  const known = new Set(knownKeys)
  for (const [k, v] of Object.entries(ranges ?? {})) {
    // proto maps are open-ended by spec — unknown keys warn instead of throw so future
    // metric types don't break old loaders, but authoring typos still surface loudly
    if (!known.has(k)) console.warn(`${ctx ? `${ctx}: ` : ''}${id}: unknown ${kind} key '${k}' (typo?)`)
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

export function validatePathwayDoc(doc: AnyDoc, citations: Set<string>, materials: Set<string>, ctx?: string): Pathway {
  const id = requireId(doc)
  checkRanges(doc.metrics as AnyDoc | undefined, id, 'metric', citations, KNOWN_METRIC_KEYS, ctx)
  checkRefs(doc.source_refs as string[], citations, 'source_ref', id)
  checkRefs(doc.material_ids as string[], materials, 'material_id', id)
  const p = parseStrict(id, PathwaySchema, doc)
  if (p.setting === Setting.SETTING_UNSPECIFIED)
    throw new Error(`${id}: setting must be one of POINT_SOURCE|DAC|OCEAN_DIC|MINERALIZATION|BIOLOGICAL`)
  if (p.trl < 1 || p.trl > 9) throw new Error(`${id}: trl ${p.trl} outside 1..9`)
  return p
}

export function validateMaterialDoc(doc: AnyDoc, citations: Set<string>, ctx?: string): Material {
  const id = requireId(doc)
  checkRanges(doc.properties as AnyDoc | undefined, id, 'property', citations, KNOWN_PROPERTY_KEYS, ctx)
  return parseStrict(id, MaterialSchema, doc)
}

type LoadedDoc = { file: string; doc: AnyDoc }

// .yaml-only rule: seed authoring is YAML, .yml is deliberately rejected so a mis-suffixed
// file can never be silently skipped during load
const readYamlDoc = (full: string, rel: string): AnyDoc => {
  let parsed: unknown
  try { parsed = parse(fs.readFileSync(full, 'utf8')) }
  catch (e) { throw new Error(`${rel}: YAML parse error: ${(e as Error).message}`) }
  const got = parsed === null || parsed === '' ? 'empty document' : Array.isArray(parsed) ? 'array' : typeof parsed
  if (got !== 'object')
    throw new Error(`${rel}: expected a YAML mapping, got ${got}`)
  return parsed as AnyDoc
}

const readYamls = (dir: string): LoadedDoc[] =>
  !fs.existsSync(dir) ? [] : fs.readdirSync(dir).filter(f => f.endsWith('.yaml')).sort().flatMap(f => {
    const full = path.join(dir, f)
    if (!fs.statSync(full).isFile()) return []
    const rel = `${path.basename(dir)}/${f}`
    return [{ file: rel, doc: readYamlDoc(full, rel) }]
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

function loadBatch<T>(dir: string, kind: string, validate: (d: AnyDoc, file: string) => T): { file: string; value: T }[] {
  const docs = readYamls(dir)
  assertUniqueIds(docs, kind)
  return docs.map(({ file, doc }) => {
    try { return { file, value: validate(doc, `${path.basename(dir)}/${file}`) } } catch (e) { throw new Error(`${file}: ${(e as Error).message}`) }
  })
}

export interface SeedGraphOptions {
  /** Strict mode: every pathway needs process_graph + operational_graph and data/landscape.yaml must exist. */
  requireCompleteGraphs?: boolean
}

export interface SeedLoadInfo extends SeedCounts {
  processGraphCount: number
  operationalGraphCount: number
  landscapeGraph: LandscapeGraph | undefined
  landscapeNodeCount: number
}

export async function seedFromDataDir(store: CarbonStore, dataDir: string, options: SeedGraphOptions = {}): Promise<SeedLoadInfo> {
  const requireComplete = options.requireCompleteGraphs === true
  const citations = loadBatch<Citation>(path.join(dataDir, 'sources'), 'citation', (d) => validateCitationDoc(d)).map(d => d.value)
  const citationIds = new Set(citations.map(c => c.id))
  const materials = loadBatch<Material>(path.join(dataDir, 'materials'), 'material', (d, file) => validateMaterialDoc(d, citationIds, file)).map(d => d.value)
  const materialIds = new Set(materials.map(m => m.id))
  const pathwayDocs = loadBatch<Pathway>(path.join(dataDir, 'pathways'), 'pathway', (d, file) => validatePathwayDoc(d, citationIds, materialIds, file))
  const pathways = pathwayDocs.map(d => d.value)
  const pathwayIds = new Set(pathways.map(p => p.id))
  const refs = { citations: citationIds, materials: materialIds, pathways: pathwayIds }

  // graph subdocuments validate AFTER every document is read so entity refs
  // resolve regardless of file order (citations -> materials -> pathways -> graphs)
  const pathwayMetricKeys = new Map(pathways.map(p => [p.id, new Set<string>(['trl', ...Object.keys(p.metrics)])]))
  let processGraphCount = 0
  let operationalGraphCount = 0
  for (const { file, value: p } of pathwayDocs) {
    if (requireComplete && !p.processGraph)
      throw new Error(`${file}: ${p.id}: missing process_graph (requireCompleteGraphs)`)
    if (requireComplete && !p.operationalGraph)
      throw new Error(`${file}: ${p.id}: missing operational_graph (requireCompleteGraphs)`)
    const metricKeys = pathwayMetricKeys.get(p.id)!
    if (p.processGraph) {
      processGraphCount++
      validateProcessGraph(p.processGraph, { file, pathwayId: p.id, graphName: 'process_graph', refs, metricKeys })
    }
    if (p.operationalGraph) {
      operationalGraphCount++
      validateProcessGraph(p.operationalGraph, { file, pathwayId: p.id, graphName: 'operational_graph', refs, metricKeys })
    }
  }

  const landscapeRel = 'landscape.yaml'
  const landscapeFull = path.join(dataDir, landscapeRel)
  let landscapeGraph: LandscapeGraph | undefined
  if (fs.existsSync(landscapeFull)) {
    landscapeGraph = parseStrict(landscapeRel, LandscapeGraphSchema, readYamlDoc(landscapeFull, landscapeRel))
    validateLandscapeGraph(landscapeGraph, { file: landscapeRel, refs, pathwayMetricKeys })
  } else if (requireComplete) {
    throw new Error(`${landscapeRel}: missing landscape graph (requireCompleteGraphs)`)
  }

  // full git-truth resync inside the store's transaction: seed tables mirror data/
  // exactly; shortlist/journal are runtime state and untouched (drift there is
  // store.seedDrift's job)
  const counts = await store.replaceSeed({ citations, materials, pathways, landscapeGraph })
  return { ...counts, processGraphCount, operationalGraphCount, landscapeGraph, landscapeNodeCount: landscapeGraph?.nodes.length ?? 0 }
}
