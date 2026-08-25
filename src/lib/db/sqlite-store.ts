import Database from 'better-sqlite3'
import { fromJson } from '@bufbuild/protobuf'
import { PathwaySchema, Setting } from '@/lib/gen/carbon/v1/pathway_pb'
import { MaterialSchema, MaterialClass } from '@/lib/gen/carbon/v1/material_pb'
import { CitationSchema } from '@/lib/gen/carbon/v1/common_pb'
import { JournalEntrySchema, ShortlistEntrySchema, ShortlistStatus, EntryKind, type JournalEntry } from '@/lib/gen/carbon/v1/research_pb'
import {
  type CarbonStore, type CachedLiterature, type JournalUpsert, type SeedCounts,
  type SeedPayload, type ShortlistRow, type ShortlistUpsert,
  decodeDoc, encodeDoc, enumName,
} from './store'

type Row = Record<string, unknown>

const SCHEMA = `
CREATE TABLE IF NOT EXISTS pathways (
  id TEXT PRIMARY KEY, setting TEXT NOT NULL, trl INTEGER NOT NULL,
  is_benchmark INTEGER NOT NULL DEFAULT 0, name TEXT NOT NULL, doc TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS materials (
  id TEXT PRIMARY KEY, class TEXT NOT NULL, name TEXT NOT NULL, doc TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS citations (id TEXT PRIMARY KEY, doc TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS shortlist (
  pathway_id TEXT PRIMARY KEY, status TEXT NOT NULL,
  rationale TEXT NOT NULL DEFAULT '', updated_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS journal_entries (
  id TEXT PRIMARY KEY, kind TEXT NOT NULL, title TEXT NOT NULL, body TEXT NOT NULL,
  pathway_refs TEXT NOT NULL DEFAULT '[]', created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS lit_cache (
  pathway_id TEXT PRIMARY KEY, fetched_at INTEGER NOT NULL, works_json TEXT NOT NULL);
`

