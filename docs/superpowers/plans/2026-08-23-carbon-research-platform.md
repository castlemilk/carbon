# Carbon Capture Research Platform Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a local Next.js platform mapping the full carbon-capture pathway landscape with cited comparisons and a convergence workspace (shortlist + decision journal).

**Architecture:** Single Next.js 15 process. Protobuf schemas (compiled with buf to TypeScript) define shape; human-authored YAML in `data/` defines content; both load into SQLite at boot via a strictly-validating seed loader. Live edges (OpenAlex literature, AlphaFold/PDB structures) are detail-page enrichments served stale-while-revalidate from a SQLite cache — never blocking core browsing.

**Tech Stack:** Next.js 15 (App Router, TypeScript), shadcn/ui + Tailwind v4, buf + @bufbuild/protobuf v2, better-sqlite3, `yaml`, vitest, Playwright, Mol* embed with link-out fallback.

**Spec:** `docs/superpowers/specs/2026-08-23-carbon-research-platform-design.md` — read before starting any task.

---

## Global conventions (every task)

- Unit tests: `npx vitest run <file>` — PASS before commit. Typecheck: `npm run typecheck`. Lint: `npm run lint`.
- Every task ends with a focused commit; never commit unrelated files.
- Generated protobuf code (`src/lib/gen/`) IS committed.
- Timestamps written by app code are ISO 8601 (`new Date().toISOString()`).
- Next.js 15 async request APIs: route-handler/context `params`, page `params` and `searchParams` are **Promises — await them** (affects dynamic routes and query-param reads in Tasks 7–13).
- Manual browser checks: verify LISTEN pid is your process first — `lsof -nP -iTCP:3000 -sTCP:LISTEN`; kill squatters.
- Domain glossary (no prior climate knowledge needed):
  - **Pathway** = engineered CO₂-capture approach. `Setting` = where it captures: POINT_SOURCE (flue gas), DAC (air), OCEAN_DIC (seawater), MINERALIZATION (rock reactions), BIOLOGICAL (biomass/enzymes).
  - **TRL** 1–9 = Technology Readiness Level (concept → proven at scale).
  - **$/tCO₂** cost per tonne captured; **GJ/tCO₂** energy per tonne (thermal vs electric split matters).
  - **Benchmark** (`is_benchmark`) = mature pathway kept for calibration.
  - **MOF** = metal-organic framework (crystalline adsorbent). **Carbonic anhydrase** = enzyme (UniProt P00918) accelerating CO₂ dissolution — our AlphaFold case.
  - **SWR** = stale-while-revalidate (serve cache instantly, refresh behind it).

## File map

```
proto/buf.yaml, proto/buf.gen.yaml
proto/carbon/v1/{common,pathway,material,research}.proto
src/lib/gen/**                              # generated TS, committed
data/sources/*.yaml  data/materials/*.yaml  data/pathways/*.yaml
src/lib/db/index.ts                         # sqlite conn + migrations
src/lib/db/repos.ts (+ .test.ts)            # repositories hydrating protojson
src/lib/seed/loader.ts (+ .test.ts)         # YAML -> validate -> upsert
src/instrumentation.ts                      # boot: migrate + seed, fail loudly
src/lib/format.ts (+ .test.ts)              # MetricRange formatting + scale math
src/lib/settings.ts                         # enum consts, labels, colors
src/lib/edges/openalex.ts (+ .test.ts)      # fetch + normalize -> Citation
src/lib/edges/literature.ts                 # cache/SWR orchestration
src/app/api/literature/[pathwayId]/route.ts
src/app/api/structure/route.ts              # cif proxy (AlphaFold/RCSB)
src/app/layout.tsx  src/components/app-sidebar.tsx
src/app/page.tsx                            # Landscape (chart-first)
src/components/landscape/*.tsx              # scatter, list, filters
src/app/pathways/[id]/page.tsx
src/components/pathway/*.tsx                # metric-table, literature-panel
src/app/compare/page.tsx  src/components/compare/compare-table.tsx
src/app/materials/page.tsx  src/app/materials/[id]/page.tsx
src/components/materials/structure-viewer.tsx
src/app/decision/page.tsx  src/components/decision/{board,journal}.tsx
src/lib/actions/research-actions.ts         # server actions (mutations)
src/app/about/page.tsx
tests/e2e/smoke.spec.ts
```

## Chunk 1: Foundation

### Task 1: Scaffold app + tooling

**Files:** Create via commands; Create `vitest.config.ts`, `tests/e2e/smoke.spec.ts`, `AGENTS.md`; Modify `package.json` scripts, `.gitignore`.

- [ ] **Step 1: Scaffold Next.js**

```bash
cd /Users/benebsworth/projects/carbon
npx create-next-app@latest . --ts --app --tailwind --eslint --src-dir --import-alias "@/*" --use-npm
# Turbopack prompt: yes
npm i better-sqlite3 yaml @bufbuild/protobuf @bufbuild/protoc-gen-es
npm i -D @types/better-sqlite3 vitest @playwright/test tsx
npx playwright install chromium
```

Precondition: repo already initialized (`git init` done during brainstorming — if `git status` fails, run `git init` first).

- [ ] **Step 2: shadcn init + primitives**

```bash
npx shadcn@latest init -y -b neutral
npx shadcn@latest add button card badge dialog input textarea select checkbox label tabs separator tooltip scroll-area
```

- [ ] **Step 3: package.json scripts**

```json
"scripts": {
  "dev": "next dev", "build": "next build", "start": "next start",
  "typecheck": "tsc --noEmit",
  "test": "vitest run", "e2e": "playwright test",
  "gen": "buf generate", "seed:check": "tsx src/lib/seed/check.ts"
}
```
(Keep whatever lint script create-next-app generated; do not replace it.)

- [ ] **Step 4: `vitest.config.ts`**

```ts
import { defineConfig } from 'vitest/config'
import path from 'node:path'
export default defineConfig({
  test: { environment: 'node', include: ['src/**/*.test.ts'] },
  resolve: { alias: { '@': path.resolve(__dirname, './src') } },
})
```

- [ ] **Step 5: Playwright config + smoke placeholder — `playwright.config.ts`**

```ts
import { defineConfig } from '@playwright/test'
export default defineConfig({
  testDir: './tests/e2e',
  webServer: { command: 'npm run dev', url: 'http://localhost:3000', reuseExistingServer: false, timeout: 60_000 },
  use: { baseURL: 'http://localhost:3000' },
})
```

`tests/e2e/smoke.spec.ts` (placeholder until Task 15):

```ts
import { test, expect } from '@playwright/test'
test('app boots', async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('body')).toBeVisible()
})
```

- [ ] **Step 6: `AGENTS.md`** — document: `npm run typecheck && npm run lint && npm test` before every commit; `npm run e2e` for full-stack verification; verify listen pid rule; data lives in YAML, regenerate nothing by hand in `src/lib/gen`.

- [ ] **Step 7: Verify + commit.** `npx tsc --noEmit` → clean. Then:

```bash
git add -A && git commit -m "chore: scaffold next.js app with shadcn, vitest, playwright"
```

### Task 2: Protobuf schemas + buf toolchain

**Files:** Create `proto/buf.yaml`, `proto/buf.gen.yaml`, `proto/carbon/v1/{common,pathway,material,research}.proto`, `src/lib/gen/**`(generated), `src/lib/proto-roundtrip.test.ts`. Install buf CLI (`brew install bufbuild/buf/buf`).

- [ ] **Step 1: buf configs**

`proto/buf.yaml`:
```yaml
version: v2
modules:
  - path: .
lint:
  use: [STANDARD]
  except:
    - ENUM_VALUE_PREFIX   # spec enum values are POINT_SOURCE, CANDIDATE, ... not SETTING_DAC etc.
```

