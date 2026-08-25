import { createClient, type Client, type InStatement } from '@libsql/client'
import { fromJson } from '@bufbuild/protobuf'
import { PathwaySchema, Setting, type Pathway } from '@/lib/gen/carbon/v1/pathway_pb'
import { MaterialSchema, MaterialClass, type Material } from '@/lib/gen/carbon/v1/material_pb'
import { CitationSchema } from '@/lib/gen/carbon/v1/common_pb'
import { JournalEntrySchema, ShortlistEntrySchema, ShortlistStatus, EntryKind, type JournalEntry } from '@/lib/gen/carbon/v1/research_pb'
import {
  type CarbonStore, type CachedLiterature, type JournalUpsert, type SeedCounts,
  type SeedPayload, type ShortlistRow, type ShortlistUpsert,
  decodeDoc, encodeDoc, enumName,
} from './store'

type Row = Record<string, unknown>

// identical DDL to sqlite-store — the two dialects stay in lockstep on purpose
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

const rowify = (result: Awaited<ReturnType<Client['execute']>>): Row | undefined =>
  result.rows.length === 0 ? undefined : (result.rows[0] as unknown as Row)

export interface TursoConfig {
  url: string // libsql://… or https://…
  authToken?: string
}

export function createTursoStore(config: TursoConfig): CarbonStore {
  const client: Client = createClient({ url: config.url, authToken: config.authToken })
  const exec = async (sql: string, args?: unknown[]) => client.execute({ sql, args: args as never })
  const queryRows = async (sql: string, args?: unknown[]): Promise<Row[]> => {
    const r = await client.execute({ sql, args: args as never })
    return r.rows as unknown as Row[]
  }

  return {
    kind: 'turso',
    async initSchema() { await client.executeMultiple(SCHEMA) },
    async replaceSeed({ citations, materials, pathways }: SeedPayload): Promise<SeedCounts> {
      const stmts: { sql: string; args: unknown[] }[] = [
        { sql: 'DELETE FROM citations', args: [] },
        { sql: 'DELETE FROM materials', args: [] },
        { sql: 'DELETE FROM pathways', args: [] },
      ]
      for (const c of citations) stmts.push({ sql: 'INSERT OR REPLACE INTO citations (id, doc) VALUES (?,?)', args: [c.id, encodeDoc(CitationSchema, c)] })
      for (const m of materials) stmts.push({ sql: 'INSERT OR REPLACE INTO materials (id,class,name,doc) VALUES (?,?,?,?)', args: [m.id, enumName(MaterialClass, m.class), m.name, encodeDoc(MaterialSchema, m)] })
      for (const p of pathways) stmts.push({ sql: 'INSERT OR REPLACE INTO pathways (id,setting,trl,is_benchmark,name,doc) VALUES (?,?,?,?,?,?)', args: [p.id, enumName(Setting, p.setting), p.trl, p.isBenchmark ? 1 : 0, p.name, encodeDoc(PathwaySchema, p)] })
      // libsql batch is transactional ('write' mode) — matches SqliteStore semantics
      await client.batch(stmts as InStatement[], 'write')
      return { citations: citations.length, materials: materials.length, pathways: pathways.length }
    },
    async getPathway(id: string) { return decodeDoc(PathwaySchema, rowify(await exec('SELECT doc FROM pathways WHERE id=?', [id]))) },
    async listPathways(): Promise<Pathway[]> {
      return (await queryRows('SELECT doc FROM pathways ORDER BY name'))
        .map(r => fromJson(PathwaySchema, JSON.parse(r.doc as string)))
    },
    async getMaterial(id: string) { return decodeDoc(MaterialSchema, rowify(await exec('SELECT doc FROM materials WHERE id=?', [id]))) },
    async listMaterials(): Promise<Material[]> {
      return (await queryRows('SELECT doc FROM materials ORDER BY name'))
        .map(r => fromJson(MaterialSchema, JSON.parse(r.doc as string)))
    },
    async getCitation(id: string) { return decodeDoc(CitationSchema, rowify(await exec('SELECT doc FROM citations WHERE id=?', [id]))) },
    async putShortlist(e: ShortlistUpsert) {
      await exec(`INSERT OR REPLACE INTO shortlist (pathway_id,status,rationale,updated_at) VALUES (?,?,?,?)`,
        [e.pathwayId, enumName(ShortlistStatus, e.status), e.rationale, e.updatedAt])
    },
    async listShortlist(): Promise<ShortlistRow[]> {
      const rows = await queryRows('SELECT * FROM shortlist ORDER BY updated_at DESC')
      const seedSet = new Set((await queryRows('SELECT id FROM pathways')).map(r => r.id as string))
      return rows.map(r => {
        const row = r as unknown as { pathway_id: string; status: string; rationale: string; updated_at: string }
        return {
          entry: fromJson(ShortlistEntrySchema, { pathway_id: row.pathway_id, status: row.status, rationale: row.rationale, updated_at: row.updated_at }),
          existsInSeed: seedSet.has(row.pathway_id),
        }
      })
    },
    async putJournal(e: JournalUpsert) {
      await exec(`INSERT OR REPLACE INTO journal_entries (id,kind,title,body,pathway_refs,created_at) VALUES (?,?,?,?,?,?)`,
        [e.id, enumName(EntryKind, e.kind), e.title, e.bodyMarkdown, JSON.stringify(e.pathwayRefs), e.createdAt])
    },
    async listJournal(): Promise<JournalEntry[]> {
      return (await queryRows('SELECT * FROM journal_entries ORDER BY created_at DESC'))
        .map(r => {
          const row = r as unknown as { id: string; kind: string; title: string; body: string; pathway_refs: string; created_at: string }
          return fromJson(JournalEntrySchema, { id: row.id, kind: row.kind, title: row.title, body_markdown: row.body, pathway_refs: JSON.parse(row.pathway_refs), created_at: row.created_at })
        })
    },
    async deleteJournal(id: string) { await exec('DELETE FROM journal_entries WHERE id=?', [id]) },
    async putLitCache(pathwayId: string, fetchedAt: number, worksJson: string) {
      await exec('INSERT OR REPLACE INTO lit_cache (pathway_id,fetched_at,works_json) VALUES (?,?,?)', [pathwayId, fetchedAt, worksJson])
    },
    async getLitCache(pathwayId: string): Promise<CachedLiterature | null> {
      const row = rowify(await exec('SELECT fetched_at, works_json FROM lit_cache WHERE pathway_id=?', [pathwayId]))
      return row ? { fetchedAt: Number(row.fetched_at), worksJson: String(row.works_json) } : null
    },
    async seedDrift(): Promise<string[]> {
      const pathwayIds = new Set((await queryRows('SELECT id FROM pathways')).map(r => r.id as string))
      const drifted: string[] = []
      for (const r of await queryRows('SELECT pathway_id FROM shortlist'))
        if (!pathwayIds.has(r.pathway_id as string)) drifted.push(`shortlist:${r.pathway_id}`)
      for (const r of await queryRows('SELECT pathway_refs FROM journal_entries'))
        for (const ref of JSON.parse(r.pathway_refs as string) as string[])
          if (!pathwayIds.has(ref)) drifted.push(`journal:${ref}`)
      return [...new Set(drifted)]
    },
    async close() { client.close() },
  }
}