export function makeSqliteStore(file = process.env.CARBON_DB ?? 'carbon.db'): CarbonStore & { raw: Database.Database } {
  const db = new Database(file)
  db.pragma('journal_mode = WAL')
  const getPathway = (id: string) => decodeDoc(PathwaySchema, db.prepare('SELECT doc FROM pathways WHERE id=?').get(id) as Row | undefined)
  return {
    kind: 'sqlite',
    raw: db,
    async initSchema() { db.exec(SCHEMA) },
    async replaceSeed({ citations, materials, pathways }: SeedPayload): Promise<SeedCounts> {
      let nCitations = 0, nMaterials = 0, nPathways = 0
      db.transaction(() => {
        // full git-truth resync: seed tables mirror data/ exactly; shortlist/journal
        // are runtime state and untouched here (drift there is seedDrift's job)
        db.prepare('DELETE FROM citations').run()
        db.prepare('DELETE FROM materials').run()
        db.prepare('DELETE FROM pathways').run()
        for (const c of citations) nCitations += db.prepare('INSERT OR REPLACE INTO citations (id, doc) VALUES (?,?)').run(c.id, encodeDoc(CitationSchema, c)).changes
        for (const m of materials) nMaterials += db.prepare('INSERT OR REPLACE INTO materials (id,class,name,doc) VALUES (?,?,?,?)').run(m.id, enumName(MaterialClass, m.class), m.name, encodeDoc(MaterialSchema, m)).changes
        for (const p of pathways) nPathways += db.prepare('INSERT OR REPLACE INTO pathways (id,setting,trl,is_benchmark,name,doc) VALUES (?,?,?,?,?,?)').run(p.id, enumName(Setting, p.setting), p.trl, p.isBenchmark ? 1 : 0, p.name, encodeDoc(PathwaySchema, p)).changes
      })()
      return { citations: nCitations, materials: nMaterials, pathways: nPathways }
    },
    async getPathway(id) { return getPathway(id) },
    async listPathways() {
      return (db.prepare('SELECT doc FROM pathways ORDER BY name').all() as Row[])
        .map(r => fromJson(PathwaySchema, JSON.parse(r.doc as string)))
    },
    async getMaterial(id) { return decodeDoc(MaterialSchema, db.prepare('SELECT doc FROM materials WHERE id=?').get(id) as Row | undefined) },
    async listMaterials() {
      return (db.prepare('SELECT doc FROM materials ORDER BY name').all() as Row[])
        .map(r => fromJson(MaterialSchema, JSON.parse(r.doc as string)))
    },
    async getCitation(id) { return decodeDoc(CitationSchema, db.prepare('SELECT doc FROM citations WHERE id=?').get(id) as Row | undefined) },
    async putShortlist(e: ShortlistUpsert) {
      db.prepare(`INSERT OR REPLACE INTO shortlist (pathway_id,status,rationale,updated_at) VALUES (?,?,?,?)`)
        .run(e.pathwayId, enumName(ShortlistStatus, e.status), e.rationale, e.updatedAt)
    },
    async listShortlist(): Promise<ShortlistRow[]> {
      return (db.prepare('SELECT * FROM shortlist ORDER BY updated_at DESC').all() as { pathway_id: string; status: string; rationale: string; updated_at: string }[])
        .map(r => ({
          entry: fromJson(ShortlistEntrySchema, { pathway_id: r.pathway_id, status: r.status, rationale: r.rationale, updated_at: r.updated_at }),
          existsInSeed: !!db.prepare('SELECT 1 FROM pathways WHERE id=?').get(r.pathway_id),
        }))
    },
    async putJournal(e: JournalUpsert) {
      db.prepare(`INSERT OR REPLACE INTO journal_entries (id,kind,title,body,pathway_refs,created_at) VALUES (?,?,?,?,?,?)`)
        .run(e.id, enumName(EntryKind, e.kind), e.title, e.bodyMarkdown, JSON.stringify(e.pathwayRefs), e.createdAt)
    },
    async listJournal(): Promise<JournalEntry[]> {
      return (db.prepare('SELECT * FROM journal_entries ORDER BY created_at DESC').all() as { id: string; kind: string; title: string; body: string; pathway_refs: string; created_at: string }[])
        .map(r => fromJson(JournalEntrySchema, { id: r.id, kind: r.kind, title: r.title, body_markdown: r.body, pathway_refs: JSON.parse(r.pathway_refs), created_at: r.created_at }))
    },
    async deleteJournal(id: string) { db.prepare('DELETE FROM journal_entries WHERE id=?').run(id) },
    async putLitCache(pathwayId: string, fetchedAt: number, worksJson: string) {
      db.prepare('INSERT OR REPLACE INTO lit_cache (pathway_id,fetched_at,works_json) VALUES (?,?,?)').run(pathwayId, fetchedAt, worksJson)
    },
    async getLitCache(pathwayId: string): Promise<CachedLiterature | null> {
      const row = db.prepare('SELECT fetched_at, works_json FROM lit_cache WHERE pathway_id=?').get(pathwayId) as Row | undefined
      return row ? { fetchedAt: row.fetched_at as number, worksJson: row.works_json as string } : null
    },
    async seedDrift(): Promise<string[]> {
      const pathwayIds = new Set((db.prepare('SELECT id FROM pathways').all() as { id: string }[]).map(r => r.id))
      const drifted: string[] = []
      for (const r of db.prepare('SELECT pathway_id FROM shortlist').all() as { pathway_id: string }[])
        if (!pathwayIds.has(r.pathway_id)) drifted.push(`shortlist:${r.pathway_id}`)
      for (const r of db.prepare('SELECT pathway_refs FROM journal_entries').all() as { pathway_refs: string }[])
        for (const ref of JSON.parse(r.pathway_refs) as string[])
          if (!pathwayIds.has(ref)) drifted.push(`journal:${ref}`)
      return [...new Set(drifted)]
    },
    async close() { db.close() },
  }
}