`proto/buf.gen.yaml`:
```yaml
version: v2
plugins:
  - local: protoc-gen-es
    out: ../src/lib/gen
    opt: target=ts
```
(`protoc-gen-es` bin comes from the `@bufbuild/protoc-gen-es` dev dependency installed in Task 1. If buf can't resolve it on PATH, prefix `local:` value with the full path via `npx` wrapper or use remote plugin `buf.build/bufbuild/es`. Do not proceed without generated output.)

- [ ] **Step 2: `proto/carbon/v1/common.proto`**

```proto
syntax = "proto3";
package carbon.v1;

message Citation {
  string id = 1;
  string title = 2;
  repeated string authors = 3;
  int32 year = 4;
  string venue = 5;
  string url = 6;
}

message MetricRange {
  double low = 1;
  double high = 2;
  string unit = 3;        // validated against UNIT_ALLOWLIST in seed loader
  int32 year_basis = 4;
  string source_ref = 5;  // -> Citation.id, required
}
```

- [ ] **Step 3: `proto/carbon/v1/pathway.proto`**

```proto
syntax = "proto3";
package carbon.v1;
import "carbon/v1/common.proto";

enum Setting {
  SETTING_UNSPECIFIED = 0;
  POINT_SOURCE = 1;
  DAC = 2;
  OCEAN_DIC = 3;
  MINERALIZATION = 4;
  BIOLOGICAL = 5;
}

message Pathway {
  string id = 1;
  string name = 2;
  Setting setting = 3;
  bool is_benchmark = 4;
  string mechanism = 5;              // markdown
  int32 trl = 6;                     // 1..9
  repeated string search_terms = 7;  // literature queries
  map<string, carbon.v1.MetricRange> metrics = 8;
  repeated string advantages = 9;    // markdown bullets
  repeated string challenges = 10;
  repeated string material_ids = 11;
  repeated string source_refs = 12;
}
```

- [ ] **Step 4: `proto/carbon/v1/material.proto`**

```proto
syntax = "proto3";
package carbon.v1;
import "carbon/v1/common.proto";

enum MaterialClass {
  MATERIAL_CLASS_UNSPECIFIED = 0;
  AMINE_SORBENT = 1;
  MOF = 2;
  LIQUID_SOLVENT = 3;
  ENZYME = 4;
  ELECTRODE_MATERIAL = 5;
  MINERAL = 6;
  OTHER = 7;
}

message Material {
  string id = 1;
  string name = 2;
  MaterialClass class = 3;
  string summary = 4;
  map<string, carbon.v1.MetricRange> properties = 5;
  string uniprot_id = 6;    // enzymes -> AlphaFold DB
  string pdb_ids_csv = 7;   // optional experimental structures
}
```

- [ ] **Step 5: `proto/carbon/v1/research.proto`**

```proto
syntax = "proto3";
package carbon.v1;

enum ShortlistStatus {
  SHORTLIST_STATUS_UNSPECIFIED = 0;
  CANDIDATE = 1;
  UNDER_EVALUATION = 2;
  ELIMINATED = 3;
  CHOSEN = 4;
}

message ShortlistEntry {
  string pathway_id = 1;
  ShortlistStatus status = 2;
  string rationale = 3;      // markdown
  string updated_at = 4;     // ISO 8601
}

enum EntryKind {
  ENTRY_KIND_UNSPECIFIED = 0;
  OBSERVATION = 1;
  COMPARISON_NOTE = 2;
  DECISION = 3;
  ELIMINATION = 4;
}

message JournalEntry {
  string id = 1;
  EntryKind kind = 2;
  string title = 3;
  string body_markdown = 4;
  repeated string pathway_refs = 5;
  string created_at = 6;     // ISO 8601
}
```

- [ ] **Step 6: Generate + lint**

Run: `cd proto && buf lint && buf generate`
Expected: no output (clean); `src/lib/gen/carbon/v1/*_pb.ts` exists.

- [ ] **Step 7: Round-trip test — `src/lib/proto-roundtrip.test.ts`**

```ts
import { describe, it, expect } from 'vitest'
import { fromJson, toJson } from '@bufbuild/protobuf'
import { PathwaySchema, Setting } from '@/lib/gen/carbon/v1/pathway_pb'

describe('protojson round-trip', () => {
  it('parses strict JSON and rejects unknown fields', () => {
    const doc = {
      id: 'x', name: 'X', setting: 'DAC', trl: 5,
      metrics: { cost: { low: 80, high: 600, unit: 'USD/tCO2', year_basis: 2022, source_ref: 's1' } },
    }
    const p = fromJson(PathwaySchema, doc)
    expect(p.setting).toBe(Setting.DAC)
    const back: any = toJson(PathwaySchema, p)
    expect(back.metrics.cost.source_ref).toBe('s1')
    expect(() => fromJson(PathwaySchema, { ...doc, bogus: true }, { ignoreUnknownFields: false })).toThrow()
  })
})
```

Run: `npx vitest run src/lib/proto-roundtrip.test.ts` → PASS.

- [ ] **Step 8: Commit**

```bash
git add proto src/lib/gen src/lib/proto-roundtrip.test.ts package.json package-lock.json
git commit -m "feat: protobuf schemas with buf toolchain and round-trip test"
```

### Task 3: SQLite bootstrap + repositories

**Files:** Create `src/lib/db/index.ts`, `src/lib/db/repos.ts`, `src/lib/db/repos.test.ts`.

Design: entities are stored as full protojson strings (`doc` column) plus a few extracted columns for cheap listing. ~24 rows — repos expose load-all/get-by-id; filtering happens in memory. Repos take a `Database` param so tests use temp files.

- [ ] **Step 1: Failing tests — `src/lib/db/repos.test.ts`**

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { openDb } from './index'
import {
  insertPathway, getPathway, listPathways,
  upsertShortlist, listShortlist, upsertJournal, listJournal, putLitCache, getLitCache,
} from './repos'
import { fromJson } from '@bufbuild/protobuf'
import { PathwaySchema } from '@/lib/gen/carbon/v1/pathway_pb'
import { ShortlistEntrySchema, JournalEntrySchema } from '@/lib/gen/carbon/v1/research_pb'

const dbFile = () => `${__dirname}/tmp-${Math.random().toString(36).slice(2)}.db`
const mkPathway = (id: string) => fromJson(PathwaySchema, { id, name: id.toUpperCase(), setting: 'DAC', trl: 5 })

describe('repos', () => {
  let file: string
  beforeEach(() => { file = dbFile() })

  it('pathway insert + hydrate round-trips through protojson', () => {
    const db = openDb(file)
    const p = mkPathway('mof-dac')
    insertPathway(db, p)
    const got = getPathway(db, 'mof-dac')!
    expect(got.name).toBe('MOF-DAC')
    expect(listPathways(db)).toHaveLength(1)
  })

  it('shortlist + journal persist and hydrate', () => {
    const db = openDb(file)
    upsertShortlist(db, fromJson(ShortlistEntrySchema, { pathway_id: 'mof-dac', status: 'CANDIDATE', rationale: 'promising', updated_at: '2026-08-23T00:00:00.000Z' }))
    expect(listShortlist(db)[0]!.entry.status).toBe(ShortlistStatus.CANDIDATE)   // hydrated = numeric enum
    expect(listShortlist(db)[0]!.existsInSeed).toBe(false)
    expect((db.prepare('SELECT status FROM shortlist').get() as { status: string }).status).toBe('CANDIDATE')  // persisted = name
    upsertJournal(db, fromJson(JournalEntrySchema, { id: 'j1', kind: 'OBSERVATION', title: 'T', body_markdown: 'b', pathway_refs: ['mof-dac'], created_at: '2026-08-23T00:00:00.000Z' }))
    expect(listJournal(db)).toHaveLength(1)
  })

  it('lit cache put/get by pathway id', () => {
    const db = openDb(file)
    putLitCache(db, 'mof-dac', Date.now(), JSON.stringify([{ id: 'openalex:w1' }]))
    expect(JSON.parse(getLitCache(db, 'mof-dac')!.worksJson)[0].id).toBe('openalex:w1')
    expect(getLitCache(db, 'nope')).toBeNull()
  })
})
```

- [ ] **Step 2: Run → FAIL** (`npx vitest run src/lib/db/repos.test.ts`: cannot find module './index')

- [ ] **Step 3: `src/lib/db/index.ts`**

```ts
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
```

- [ ] **Step 4: `src/lib/db/repos.ts`**

```ts
import type { Database } from 'better-sqlite3'
import { fromJson, toJson } from '@bufbuild/protobuf'
import { PathwaySchema, Setting } from '@/lib/gen/carbon/v1/pathway_pb'
import { MaterialSchema, MaterialClass } from '@/lib/gen/carbon/v1/material_pb'
import { CitationSchema } from '@/lib/gen/carbon/v1/common_pb'
import { ShortlistEntrySchema, JournalEntrySchema, ShortlistStatus, EntryKind } from '@/lib/gen/carbon/v1/research_pb'

type Row = Record<string, unknown>

// proto enums arrive hydrated as numbers; DB columns + rehydration need enum NAMES
const enumName = (e: Record<string, string | number>, v: string | number) =>
  typeof v === 'string' ? v : e[v]!

export function insertPathway(db: Database, p: { id: string; name: string; setting: unknown; trl: number; isBenchmark: boolean }) {
  db.prepare(`INSERT OR REPLACE INTO pathways (id, setting, trl, is_benchmark, name, doc) VALUES (?,?,?,?,?,?)`)
    .run(p.id, enumName(Setting, p.setting as never), p.trl, p.isBenchmark ? 1 : 0, p.name, JSON.stringify(toJson(PathwaySchema, p as never)))
}
const hydrate = <S>(schema: S, row?: Row) => row ? fromJson(schema as never, JSON.parse(row.doc as string)) : undefined

export const getPathway = (db: Database, id: string) =>
  hydrate(PathwaySchema, db.prepare('SELECT doc FROM pathways WHERE id=?').get(id) as Row | undefined)
export const listPathways = (db: Database) =>
  (db.prepare('SELECT doc FROM pathways ORDER BY name').all() as Row[]).map(r => fromJson(PathwaySchema, JSON.parse(r.doc as string)))
export const insertMaterial = (db: Database, m: { id: string; name: string; class: unknown }) =>
  db.prepare('INSERT OR REPLACE INTO materials (id,class,name,doc) VALUES (?,?,?,?)')
    .run(m.id, enumName(MaterialClass, m.class as never), m.name, JSON.stringify(toJson(MaterialSchema, m as never)))
export const getMaterial = (db: Database, id: string) =>
  hydrate(MaterialSchema, db.prepare('SELECT doc FROM materials WHERE id=?').get(id) as Row | undefined)
export const listMaterials = (db: Database) =>
  (db.prepare('SELECT doc FROM materials ORDER BY name').all() as Row[]).map(r => fromJson(MaterialSchema, JSON.parse(r.doc as string)))
export const insertCitation = (db: Database, c: { id: string }) =>
  db.prepare('INSERT OR REPLACE INTO citations (id,doc) VALUES (?,?)').run(c.id, JSON.stringify(toJson(CitationSchema, c as never)))
export const getCitation = (db: Database, id: string) =>
  hydrate(CitationSchema, db.prepare('SELECT doc FROM citations WHERE id=?').get(id) as Row | undefined)

export function upsertShortlist(db: Database, e: { pathwayId: string; status: unknown; rationale: string; updatedAt: string }) {
  db.prepare(`INSERT OR REPLACE INTO shortlist (pathway_id,status,rationale,updated_at) VALUES (?,?,?,?)`)
    .run(e.pathwayId, enumName(ShortlistStatus, e.status as never), e.rationale, e.updatedAt)
}
export const listShortlist = (db: Database) =>
  (db.prepare('SELECT * FROM shortlist ORDER BY updated_at DESC').all() as Row[]).map(r => ({
    entry: fromJson(ShortlistEntrySchema, { pathway_id: r.pathway_id, status: r.status, rationale: r.rationale, updated_at: r.updated_at }),
    existsInSeed: !!db.prepare('SELECT 1 FROM pathways WHERE id=?').get(r.pathway_id),
  }))
export function upsertJournal(db: Database, e: { id: string; kind: unknown; title: string; bodyMarkdown: string; pathwayRefs: string[]; createdAt: string }) {
  db.prepare(`INSERT OR REPLACE INTO journal_entries (id,kind,title,body,pathway_refs,created_at) VALUES (?,?,?,?,?,?)`)
    .run(e.id, enumName(EntryKind, e.kind as never), e.title, e.bodyMarkdown, JSON.stringify(e.pathwayRefs), e.createdAt)
}
export const listJournal = (db: Database) =>
  (db.prepare('SELECT * FROM journal_entries ORDER BY created_at DESC').all() as Row[]).map(r =>
    fromJson(JournalEntrySchema, { id: r.id, kind: r.kind, title: r.title, body_markdown: r.body, pathway_refs: JSON.parse(r.pathway_refs as string), created_at: r.created_at }))
export function deleteJournal(db: Database, id: string) { db.prepare('DELETE FROM journal_entries WHERE id=?').run(id) }

export interface CachedLiterature { fetchedAt: number; worksJson: string }
export const putLitCache = (db: Database, pathwayId: string, fetchedAt: number, worksJson: string) =>
  db.prepare('INSERT OR REPLACE INTO lit_cache VALUES (?,?,?)').run(pathwayId, fetchedAt, worksJson)
export const getLitCache = (db: Database, pathwayId: string): CachedLiterature | null => {
  const row = db.prepare('SELECT fetched_at, works_json FROM lit_cache WHERE pathway_id=?').get(pathwayId) as Row | undefined
  return row ? { fetchedAt: row.fetched_at as number, worksJson: row.works_json as string } : null
}
```

- [ ] **Step 5: Run tests → PASS.** `npx vitest run src/lib/db/ && npx tsc --noEmit`

- [ ] **Step 6: Commit** — `git add src/lib/db && git commit -m "feat: sqlite bootstrap and proto-hydrating repositories"`

### Task 4: Seed loader

**Files:** Create `src/lib/seed/loader.ts`, `src/lib/seed/loader.test.ts`, `src/lib/seed/check.ts`, fixtures under `src/lib/seed/fixtures/`.

Validation contract (spec): strict protojson (unknown fields rejected); units ∈ UNIT_ALLOWLIST; every `source_ref` resolves to a loaded citation; every `material_id` resolves; TRL 1–9; low ≤ high. Boot fails loudly with file+field precision.

- [ ] **Step 1: Failing tests — `src/lib/seed/loader.test.ts`**

```ts
import { describe, it, expect } from 'vitest'
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
  it('validates materials (unresolved source in property)', () => {
    const m = { id: 'mg2dobpdc', name: 'Mg2(dobpdc)', class: 'MOF',
      properties: { capacity: { low: 2, high: 4, unit: 'mmol/g', year_basis: 2019, source_ref: 'ghost' } } }
    expect(() => validateMaterialDoc(m, citationIds)).toThrow(/ghost/)
  })
})
```

Run → FAIL (`validatePathwayDoc` not exported).

- [ ] **Step 2: `src/lib/seed/loader.ts`**

```ts
import { fromJson } from '@bufbuild/protobuf'
import { PathwaySchema } from '@/lib/gen/carbon/v1/pathway_pb'
import { MaterialSchema } from '@/lib/gen/carbon/v1/material_pb'
import { CitationSchema } from '@/lib/gen/carbon/v1/common_pb'
import type { Pathway } from '@/lib/gen/carbon/v1/pathway_pb'

