import Database from 'better-sqlite3'

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

export function openDb(file = process.env.CARBON_DB ?? 'carbon.db'): Database.Database {
  const db = new Database(file)
  db.pragma('journal_mode = WAL')
  db.exec(SCHEMA)
  return db
}
