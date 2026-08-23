import type { Database } from 'better-sqlite3'
import { type DescMessage, fromJson, toJson } from '@bufbuild/protobuf'
import { PathwaySchema, Setting } from '@/lib/gen/carbon/v1/pathway_pb'
import { MaterialSchema, MaterialClass } from '@/lib/gen/carbon/v1/material_pb'
import { CitationSchema } from '@/lib/gen/carbon/v1/common_pb'
import { ShortlistEntrySchema, JournalEntrySchema, ShortlistStatus, EntryKind } from '@/lib/gen/carbon/v1/research_pb'

type Row = Record<string, unknown>

// proto enums arrive hydrated as numbers; DB columns + rehydration need enum NAMES
const enumName = (e: Record<string, string | number>, v: string | number) =>
  typeof v === 'string' ? v : e[v]!

// store protojson in the snake_case seed-YAML style so DB rows diff cleanly against data/
const store = <S>(schema: S, msg: never) => JSON.stringify(toJson(schema as never, msg, { useProtoFieldName: true }))

export function insertPathway(db: Database, p: { id: string; name: string; setting: unknown; trl: number; isBenchmark: boolean }) {
  db.prepare(`INSERT OR REPLACE INTO pathways (id, setting, trl, is_benchmark, name, doc) VALUES (?,?,?,?,?,?)`)
    .run(p.id, enumName(Setting as unknown as Record<string, string | number>, p.setting as string | number), p.trl, p.isBenchmark ? 1 : 0, p.name, store(PathwaySchema, p as never))
}
const hydrate = <D extends DescMessage>(schema: D, row?: Row) =>
  row ? fromJson(schema, JSON.parse(row.doc as string)) : undefined

export const getPathway = (db: Database, id: string) =>
  hydrate(PathwaySchema, db.prepare('SELECT doc FROM pathways WHERE id=?').get(id) as Row | undefined)
export const listPathways = (db: Database) =>
  (db.prepare('SELECT doc FROM pathways ORDER BY name').all() as Row[]).map(r => fromJson(PathwaySchema, JSON.parse(r.doc as string)))
export const insertMaterial = (db: Database, m: { id: string; name: string; class: unknown }) =>
  db.prepare('INSERT OR REPLACE INTO materials (id,class,name,doc) VALUES (?,?,?,?)')
    .run(m.id, enumName(MaterialClass as unknown as Record<string, string | number>, m.class as string | number), m.name, store(MaterialSchema, m as never))
export const getMaterial = (db: Database, id: string) =>
  hydrate(MaterialSchema, db.prepare('SELECT doc FROM materials WHERE id=?').get(id) as Row | undefined)
export const listMaterials = (db: Database) =>
  (db.prepare('SELECT doc FROM materials ORDER BY name').all() as Row[]).map(r => fromJson(MaterialSchema, JSON.parse(r.doc as string)))
export const insertCitation = (db: Database, c: { id: string }) =>
  db.prepare('INSERT OR REPLACE INTO citations (id,doc) VALUES (?,?)').run(c.id, store(CitationSchema, c as never))
export const getCitation = (db: Database, id: string) =>
  hydrate(CitationSchema, db.prepare('SELECT doc FROM citations WHERE id=?').get(id) as Row | undefined)

export function upsertShortlist(db: Database, e: { pathwayId: string; status: unknown; rationale: string; updatedAt: string }) {
  db.prepare(`INSERT OR REPLACE INTO shortlist (pathway_id,status,rationale,updated_at) VALUES (?,?,?,?)`)
    .run(e.pathwayId, enumName(ShortlistStatus as unknown as Record<string, string | number>, e.status as string | number), e.rationale, e.updatedAt)
}
export const listShortlist = (db: Database) =>
  (db.prepare('SELECT * FROM shortlist ORDER BY updated_at DESC').all() as { pathway_id: string; status: string; rationale: string; updated_at: string }[]).map(r => ({
    entry: fromJson(ShortlistEntrySchema, { pathway_id: r.pathway_id, status: r.status, rationale: r.rationale, updated_at: r.updated_at }),
    existsInSeed: !!db.prepare('SELECT 1 FROM pathways WHERE id=?').get(r.pathway_id),
  }))
export function upsertJournal(db: Database, e: { id: string; kind: unknown; title: string; bodyMarkdown: string; pathwayRefs: string[]; createdAt: string }) {
  db.prepare(`INSERT OR REPLACE INTO journal_entries (id,kind,title,body,pathway_refs,created_at) VALUES (?,?,?,?,?,?)`)
    .run(e.id, enumName(EntryKind as unknown as Record<string, string | number>, e.kind as string | number), e.title, e.bodyMarkdown, JSON.stringify(e.pathwayRefs), e.createdAt)
}
export const listJournal = (db: Database) =>
  (db.prepare('SELECT * FROM journal_entries ORDER BY created_at DESC').all() as { id: string; kind: string; title: string; body: string; pathway_refs: string; created_at: string }[]).map(r =>
    fromJson(JournalEntrySchema, { id: r.id, kind: r.kind, title: r.title, body_markdown: r.body, pathway_refs: JSON.parse(r.pathway_refs as string), created_at: r.created_at }))
export function deleteJournal(db: Database, id: string) { db.prepare('DELETE FROM journal_entries WHERE id=?').run(id) }

export interface CachedLiterature { fetchedAt: number; worksJson: string }
export const putLitCache = (db: Database, pathwayId: string, fetchedAt: number, worksJson: string) =>
  db.prepare('INSERT OR REPLACE INTO lit_cache VALUES (?,?,?)').run(pathwayId, fetchedAt, worksJson)
export const getLitCache = (db: Database, pathwayId: string): CachedLiterature | null => {
  const row = db.prepare('SELECT fetched_at, works_json FROM lit_cache WHERE pathway_id=?').get(pathwayId) as Row | undefined
  return row ? { fetchedAt: row.fetched_at as number, worksJson: row.works_json as string } : null
}