export const UNIT_ALLOWLIST = [
  'USD/tCO2', 'GJ/tCO2', 'GJ-e/tCO2', 'Gt/yr', 'Mt/yr', 'years', 'mmol/g', 'kJ/mol', 'USD/kg',
] as const

type AnyDoc = Record<string, unknown>
const ctx = (id: string) => `${id}`

export function validateCitationDoc(doc: AnyDoc) {
  return fromJson(CitationSchema, doc as never, { ignoreUnknownFields: false }) // throws w/ path
}

function checkRanges(metrics: AnyDoc | undefined, id: string) {
  for (const [k, v] of Object.entries(metrics ?? {})) {
    const m = v as AnyDoc
    if (!UNIT_ALLOWLIST.includes(m.unit as never)) throw new Error(`${ctx(id)}: metric '${k}' has unit '${m.unit}' not in allowlist`)
    if ((m.low as number) > (m.high as number)) throw new Error(`${ctx(id)}: metric '${k}' low > high`)
    const ref = m.source_ref as string
    if (!ref) throw new Error(`${ctx(id)}: metric '${k}' missing source_ref`)
  }
}
function checkRefs(refs: string[] | undefined, known: Set<string>, what: string, id: string) {
  for (const r of refs ?? []) if (!known.has(r)) throw new Error(`${ctx(id)}: ${what} '${r}' not found`)
}

