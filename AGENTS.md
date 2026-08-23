# Carbon — agent notes

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
prebuilt binding segfaults under older v22.x point releases (e.g. v22.9.0);
use `nvm use` before installing/running.

## Data & codegen

- Seed/reference data lives in YAML under `data/`.
- `src/lib/gen/` contains generated protobuf output (`npm run gen`) — never
  edit by hand; the generated files are committed.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
