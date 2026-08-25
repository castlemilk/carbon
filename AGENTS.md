# Carbon — agent notes

## Task is the entry point

Every core command lives in `Taskfile.yml` + `taskfiles/*.yml` (same convention
as benebsworth.com). `npm run dev/build/test/e2e/gen/seed:check` are thin
aliases that delegate to task. Use `task --list` / `task <name> --summary`.

- `task verify` — lint + typecheck + unit tests (the commit gate)
- `task test:e2e` — Playwright; boots its own server on :3000, kills squatters
  first (`reuseExistingServer: false`)
- `task data:check` — bootless seed-corpus validation
- `task deploy:cr` — bootstrap the Paprika Application CR on omega (once)
- `task deploy:restart` — bump pods to :latest after GHA builds (image-only)
- `task deploy:status` / `deploy:logs` / `deploy:health` — cluster visibility

## Verification before every commit

```bash
npm run typecheck && npm run lint && npm test
```

For full-stack verification (boots the dev server itself):

```bash
npm run e2e
```

## Dev server / port 3000

Before any manual browser check, confirm the LISTEN pid on port 3000 is your
server process:

```bash
lsof -nP -iTCP:3000 -sTCP:LISTEN
```

If a stale process squats the port, kill it before testing.

## Node version

Pinned in `.nvmrc` (currently v22.20.0) — required because better-sqlite3's
prebuilt binding segfaults under older v22.x point releases (e.g. v22.9.0).
`task check:node` enforces this before any db-touching command.

## Deployment (omega VKE via Paprika)

Same pattern as cuttlefish/telesis/brandbrain: a Paprika Application CR in ns
`paprika-e2e` polls this repo's chart at `deploy/kubernetes/chart`; GHA builds
`ghcr.io/castlemilk/carbon:{latest,sha-*}` on push to master. SQLite lives on
a 1Gi PVC mounted at /data (Deployment strategy Recreate because RWO).
Public URL: https://carbon.benebsworth.com (Envoy Gateway + Cloudflare).

## Storage selection

`src/lib/db/instance.ts` picks the adapter:

- default → **SqliteStore** (better-sqlite3) on `CARBON_DB` (default ./carbon.db;
  /data/carbon.db in-cluster via PVC)
- `CARBON_DB_URL=libsql://…` (+ `CARBON_DB_TOKEN`) → **TursoStore** (optional
  hosted path; not used by the cluster deployment)

Both adapters implement the `CarbonStore` port and are held to the same
behavior by `src/lib/db/store.conformance.test.ts` (Turso leg runs when
`CARBON_TEST_TURSO_URL`/`TOKEN` are set). Repos in `src/lib/db/repos.ts` are
async wrappers over the singleton.

## Embed mode (microfrontend)

Any URL with `?embed=1` (persisted via cookie through middleware) renders
chrome-less — no sidebar — plus a postMessage height handshake
(`carbon:height`) consumed by the hosting page. CSP `frame-ancestors` in
next.config.ts permits benebsworth.com. Lock the handshake target with
`NEXT_PUBLIC_EMBED_PARENT_ORIGIN`.

## Data & codegen

- Seed/reference data lives in YAML under `data/`.
- `src/lib/gen/` contains generated protobuf output (`npm run gen`) — never
  edit by hand; the generated files are committed.
- Seed data loads at boot via `src/instrumentation.ts`: restarting the dev
  server reloads seed changes from `data/`. Boot logs `[seed] {counts}` and a
  `[seed] drift:` warning for shortlist/journal rows referencing pathways no
  longer in `data/`. `npm run seed:check data` validates without booting;
  `task data:drift` diffs data/ against the local database read-only.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