export function validatePathwayDoc(doc: AnyDoc, citations: Set<string>, materials: Set<string>): Pathway {
  const id = String(doc.id ?? '?')
  checkRanges(doc.metrics as AnyDoc | undefined, id)
  checkRefs(doc.source_refs as string[], citations, 'source_ref', id)
  checkRefs(doc.material_ids as string[], materials, 'material_id', id)
  const p = fromJson(PathwaySchema, doc as never, { ignoreUnknownFields: false })
  if (p.trl < 1 || p.trl > 9) throw new Error(`${ctx(id)}: trl ${p.trl} outside 1..9`)
  return p
}

export function validateMaterialDoc(doc: AnyDoc, citations: Set<string>) {
  const id = String(doc.id ?? '?')
  checkRanges(doc.properties as AnyDoc | undefined, id)
  return fromJson(MaterialSchema, doc as never, { ignoreUnknownFields: false })
}
```

Note: protojson enum parsing accepts the YAML enum names (`DAC`, `CANDIDATE`, …) directly — no mapping needed.

- [ ] **Step 3:** Add to loader (below validations) the directory seeding functions:

```ts
import fs from 'node:fs'
import path from 'node:path'
import { parse } from 'yaml'
import { insertCitation, insertMaterial, insertPathway } from '@/lib/db/repos'
import type { Database } from 'better-sqlite3'

const readYamls = (dir: string): AnyDoc[] =>
  !fs.existsSync(dir) ? [] : fs.readdirSync(dir).filter(f => f.endsWith('.yaml')).map(f => {
    try { return parse(fs.readFileSync(path.join(dir, f), 'utf8')) as AnyDoc }
    catch (e) { throw new Error(`${f}: YAML parse error: ${(e as Error).message}`) }
  })

