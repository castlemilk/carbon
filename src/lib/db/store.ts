import { type DescMessage, type MessageShape, fromJson, toJson } from '@bufbuild/protobuf'
import type { Pathway } from '@/lib/gen/carbon/v1/pathway_pb'
import type { Material } from '@/lib/gen/carbon/v1/material_pb'
import type { Citation } from '@/lib/gen/carbon/v1/common_pb'
import type { JournalEntry, ShortlistEntry } from '@/lib/gen/carbon/v1/research_pb'

export interface ShortlistUpsert {
  pathwayId: string
  status: string // enum NAME — numeric values are rejected upstream by the guards
  rationale: string
  updatedAt: string // ISO 8601
}

export interface JournalUpsert {
  id: string
  kind: string // enum NAME
  title: string
  bodyMarkdown: string
  pathwayRefs: string[]
  createdAt: string // ISO 8601
}

export interface ShortlistRow {
  entry: ShortlistEntry
  existsInSeed: boolean
}

export interface CachedLiterature {
  fetchedAt: number
  worksJson: string
}

export interface SeedPayload {
  citations: Citation[]
  materials: Material[]
  pathways: Pathway[]
}

export interface SeedCounts {
  citations: number
  materials: number
  pathways: number
}

/**
 * Persistence port for the platform. Two adapters implement it:
 * SqliteStore (better-sqlite3, local file — default for dev/tests) and
 * TursoStore (@libsql/client, selected when CARBON_DB_URL is a libsql:// URL).
 *
 * All entity docs are stored as snake_case protojson so rows diff cleanly
 * against data/*.yaml; enum columns hold enum NAMES.
 */
export interface CarbonStore {
  readonly kind: 'sqlite' | 'turso'

  /** Idempotent DDL; safe on every boot/cold start. */
  initSchema(): Promise<void>

  /** Full git-truth resync of seed tables in one transaction. Runtime tables untouched. */
  replaceSeed(payload: SeedPayload): Promise<SeedCounts>

  getPathway(id: string): Promise<Pathway | undefined>
  listPathways(): Promise<Pathway[]>
  getMaterial(id: string): Promise<Material | undefined>
  listMaterials(): Promise<Material[]>
  getCitation(id: string): Promise<Citation | undefined>

  putShortlist(e: ShortlistUpsert): Promise<void>
  listShortlist(): Promise<ShortlistRow[]>
  putJournal(e: JournalUpsert): Promise<void>
  listJournal(): Promise<JournalEntry[]>
  deleteJournal(id: string): Promise<void>

  putLitCache(pathwayId: string, fetchedAt: number, worksJson: string): Promise<void>
  getLitCache(pathwayId: string): Promise<CachedLiterature | null>

  /** User rows referencing pathway ids absent from the seed, e.g. "shortlist:ghost". Deduped. */
  seedDrift(): Promise<string[]>

  close(): Promise<void>
}

// ---- shared proto-row helpers used by both adapters ----

type Row = Record<string, unknown>

/** proto enums arrive hydrated as numbers; DB columns + rehydration need enum NAMES */
export const enumName = (e: object, v: string | number): string => {
  if (typeof v === 'string') return v
  const name = (e as Record<string, string | number>)[v]
  if (typeof name !== 'string') throw new Error(`unknown enum numeric value: ${v}`)
  return name
}

/** serialize as snake_case protojson matching the seed-YAML style */
export const encodeDoc = <D extends DescMessage>(schema: D, msg: MessageShape<D>): string =>
  JSON.stringify(toJson(schema, msg, { useProtoFieldName: true }))

export const decodeDoc = <D extends DescMessage>(schema: D, docJson?: Row | string): MessageShape<D> | undefined =>
  docJson === undefined ? undefined : fromJson(schema, JSON.parse(typeof docJson === 'string' ? docJson : String(docJson.doc)))