export function seedFromDataDir(db: Database, dataDir: string) {
  const citations = readYamls(path.join(dataDir, 'sources')).map(validateCitationDoc)
  const citationIds = new Set(citations.map(c => c.id))
  const materials = readYamls(path.join(dataDir, 'materials')).map(d => validateMaterialDoc(d, citationIds))
  const materialIds = new Set(materials.map(m => m.id))
  const pathways = readYamls(path.join(dataDir, 'pathways')).map(d => validatePathwayDoc(d, citationIds, materialIds))
  const tx = db.transaction(() => {
    for (const c of citations) insertCitation(db, c as never)
    for (const m of materials) insertMaterial(db, m as never)
    for (const p of pathways) insertPathway(db, p as never)
  })
  tx()
  return { citations: citations.length, materials: materials.length, pathways: pathways.length }
}
```

`src/lib/seed/check.ts` — CI/bootless data validation:

```ts
import { openDb } from '@/lib/db'        // use ':memory:' via env override below
import { seedFromDataDir } from './loader'
const db = openDb(':memory:')
try {
  const counts = seedFromDataDir(db, process.argv[2] ?? 'data')
  console.log('OK', counts)
} catch (e) { console.error((e as Error).message); process.exit(1) }
```
Run with `npx tsx src/lib/seed/check.ts data`; if `@/` imports fail under tsx, use relative imports inside check.ts only.

- [ ] **Step 4: Run tests → PASS**, then commit: `git add src/lib/seed && git commit -m "feat: validating seed loader"`

### Task 5: Seed content + boot wiring

**Files:** Create `data/sources/*.yaml`, `data/materials/*.yaml`, `data/pathways/*.yaml` (~24), `src/instrumentation.ts`.

⚠️ Content integrity rule: every metric range must carry a real citation that exists in `data/sources/`. Use the starter bibliography below; before finishing this task, verify each entry's title/authors/year via web search and correct discrepancies. Where a value can't be sourced confidently, widen the range rather than inventing precision.

- [ ] **Step 1: Bibliography — `data/sources/` — exactly ONE file per source** (the loader parses each YAML file as a single document; a multi-entry map file would fail strict validation). E.g. `data/sources/mcqueen2021.yaml`:

```yaml
id: mcqueen2021
title: "A review of direct air capture (DAC): scaling up commercial technologies and innovating for the future"
authors: ["McQueen, N.", "Gomes, K. V.", "McCormick, C.", "Blomgren, K.", "Parkinson, O.", "Wilkerson, J.", "Wilcox, J."]
year: 2021
venue: "Progress in Energy"
url: "https://doi.org/10.1088/2516-1083/abf1ce"
```

Starter set (each entry MUST be finalized as a verified record — title/authors/year/venue/URL confirmed via web search before this task's commit; entries marked ⚠ are least certain, resolve or replace them):
`mcqueen2021` (above) · `nas2019` National Academies, *Negative Emissions Technologies and Reliable Sequestration* (2019), doi 10.17226/25259 · `iea2022ccus` IEA *CCUS in Clean Energy Transitions* (2021), iea.org/reports/ccus-in-clean-energy-transitions · `keith2018` Keith et al., "A Process for Capturing CO₂ from the Atmosphere", Joule (2018), doi 10.1016/j.joule.2018.05.006 · `fasihi2022` Fasihi et al., "Direct air capture of CO₂", One Earth (2022) · `young2023` Young et al., "The cost of direct air capture…", Frontiers in Climate (2023) · `sanzperez2016` Sanz-Pérez et al., "Direct Capture of CO₂ from Ambient Air", Chem. Rev. (2016) · `darunte2019` Darunte et al., amine-appended MOF adsorption studies (2019) · `voskian2020` Voskian & Hatton, "Faradaic electro-swing CO₂ capture", Energy Environ. Sci. (2020) · `matter2016` Matter et al., "Rapid carbon mineralization…basalt", Science (2016) · `beerling2020` Beerling et al., "Potential for large-scale CO₂ removal via enhanced rock weathering with croplands", Nature (2020) · `renforth2019` Renforth, "The negative emission potential of alkaline materials", Nature Comm. (2019) · `eisaman2012` Eisaman et al., electrodialytic CO₂ desorption from seawater (2012) · `laplante2021` La Plante et al., ocean electrochemical alkalinity (Environ. Sci. Technol.) · ⚠`faridi2021` carbonic anhydrase for CCU review — verify authors/year/venue · ⚠`park2017` Cansolv pilot results GHGT — verify · `anthony2011` Anthony, "Calcium looping…review", Ind. Eng. Chem. Res. (2011) · ⚠`duarte2017` macroalgae sequestration — verify · ⚠`vaughan2018` Vaughan et al., BECCS review — verify. Add further sources as pathway authoring demands.

- [ ] **Step 2: Materials — `data/materials/*.yaml`** (≥5 exemplars, then complete as pathways require)

`mea.yaml`: class LIQUID_SOLVENT, properties regeneration_energy ~{180–200 kJ/mol} (source karapetsov?→use iea2022ccus or sanzperez2016) — keep sourced or drop the property.
`mg2dobpdc.yaml`: class MOF, summary on diamine-appended Mg₂(dobpdc) step-isotherm, pdb_ids_csv optional.
`carbonic-anhydrase.yaml`: class ENZYME, uniprot_id P00918, summary re accelerated CO₂ hydration.
`quinone-electrode.yaml`: class ELECTRODE_MATERIAL (voskian2020).
`olivine.yaml`: class MINERAL (beerling2020, matter2016 context).
Add as needed: solid-amine-silica (AMINE_SORBENT, sanzperez2016), cansolv-solvent (LIQUID_SOLVENT, park2017), cao-lime (MINERAL, anthony2011).

- [ ] **Step 3: Pathways — `data/pathways/*.yaml`.** Three full exemplars:

`mea-scrubbing.yaml`:
```yaml
id: mea-scrubbing
name: "MEA amine scrubbing (benchmark)"
setting: POINT_SOURCE
is_benchmark: true
trl: 9
search_terms: ["MEA post-combustion capture", "monoethanolamine CO2 scrubbing"]
mechanism: |
  30 wt% monoethanolamine aqueous solvent chemisorbs CO₂ from flue gas in an
  absorber column (~40–60 °C); the rich solvent is regenerated in a stripper at
  ~120 °C, releasing a pure CO₂ stream for compression. Mature incumbent technology.
metrics:
  cost: { low: 40, high: 90, unit: USD/tCO2, year_basis: 2022, source_ref: iea2022ccus }
  energy_thermal: { low: 3.5, high: 4.2, unit: GJ/tCO2, year_basis: 2022, source_ref: iea2022ccus }
advantages: ["Proven at scale for decades", "High capture efficiency (>90%)"]
challenges: ["Large reboiler duty", "Solvent degradation and aerosol emissions"]
material_ids: [mea]
source_refs: [iea2022ccus, nas2019]
```

`mof-dac.yaml`: name exactly `"MOF-based DAC (diamine-Mg2(dobpdc) class)"` (E2E matcher depends on it), setting DAC, trl 5, cost {80,600} mcqueen2021 + young2023, energy_thermal {4.5,7.5} GJ/tCO2 sanzperez2016/mcqueen2021, mechanism on diamine-appended Mg₂(dobpdc) TVSA step isotherms, challenges: humid-air degradation, sorbent cost, material mg2dobpdc.

`enzymatic-absorption.yaml`: setting BIOLOGICAL, trl 4, search_terms ["carbonic anhydrase carbon capture","enzyme accelerated CO2 absorption"], mechanism: CA catalyzes CO₂+H₂O⇌HCO₃⁻ by ~10⁶× over uncatalyzed; immobilized enzymes accelerate absorber kinetics enabling lower-temperature regeneration. metrics: cost {50,400} faridi2021 (wide, early-stage), material carbonic-anhydrase, challenges: enzyme thermal/pH stability, immobilization lifetime, unproven economics.

Remaining 21 files follow the same pattern (values must be sourced from bibliography; widen ranges when sources disagree). **Complete enumeration — 24 total, all required:**

| File | Setting | TRL hint | Anchor sources |
|---|---|---|---|
| advanced-amine-point-source | POINT_SOURCE | 8–9 | park2017, iea2022ccus |
| solid-amine-point-source | POINT_SOURCE | 7–9 | iea2022ccus |
| calcium-looping *(is_benchmark: true)* | POINT_SOURCE | 6–7 | anthony2011, nas2019 |
| oxy-fuel-combustion | POINT_SOURCE | 7–8 | iea2022ccus, nas2019 |
| selexol-precombustion | POINT_SOURCE | 8–9 | iea2022ccus |
| membranes-point-source | POINT_SOURCE | 6–7 | nas2019 |
| liquid-solvent-dac | DAC | 7–9 | keith2018, young2023 |
| amine-silica-dac | DAC | 6–7 | sanzperez2016 |
| humidity-swing-dac | DAC | 4–5 | mcqueen2021 |
| electro-sorption-dac | DAC | 4–5 | voskian2020 |
| electrodialysis-doc | OCEAN_DIC | 4–6 | eisaman2012, mcqueen2021 |
| electrochemical-oae | OCEAN_DIC | 4–6 | laplante2021 |
| mineral-addition-oae | OCEAN_DIC | 5–6 | nas2019 |
| basalt-injection | MINERALIZATION | 6–8 | matter2016 |
| slag-carbonation | MINERALIZATION | 5–7 | renforth2019 |
| aggregate-carbonation | MINERALIZATION | 4–6 | renforth2019 |
| enhanced-weathering-cropland | MINERALIZATION | 6 | beerling2020 |
| beccs *(is_benchmark: true)* | BIOLOGICAL | 6–9 | vaughan2018, nas2019 |
| biochar | BIOLOGICAL | 6–7 | nas2019 |
| soil-carbon-sequestration | BIOLOGICAL | 6–8 | nas2019 |
| macroalgae-cultivation | BIOLOGICAL | 3–5 | duarte2017 |

(3 exemplars + 21 rows = 24.) Benchmarks are exactly: `mea-scrubbing`, `calcium-looping`, `beccs`.

Include `permanence` (years) only where inherent to the pathway (mineralization ~1000–100000+; OAE similar; amine/biomass capture-side pathways omit — permanence there belongs to storage, not capture). Include `capacity_potential` (Gt/yr, wide ranges, nas2019) where defensible.

- [ ] **Step 4: Boot wiring.** First add to `next.config.ts`:

```ts
const nextConfig: NextConfig = {
  serverExternalPackages: ['better-sqlite3'],   // native module — must not be bundled
}
```

Then `src/instrumentation.ts`:

```ts
export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return
  if (process.env.NEXT_PHASE === 'phase-production-build') return
  const { openDb } = await import('@/lib/db')
  const { seedFromDataDir } = await import('@/lib/seed/loader')
  const db = openDb(process.env.CARBON_DB)
  const counts = seedFromDataDir(db, path.join(process.cwd(), 'data'))
  console.log('[seed]', counts)
}
```
(import `node:path`.) After seeding, log a warning for seed-drifted user rows: query `shortlist.pathway_id` and `journal_entries.pathway_refs` values not present in the seeded pathway ids and `console.warn('[seed] drift: ...')` each. Boot failure crashes startup = spec's fail-loudly. Restart dev server to reload seed changes (documented).

- [ ] **Step 5: Verify**: `npm run seed:check data` → prints OK counts (expect 24 pathways, ≥8 materials, ≥19 citations). Start `npm run dev`, confirm `[seed]` log, then kill it. Seed-drift check: insert a bogus row (`sqlite3 carbon.db "INSERT INTO shortlist VALUES ('ghost','CANDIDATE','','2026-08-23T00:00:00Z')"`), restart dev server → expect `[seed] drift:` warning for `ghost`; delete the row.

Note (intentional deltas vs spec's example list): allowlist uses `GJ-e/tCO2` (renamed from spec's `GJ-electric/tCO2` — keep consistent everywhere) and adds `Mt/yr`, `mmol/g`, `kJ/mol`, `USD/kg`; spec's `tCO2/t-material` is dropped as unused in v1.

- [ ] **Step 6: Commit**: `git add data src/instrumentation.ts && git commit -m "feat: curated seed corpus (24 pathways) and boot-time loading"`

<!-- CHUNK1_END -->
## Chunk 2: Core surfaces

### Task 6: App shell + shared helpers

**Files:** Create `src/lib/settings.ts`, `src/lib/format.ts`(+test), `src/components/app-sidebar.tsx`; Modify `src/app/layout.tsx`.

- [ ] **Step 1: Failing tests — `src/lib/format.test.ts`**

```ts
import { describe, it, expect } from 'vitest'
import { formatRange, mid, axisLabel } from './format'

describe('format', () => {
  it('formats ranges with units and year basis', () => {
    expect(formatRange({ low: 80, high: 600, unit: 'USD/tCO2', year_basis: 2022 }))
      .toBe('$80–$600 /tCO2')
    expect(formatRange({ low: 3.5, high: 4.2, unit: 'GJ/tCO2', year_basis: 2022 }))
      .toBe('3.5–4.2 GJ/tCO2')
  })
  it('midpoint math', () => expect(mid({ low: 80, high: 600 } as never)).toBe(340))
  it('axis labels', () => {
    expect(axisLabel('cost')).toMatch(/Cost/i)
    expect(axisLabel('energy_total')).toMatch(/Energy/i)
    expect(axisLabel('trl')).toMatch(/TRL/i)
  })
})
```

Run → FAIL, then implement `src/lib/format.ts`:

```ts
export interface Range { low: number; high: number; unit: string; year_basis?: number }

export const mid = (r: { low: number; high: number }) => (r.low + r.high) / 2

const money = (u: string) => u.startsWith('USD')
export function formatRange(r: Range): string {
  const f = (n: number) => n >= 100 ? Math.round(n).toString() : n.toString()
  if (money(r.unit)) return `$${f(r.low)}–$${f(r.high)} ${r.unit.slice(3)}`
  return `${f(r.low)}–${f(r.high)} ${r.unit}`
}

export const AXIS_KEYS = ['cost', 'energy_thermal', 'energy_electric', 'energy_total',
  'capacity_potential', 'permanence'] as const
export type AxisKey = (typeof AXIS_KEYS)[number] | 'trl'
const axisLabels: Record<string, string> = {
  cost: 'Cost ($/tCO₂)', energy_thermal: 'Thermal energy (GJ/tCO₂)',
  energy_electric: 'Electric energy (GJ-e/tCO₂)', energy_total: 'Total energy (GJ/tCO₂)',
  capacity_potential: 'Capacity potential (Gt/yr)', permanence: 'Permanence (years)', trl: 'TRL',
}
export const axisLabel = (key: string): string => axisLabels[key] ?? key
```

- [ ] **Step 2: `src/lib/settings.ts`**

```ts
export const SETTING_ORDER = ['POINT_SOURCE', 'DAC', 'OCEAN_DIC', 'MINERALIZATION', 'BIOLOGICAL'] as const
export const SETTING_LABELS: Record<string, string> = {
  POINT_SOURCE: 'Point source', DAC: 'Direct air capture', OCEAN_DIC: 'Ocean',
  MINERALIZATION: 'Mineralization', BIOLOGICAL: 'Biological',
}
export const SETTING_COLORS: Record<string, string> = {
  POINT_SOURCE: '#93c5fd', DAC: '#5eead4', OCEAN_DIC: '#67e8f9',
  MINERALIZATION: '#fcd34d', BIOLOGICAL: '#a3e635',
}
export const SHORTLIST_STATUSES = ['CANDIDATE', 'UNDER_EVALUATION', 'ELIMINATED', 'CHOSEN'] as const
export const STATUS_LABELS: Record<string, string> = {
  CANDIDATE: 'Candidate', UNDER_EVALUATION: 'Under evaluation', ELIMINATED: 'Eliminated', CHOSEN: 'Chosen',
}
export const ENTRY_KIND_LABELS: Record<string, string> = {
  OBSERVATION: 'Observation', COMPARISON_NOTE: 'Comparison note', DECISION: 'Decision', ELIMINATION: 'Elimination',
}
```

- [ ] **Step 3: Sidebar — `src/components/app-sidebar.tsx`** (client comp using `usePathname`):

Nav items: Landscape `/`, Compare `/compare`, Materials `/materials`, Decision Space `/decision`, About `/about`. shadcn-styled vertical list with active highlight. `layout.tsx`: sidebar fixed left (~220px), content area right; metadata title "Carbon Capture Research".

- [ ] **Step 4:** Run tests + tsc → PASS. Commit: `"feat: app shell, settings/format helpers"`

### Task 7: Landscape surface

**Files:** Create `src/lib/db/instance.ts`, `src/lib/scatter.ts`(+test), `src/components/landscape/scatter-plot.tsx`, `landscape-filters.tsx`, `pathway-list.tsx`; Modify `src/app/page.tsx`.

URL state contract (persists through drill-downs): `?settings=DAC,OCEAN_DIC&minTrl=4&benchmark=1&x=cost&y=trl&logX=1`. Defaults when params absent: `x=cost`, `y=trl`, linear scale, no filters. `minTrl` ranges 0–9 (0 = no minimum). **`back` param convention** (used by Task 8's breadcrumb): any link leaving the landscape appends `back=<encodeURIComponent(current search string)>`; detail pages reconstruct the return URL as `/?${decodeURIComponent(back)}`.

All three components are client components that own their navigation via `useRouter().push()` — the page passes only serializable props (plain objects; spread hydrated proto messages into `{low,high,unit,year_basis}` objects, never Message instances).

- [ ] **Step 1: Scatter scale unit tests** — add to a new `src/lib/scatter.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { projectPoint, makeScales } from '@/lib/scatter'

describe('scatter projection', () => {
  const pts = [
    { id: 'a', x: 100, y: 5 }, { id: 'b', x: 900, y: 9 }, { id: 'c', x: 40, y: 1 },
  ]
  it('linear scales map to padded viewport', () => {
    const s = makeScales(pts, { w: 800, h: 400, logX: false })
    const p = projectPoint(pts[0], s)
    expect(p.cx).toBeGreaterThan(0); expect(p.cy).toBeLessThan(400)
    expect(p.cx).toBeLessThan(projectPoint(pts[1], s).cx) // higher cost -> right
    expect(p.cy).toBeLessThan(projectPoint(pts[2], s).cy) // higher TRL -> up
  })
  it('log scales keep positive domain monotonic', () => {
    const s = makeScales(pts, { w: 800, h: 400, logX: true })
    expect(projectPoint(pts[0], s).cx).toBeLessThan(projectPoint(pts[1], s).cx)
  })
})
```

Implement `src/lib/scatter.ts`: pure functions — domain from data (pad 8%), linear or log10 (guard x<=0 → clamp to domain min), y inverted (screen coords), return `{sx, sy}` closures used by `projectPoint`. ~60 lines, no deps.

- [ ] **Step 2: `scatter-plot.tsx`** (client): SVG 800×420 viewBox, axes ticks (5), dots r=7 filled by `SETTING_COLORS[setting]`, `data-testid="dot"` + `data-id={id}` attributes, `<title>` tooltip fallback + custom hover div showing name, formatted ranges for x/y metrics, benchmark = ring stroke. Props: `points: {id,name,setting,x,y,xRange?,yRange?,isBenchmark}[]` + axis keys/flags. Dot click → `router.push('/pathways/${id}?back=' + encodeURIComponent(search))`. Legend row under plot (setting colors).

- [ ] **Step 3: Filters (`landscape-filters.tsx`) + list (`pathway-list.tsx`)**: axis pickers (shadcn Select for x and y, incl. log toggle) sit in the filter row above the chart. Filters: setting checkboxes (`data-testid="filter-setting-<ENUM>"`, SETTING_ORDER labels), min-TRL select (0–9), benchmark-only checkbox — all push URL params via `router.push(..., {scroll:false})`. List rows link to `/pathways/${id}?back=…`; compare checkbox writes `ids` param.

- [ ] **Step 4: `page.tsx`** (server): render an `<h1>Landscape</h1>` heading (E2E depends on it). Load pathways via `listPathways(openDb())` using `src/lib/db/instance.ts`: `export const openDb = cache(() => rawOpenDb(process.env.CARBON_DB))`. Await `searchParams` (Next 15 Promise). Derive point values: x/y metric key → `mid(range)`; missing metric → excluded from plot (show "N pathways lack ⟨axis⟩ data" note). Pass down plain-object props per the contract above.

- [ ] **Step 5: Verify manually**: boot dev server (verify listen pid), browse `/`, switch axes, filter DAC, hover/click dot → detail route with preserved filter params. Run `npm run lint && npm run typecheck && npm test`.

- [ ] **Step 6: Commit** — `"feat: chart-first landscape explorer"`

### Task 8: Pathway detail page

**Files:** Create `src/app/pathways/[id]/page.tsx`, `src/components/pathway/metric-table.tsx`; use shadcn Card/Badge.

- [ ] **Step 1: `metric-table.tsx`**: rows over `Object.entries(metrics)`; columns Metric | Range (`formatRange`) | Year basis | Source (link from citation lookup, opens doi/url). Accept `metrics`, `citationsById` props.
- [ ] **Step 2: `page.tsx`**: await `params` AND `searchParams` (Next 15 Promises — see global conventions). Fetch pathway + build `citationsById` merging citations from top-level `source_refs` **and** per-metric `source_ref`s (getCitation per id) + materials (getMaterial). Render: name + badges (setting, TRL, BENCHMARK), mechanism markdown (`react-markdown` — `npm i react-markdown`; also used later by the journal), advantages/challenges two-column pros-cons lists, materials as links to `/materials/[id]`, literature panel placeholder (mounted in Task 10 Step 6), shortlist action bar (Task 9), breadcrumb: if `back` param present, link "← Landscape" → `/?${decodeURIComponent(back)}`. Unknown id → `notFound()`.
- [ ] **Step 3: Verify in browser** (pid check): MEA detail shows cited ranges; unknown id → `notFound()`.
- [ ] **Step 4: Commit** — `"feat: pathway detail with cited metrics"`

### Task 9: Research mutations (server actions)

**Files:** Create `src/lib/actions/shortlist-guard.ts`(+test), `src/lib/actions/research-actions.ts`, `src/components/pathway/shortlist-actions.tsx`; Modify pathway detail page.

- [ ] **Step 1: Pure guard module — `shortlist-guard.ts`** (no `'use server'`, no imports beyond types; unit-testable):

```ts
import { ShortlistStatus } from '@/lib/gen/carbon/v1/research_pb'

export const ALLOWED_TRANSITIONS: Record<string, string[]> = {
  CANDIDATE: ['UNDER_EVALUATION', 'ELIMINATED', 'CHOSEN'],
  UNDER_EVALUATION: ['ELIMINATED', 'CHOSEN'],
  ELIMINATED: ['UNDER_EVALUATION'],   // reconsidering is allowed
  CHOSEN: [],
}
export function assertTransition(from: string, to: string): void {
  if (!(to in ShortlistStatus) || to === 'SHORTLIST_STATUS_UNSPECIFIED')
    throw new Error(`unknown status: ${to}`)
  if (from === '' || from === 'SHORTLIST_STATUS_UNSPECIFIED') return   // fresh entry
  if (from !== to && !ALLOWED_TRANSITIONS[from]?.includes(to))
    throw new Error(`illegal transition ${from} -> ${to}`)
}
export function normalizeRationale(text: string): string {
  return text.trim().slice(0, 5000)
}
```

Test file covers legal/illegal transitions and trimming.

- [ ] **Step 2: Actions file** (`'use server'` — every export must be async; import the guard, do not re-export it):

```ts
'use server'
import { revalidatePath } from 'next/cache'
import { openDb } from '@/lib/db/instance'
import { upsertShortlist, upsertJournal } from '@/lib/db/repos'
import { ShortlistStatus, EntryKind } from '@/lib/gen/carbon/v1/research_pb'
import { assertTransition, normalizeRationale } from './shortlist-guard'


```ts
'use server'
import { revalidatePath } from 'next/cache'
import { openDb } from '@/lib/db/instance'
import { upsertShortlist, upsertJournal } from '@/lib/db/repos'
import { ShortlistStatus, EntryKind } from '@/lib/gen/carbon/v1/research_pb'

export async function setShortlistStatus(pathwayId: string, from: string, to: keyof typeof ShortlistStatus, rationale: string) {
  assertTransition(from, to)   // from shortlist-guard.ts
  const db = openDb()
  upsertShortlist(db, { pathwayId, status: to, rationale: normalizeRationale(rationale), updatedAt: new Date().toISOString() })
  revalidatePath('/decision'); revalidatePath(`/pathways/${pathwayId}`)
}
export async function addJournalEntry(kind: keyof typeof EntryKind, title: string, body: string, refs: string[]) {
  const db = openDb()
  upsertJournal(db, { id: crypto.randomUUID(), kind, title, bodyMarkdown: body, pathwayRefs: refs, createdAt: new Date().toISOString() })
  revalidatePath('/decision')
}
```
(`db/instance.ts`: `export const openDb = cache(() => rawOpenDb(process.env.CARBON_DB))`.)

- [ ] **Step 3: `shortlist-actions.tsx`** (client): two buttons on detail page — **Shortlist** (→ CANDIDATE) and dialog **Eliminate…** (rationale textarea → ELIMINATED); call actions (Shortlist passes `from: ''`), show toast-less inline confirmation (button state).
- [ ] **Step 4: Run guard unit tests → PASS** (`npx vitest run src/lib/actions/shortlist-guard.test.ts`).
- [ ] **Step 5: Verify**: detail page → Eliminate with rationale → check SQLite row holds enum name + trimmed rationale (`sqlite3 carbon.db 'select * from shortlist'`). Commit — `"feat: shortlist/eliminate actions"`

## Chunk 3: Edges + convergence surfaces

### Task 10: Literature edge (OpenAlex, SWR)

**Files:** Create `src/lib/edges/openalex.ts`(+test), `src/lib/edges/literature.ts`, `src/app/api/literature/[pathwayId]/route.ts`, `src/components/pathway/literature-panel.tsx`; Modify `src/app/pathways/[id]/page.tsx`.

- [ ] **Step 1: Failing tests — `openalex.test.ts`** (mock `global.fetch`):

```ts
import { describe, it, expect, vi, afterEach } from 'vitest'
import { buildQuery, normalizeWork } from './openalex'

afterEach(() => vi.unstubAllGlobals())

describe('openalex', () => {
  it('builds search url with terms and field selection', () => {
    const url = buildQuery('MOF DAC', ['mof dac', 'Mg2(dobpdc) CO2'])
    expect(url).toContain('https://api.openalex.org/works?')
    expect(decodeURIComponent(url)).toContain('search=MOF DAC')
    expect(url).toContain('per-page=8')
  })
  it('normalizes a work into a Citation', () => {
    expect(normalizeWork({
      id: 'https://openalex.org/W1', display_name: 'A study',
      authorships: [{ author: { display_name: 'A' } }, { author: { display_name: 'B' } },
        { author: { display_name: 'C' } }, { author: { display_name: 'D' } }, { author: { display_name: 'E' } },
        { author: { display_name: 'F' } }],
      publication_year: 2022, doi: 'https://doi.org/10.1/x',
      primary_location: { source: { display_name: 'Journal' } },
    })).toMatchObject({ id: 'openalex:W1', title: 'A study', year: 2022,
      authors: ['A', 'B', 'C', 'D', 'E'], venue: 'Journal', url: 'https://doi.org/10.1/x' })
  })
})
```

- [ ] **Step 2: Implement `openalex.ts`**: `buildQuery(name, terms)` → URL with `search=` first non-empty of (terms[0], name), `per-page=8&select=id,display_name,authorships,publication_year,doi,primary_location&mailto=research@local`; `fetchWorks()` → fetch + `result[]` → `normalizeWork` → `Citation[]` (cap authors 5). Timeout via `AbortSignal.timeout(8000)`; throw on !ok.

- [ ] **Step 3: `literature.ts` orchestration**

```ts
import { after } from 'next/server'
const TTL_MS = 7 * 24 * 3600 * 1000
export async function getLiterature(db, pathway) {
  const cached = getLitCache(db, pathway.id)
  const age = cached ? Date.now() - cached.fetchedAt : Infinity
  if (age < TTL_MS) return { freshness: 'fresh', fetchedAt: cached.fetchedAt, works: JSON.parse(cached.worksJson) }
  if (cached) {
    // stale-while-revalidate: return cache now, refresh after response flushes
    after(() => refresh(db, pathway))
    return { freshness: 'stale', fetchedAt: cached.fetchedAt, works: JSON.parse(cached.worksJson) }
  }
  const works = await refresh(db, pathway)   // cold: block once so panel fills
  return { freshness: works ? 'fresh' : 'error', fetchedAt: Date.now(), works: works ?? [] }
}
async function refresh(db, pathway) {
  try {
    const works = await fetchWorks(pathway.name, pathway.searchTerms ?? [])
    putLitCache(db, pathway.id, Date.now(), JSON.stringify(works)); return works
  } catch { return null }
}
```

- [ ] **Step 4: Route handler** `src/app/api/literature/[pathwayId]/route.ts`: load pathway (404 if unknown), call `getLiterature`, return JSON `{freshness, fetchedAt, works}`. `export const dynamic = 'force-dynamic'`.

- [ ] **Step 5: `literature-panel.tsx`** (client): fetch endpoint on mount; states — loading skeleton; fresh → list of citation cards (title link, authors et al., venue year) + badge "as of ⟨date⟩"; stale → amber badge + Retry button refetching; `error` (cold-cache upstream failure) → amber badge "unavailable" + Retry button; empty → "No literature found". Never throws to page.

- [ ] **Step 6: Mount panel** — in pathway detail page (Task 8), add `<LiteraturePanel pathwayId={id} />` below the metric table inside an error boundary.

- [ ] **Step 7: Verify** (pid check): MOF detail shows real OpenAlex results; second load instant w/ fresh badge. Simulated outage: set `CARBON_SIMULATE_OUTAGE=1` — implement as a check at the top of `fetchWorks` (`if (process.env.CARBON_SIMULATE_OUTAGE) throw new Error('simulated outage')`) and restart the server with a cold cache → panel shows amber "unavailable" + Retry; clear env, retry → fills. Commit — `"feat: literature edge with swr caching"`

### Task 11: Materials index/detail + structure viewer

**Files:** Create `src/app/materials/page.tsx`, `src/app/materials/[id]/page.tsx`, `src/components/materials/structure-viewer.tsx`, `src/app/api/structure/route.ts`.

- [ ] **Step 1: Index page**: server comp; class filter via search param; grid of cards (name, class badge, property count); used-by computed by scanning pathways' material_ids.
- [ ] **Step 2: Structure proxy route**: `/api/structure?uniprot=X|pdb=Y` → fetch `https://alphafold.ebi.ac.uk/files/AF-${uniprot}-F1-model_v4.cif` or `https://files.rcsb.org/download/${pdb}.cif`; validate id against `/^[A-Z0-9]{4,10}$/i` before interpolation; stream text back with long cache headers; 502 on upstream failure.
- [ ] **Step 3: `structure-viewer.tsx`** (client): dynamic import of `pdbe-molstar` web component (`npm i pdbe-molstar`) inside `<script>` tag injection or React wrapper; set `customData={url: '/api/structure?uniprot=…', format: 'cif', hideControls: false}`. **Acceptance is graceful degradation**: if the component fails to init within timeout or errors, render fallback links ("View at AlphaFold DB" / "View at RCSB PDB"). Materials without ids show nothing structural. Do not let viewer failure affect page render (error boundary).
- [ ] **Step 4: Verify**: carbonic-anhydrase material page renders viewer from AlphaFold DB cif (or clean fallback); olivine has no structure section. Commit — `"feat: materials pages and structure viewing"`

### Task 12: Compare surface

**Files:** Create `src/app/compare/page.tsx`, `src/components/compare/compare-table.tsx`.

- [ ] **Step 1: Page**: reads `?ids=a,b,c` (default: all benchmarks + currently shortlisted); server comp loads pathways, passes serializable rows.
- [ ] **Step 2: `compare-table.tsx`** (client): columns = pathways; rows = union of metric keys ∪ TRL ∪ Setting; each cell = `formatRange` + inline horizontal range bar normalized to row min/max (pure div widths); benchmark column header starred; missing = "—". Pathway name header links to detail.
- [ ] **Step 3: Landscape list compare-checkboxes already write `ids` — verify handoff both directions (Compare links back to `/` preserving filters).**
- [ ] **Step 4: Verify + commit** — `"feat: side-by-side comparison view"`

### Task 13: Decision Space

**Files:** Create `src/app/decision/page.tsx`, `src/components/decision/board.tsx`, `src/components/decision/journal.tsx`.

- [ ] **Step 1: Board** (server page + client board): four shadcn Card columns CANDIDATE / UNDER_EVALUATION / ELIMINATED / CHOSEN with `data-testid="column-<STATUS>"`; each entry card shows pathway name (or tombstone "removed from seed — rationale preserved" when `existsInSeed=false`), status Select (convert hydrated numeric enum to name via `ShortlistStatus[e.status]` before passing as `from` to `setShortlistStatus`; UNDER_EVALUATION/CHOSEN prompt optional rationale via dialog), rationale preview. Empty state primer line per spec.
- [ ] **Step 2: Journal timeline**: vertical list (created_at desc) of entries — kind badge, title, markdown body (render with `react-markdown`, already installed in Task 8), linked pathway chips (tombstone-styled chip "removed from seed" when a referenced pathway id is no longer in the seed); "New entry" Dialog: kind select, title input, body textarea, pathway multi-checkbox list; delete button per entry.
- [ ] **Step 3: Add `deleteJournalEntry` server action** to `src/lib/actions/research-actions.ts`:

```ts
export async function deleteJournalEntry(id: string) {
  deleteJournal(openDb(), id)   // repo fn exists from Task 3
  revalidatePath('/decision')
}
```

- [ ] **Step 4: Verify full loop**: eliminate MEA w/ rationale from its detail page → appears under Eliminated; move MOF DAC → Under evaluation; add DECISION journal note referencing it; restart server — state persists. Commit — `"feat: decision space board and journal"`

### Task 14: About/methodology + polish

**Files:** Create `src/app/about/page.tsx`; touch-ups across surfaces.

- [ ] **Step 1: About page**: static content — what this platform is, how metrics are sourced (every number = range + citation), unit allowlist, benchmark rationale, literature caching behavior, how seed YAML edits flow (restart to reseed), caveats (ranges span studies; not investment advice).
- [ ] **Step 2: Polish pass**: empty states (no shortlist yet, no literature, no structures), error boundary around live-edge panels only, `notFound()` styling, favicon/title. Run full `npm run lint && npm run typecheck && npm test`.
- [ ] **Step 3: Commit** — `"feat: methodology page and polish"`

### Task 15: E2E smoke + final verification

**Files:** Modify `tests/e2e/smoke.spec.ts`.

- [ ] **Step 1: Write spec scenario** (spec's E2E contract):

```ts
import { test, expect } from '@playwright/test'

test('landscape → filter → detail → eliminate w/ rationale → decision space', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: /landscape/i })).toBeVisible()
  await page.getByTestId('filter-setting-DAC').check()        // filter chip (contract from Task 7)
  await expect(page.locator('[data-testid="dot"]')).toHaveCount(5, { timeout: 5000 }) // DAC pathways
  await page.locator('[data-testid="dot"][data-id="mof-dac"]').click()
  await expect(page).toHaveURL(/\/pathways\/mof-dac/)
  await expect(page.getByText(/\$80–\$600/)).toBeVisible()   // cited range renders
  await page.getByRole('button', { name: /eliminate/i }).click()   // opens rationale dialog (Task 9)
  await page.getByPlaceholder(/rationale/i).fill('Sorbent degradation risk too high')
  await page.getByRole('button', { name: /confirm/i }).click()
  await page.goto('/decision')
  const eliminated = page.locator('[data-testid="column-ELIMINATED"]')
  await expect(eliminated.getByText(/MOF-based DAC/i)).toBeVisible()
  await expect(eliminated.getByText(/Sorbent degradation risk too high/)).toBeVisible()
})
```

(Adjust selectors to actual markup as implemented; keep contracts `data-testid="dot"` + `data-id`, `filter-setting-<ENUM>`, `column-<STATUS>`.)

- [ ] **Step 2: Persistence check** — extend test: add journal entry via UI, then assert SQLite row exists via child_process exec `sqlite3 carbon.db ...` inside the test (documented workaround; full restart-persistence is verified manually in Task 13).

- [ ] **Step 3: Full verification run**: `npm run build`; start manually (`npm run start &`); verify pid via `lsof -nP -iTCP:3000 -sTCP:LISTEN` is your process; browse every surface once; **kill the server**. Then run `npm run e2e` — Playwright's own webServer boots a fresh dev server on :3000 (config has `reuseExistingServer: false`, so the manual server must already be down or e2e fails with port-in-use). Expect PASS.

- [ ] **Step 4: Commit** — `"test: e2e smoke covering convergence loop"`.

---

## Out of scope reminders (YAGNI)

Weighted scoring/TEA models, multi-user auth/sharing, continuous ingestion pipelines, agent extraction, storing structure files locally, public deployment. The proto map-metric design admits weighted scoring later without schema churn (spec §Data model notes).





