# Carbon Interactive Graph Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents are available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Carbon's Mermaid-first landscape and pathway diagrams with explicit, interactive React Flow graph views that support inline expansion, `See more` drilldowns, generated semantic assets, and a seamless host embed.

**Architecture:** Keep protobuf/YAML as the source of truth. Add validated process and landscape graph records to the existing seed/store path, adapt them to a client-only React Flow surface, and retain independent Mermaid/content fallbacks during migration. Keep graph interaction state local; preserve filters and comparisons in the URL.

**Tech Stack:** Next.js 16.3.2, React 19, TypeScript, protobuf via Buf/protoc-gen-es, SQLite/Turso stores, `@xyflow/react`, shadcn primitives, Playwright, Vitest, Mermaid CLI, BrandBrain Flow Orchestrator asset-set workflow.

**Spec:** `docs/superpowers/specs/2026-08-28-carbon-interactive-graph-design.md`

---

## File Map

Create or modify only the following areas unless implementation discovers a concrete existing boundary that requires an adjacent test or generated file:

- `proto/carbon/v1/graph.proto` and `proto/carbon/v1/landscape.proto`: shared graph messages and the landscape graph container.
- `proto/carbon/v1/pathway.proto`: new `process_graph` and `operational_graph` fields at 15 and 16; keep Mermaid fields 13 and 14 active.
- `src/lib/gen/carbon/v1/*_pb.ts`: generated output only; never hand-edit.
- `src/lib/seed/graph.ts`, `src/lib/seed/loader.ts`, `src/lib/seed/check.ts`: graph parsing and strict validation.
- `src/lib/db/store.ts`, `src/lib/db/sqlite-store.ts`, `src/lib/db/turso-store.ts`: landscape graph persistence and access.
- `src/lib/landscape/graph.ts`: pure landscape DTO/position adapter.
- `src/lib/landscape/graph.test.ts`: adapter and placement tests.
- `src/lib/graph/*`: framework-neutral process adapter, view selection, DTOs, and their tests.
- `src/components/graph/*`: client-only React Flow canvas, nodes, edges, inspector, fallback list, and asset renderer.
- `src/components/pathway/pathway-diagrams.tsx`, `src/app/pathways/[id]/page.tsx`: detail graph integration and independent fallbacks.
- `src/app/page.tsx`: overview graph integration and scatter/table fallback.
- `src/components/landscape/scatter-plot.tsx`: retain as fallback; update interaction tests only if its contract changes.
- `tests/e2e/smoke.spec.ts` and focused new E2E specs: graph interaction, fallback, accessibility, and responsive behavior.
- `taskfiles/data.yml`, `taskfiles/quality.yml`, `taskfiles/deploy.yml`: validation and deployment gates.
- `package.json`, `package-lock.json`, `Dockerfile`, `.github/workflows/build-push.yml`: dependency and build-time embed configuration.
- `.env.example`: document the required production embed parent origin.
- `src/components/embed-frame.tsx`, `src/app/layout.tsx`, `src/app/globals.css`: secure/transparent child embed behavior.
- `/Users/benebsworth/projects/benebsworth.com/app/lab/carbon/carbon-embed.tsx`, `/Users/benebsworth/projects/benebsworth.com/public/_headers`: host frame security and seamless styling.
- `public/graph-assets/manifest.json`, `public/graph-assets/*.png`, optional `*.svg`: only after BrandBrain asset approval and authenticated export.

Do not remove Mermaid fields, the scatter plot, or the table until the fallback tests and complete graph corpus are green.

---

## Chunk 1: Graph Data Foundation

### Task 1: Add protobuf graph types

**Files:**
- Create: `proto/carbon/v1/graph.proto`
- Create: `proto/carbon/v1/landscape.proto`
- Modify: `proto/carbon/v1/pathway.proto:1-29`
- Generate: `src/lib/gen/carbon/v1/graph_pb.ts`, `src/lib/gen/carbon/v1/landscape_pb.ts`, `src/lib/gen/carbon/v1/pathway_pb.ts`
- Test: `proto/buf.yaml` or existing Buf lint configuration only if imports require it
- Test: `src/lib/seed/graph.test.ts`

- [ ] **Step 1: Write schema tests/fixtures first**
  Create `src/lib/seed/graph.test.ts` and add representative proto-JSON fixtures in the existing seed test location covering an acyclic process graph, a recycle graph, an operational self-transition, a namespaced landscape graph, and an initially hidden material node. The tests may initially fail because the schemas and validators do not exist.

- [ ] **Step 2: Run the focused fixture test**
  Run: `./node_modules/.bin/vitest run src/lib/seed/graph.test.ts`
  Expected: FAIL because graph schemas and validators do not exist.

- [ ] **Step 3: Add `graph.proto`**
  Define `GraphNodeKind`, `GraphStage`, `GraphEdgeKind`, `GraphCyclePolicy`, `GraphEntityType`, `GraphNode`, `GraphEdge`, and `ProcessGraph` exactly as specified. Require `initially_hidden` only as a presentation hint for landscape context nodes.

- [ ] **Step 4: Add `landscape.proto`**
  Define `LandscapeGraph` using the shared graph types. Keep landscape edge IDs in the `edge:` namespace.

- [ ] **Step 5: Extend `pathway.proto`**
  Import `graph.proto` and add `process_graph = 15` and `operational_graph = 16`. Do not reserve or reuse fields 13 and 14.

- [ ] **Step 6: Generate and lint protobuf output**
  Run: `task quality:gen`
  Expected: Buf lint and generation pass; generated files change only under `src/lib/gen`.

- [ ] **Step 7: Verify generated types**
  Run: `npm run typecheck`
  Expected: PASS.

### Task 2: Implement strict graph validation

**Files:**
- Create: `src/lib/seed/graph.ts`
- Modify: `src/lib/seed/loader.ts:20-133`
- Modify: `src/lib/seed/check.ts:1-16`
- Test: `src/lib/seed/graph.test.ts`
- Test: `src/lib/seed/loader.test.ts`

- [ ] **Step 1: Add failing validation tests**
  Cover empty/duplicate IDs, node/edge ID collisions, required `node:`/`edge:` prefixes, landscape `pathway:`/`setting:`/`material:` namespace consistency, missing edge endpoints, closed enum validation, entity lookup rules, invalid metric keys, node material/source references, edge source references, `initially_hidden` on anything except landscape material context nodes, wrong edge-kind/graph combinations, `SELF_TRANSITION` endpoint mismatch, disallowed cycles, valid flow-plus-feedback cycles, mandatory non-unspecified `cycle_policy`, and exactly one landscape pathway node per loaded pathway.

- [ ] **Step 2: Run the failing tests**
  Run: `./node_modules/.bin/vitest run src/lib/seed/graph.test.ts src/lib/seed/loader.test.ts`
  Expected: FAIL with missing graph validation behavior.

- [ ] **Step 3: Implement graph-document validation**
  Parse graph subdocuments before full pathway proto conversion so errors identify the source file, graph name, node/edge ID, and rule. New invalid graph data must fail `data:check` and boot rather than silently becoming a partial row.

- [ ] **Step 4: Implement cycle rules**
  Validate `FLOW`/`FEEDBACK`/`SELF_TRANSITION` in process graphs, `MESSAGE` only in operational graphs, and `RELATION` only in landscape graphs. For `ACYCLIC`, reject feedback/self edges and cycles among flow edges. For `RECYCLE_ALLOWED`, remove feedback/self edges and require the remaining flow graph to be acyclic; require self-transition endpoints to match.

- [ ] **Step 5: Implement entity and metric validation**
  Validate `PATHWAY`, `MATERIAL`, and `CITATION` against seed IDs; validate `SETTING` against the generated `Setting` enum using the enum name as `entity_id`; allow unspecified entity type only with an empty entity ID. Validate pathway node metrics against `trl` or the containing pathway's metrics.

- [ ] **Step 6: Extend seed loading**
  Pre-scan all citation/material/pathway IDs before graph validation, then parse graph documents in a second pass so cross-document entity errors remain precise. Add a `requireCompleteGraphs` loader option defaulting to false for migration/boot. Load `data/landscape.yaml` when present, validate it against all loaded seed IDs, and include it in the seed payload. During migration, an absent landscape file is valid, sends `landscapeGraph: undefined`, clears the persisted singleton, and reports a zero graph count. `src/lib/seed/check.ts` passes `requireCompleteGraphs: true` by default; add an explicit `--allow-partial-graphs` authoring flag for intermediate batches. The final strict gate requires the file plus all 24 process and 24 operational graphs.

- [ ] **Step 7: Run focused validation**
  Run: `./node_modules/.bin/tsx src/lib/seed/check.ts data --allow-partial-graphs`
  Expected: PASS while the graph corpus is incomplete; precise failures for intentionally broken fixtures.

### Task 3: Persist the landscape graph in both stores

**Files:**
- Modify: `src/lib/db/store.ts:33-82`
- Modify: `src/lib/db/sqlite-store.ts:15-53`
- Modify: `src/lib/db/turso-store.ts:15-64`
- Modify: `src/lib/db/repos.ts`
- Modify: `src/lib/db/repos.test.ts`
- Modify: `src/lib/db/store.conformance.test.ts`
- Modify: every test fixture that constructs `SeedPayload` or calls `replaceSeed`
- Test: `src/lib/db/store.conformance.test.ts`

- [ ] **Step 1: Add failing conformance coverage**
  Assert replace-seed writes the landscape graph atomically, `getLandscapeGraph()` returns the same protobuf content, and a failed graph replacement leaves the prior seed state unchanged for both SQLite and Turso test paths.

- [ ] **Step 2: Extend store contracts**
  Add `landscapeGraph` to `SeedPayload`, a graph count to `SeedCounts`, and `getLandscapeGraph(): Promise<LandscapeGraph | undefined>` to `CarbonStore`. Update every existing `SeedPayload` fixture in `src/lib/db/repos.test.ts` and related tests.

- [ ] **Step 3: Add singleton persistence**
  Add identical `landscape_graph` DDL to both adapters and write it inside the existing seed replacement transaction. Decode via generated `LandscapeGraphSchema`; expose the read through `src/lib/db/repos.ts`, matching the repository boundary used by page loaders.

- [ ] **Step 4: Update loader/check output and tests**
  Run: `./node_modules/.bin/vitest run src/lib/db/store.conformance.test.ts src/lib/seed/loader.test.ts`
  Expected: PASS for SQLite; Turso leg remains conditional on configured test credentials.

- [ ] **Step 5: Test rollback deterministically**
  Add a common test-only post-transaction-start failure hook to both SQLite and Turso adapters; do not rely on an invalid typed graph insert. Assert all previous citations, materials, pathways, and landscape graph rows remain unchanged. Add a missing-landscape-file replacement test proving the prior singleton is cleared atomically. Run the Turso conformance leg only when `CARBON_TEST_TURSO_URL` and `CARBON_TEST_TURSO_TOKEN` are explicitly configured; otherwise record it as skipped.

- [ ] **Step 6: Run the partial data gate during foundation work**
  Run: `./node_modules/.bin/tsx src/lib/seed/check.ts data --allow-partial-graphs`
  Expected: `OK` output includes citations, materials, pathways, and the current landscape graph count while the corpus is being authored. The exact `24/24/1` counts apply only after the final authoring batch, when `task data:check` is run in strict mode.

---

## Chunk 2: Shared Interactive Surface

### Task 4: Add React Flow and pure adapters

**Files:**
- Modify: `package.json`, `package-lock.json`
- Create: `src/lib/landscape/graph.ts`
- Create: `src/lib/landscape/graph.test.ts`
- Create: `src/lib/graph/process.ts`
- Create: `src/lib/graph/process.test.ts`
- Create: `src/components/graph/graph-types.ts`

- [ ] **Step 1: Add adapter tests**
  Test numeric placement against `makeScales`, y inversion, log-X positive-only placement, unmapped rail placement, deterministic overlap offsets, hidden context nodes, endpoint completeness, and process DTO omission from the landscape payload.

- [ ] **Step 2: Run tests to verify failure**
  Run: `./node_modules/.bin/vitest run src/lib/landscape/graph.test.ts`
  Expected: FAIL because the adapter does not exist.

- [ ] **Step 3: Install the tested package**
  Add the pinned `@xyflow/react@12.11.5` version compatible with React 19. Run `npm install` under Node `22.20.0` and inspect the lockfile diff.

- [ ] **Step 4: Implement serializable graph DTOs**
  Define the minimal React Flow-compatible node/edge DTOs. Landscape output includes every filtered pathway/context node, `initially_hidden`, explicit position or unmapped-rail placement, and only edges with present endpoints. Guard empty/all-unmapped input before calling `makeScales` so no `NaN` positions are emitted. Process output includes a resolved inspector DTO containing metric values/ranges, material summaries, source summaries, and asset mappings without client fetches.

- [ ] **Step 5: Implement adapters**
  Reuse `makeScales` semantics. Route missing values and non-positive log-X values to the unmapped rail; do not call the log scale with non-positive values. Keep the numeric landscape layout deterministic across renders.

- [ ] **Step 6: Run focused adapter tests**
  Run: `./node_modules/.bin/vitest run src/lib/landscape/graph.test.ts`
  Expected: PASS.

- [ ] **Step 7: Implement and test the process adapter**
  Create `src/lib/graph/process.ts` to map one protobuf `ProcessGraph` view into stable React Flow DTOs with stage/order placement, asset IDs, and resolved inspector summaries. Add unit tests for stable IDs, stage ordering, flow/feedback/message/self-transition edges, and no client fetch requirements.

- [ ] **Step 8: Run both adapter suites**
  Run: `./node_modules/.bin/vitest run src/lib/landscape/graph.test.ts src/lib/graph/process.test.ts`
  Expected: PASS.

### Task 5: Build shared graph components

**Files:**
- Create: `src/components/graph/graph-loader.tsx`
- Create: `src/components/graph/graph-canvas.tsx`
- Create: `src/components/graph/graph-node.tsx`
- Create: `src/components/graph/graph-edge.tsx`
- Create: `src/components/graph/graph-inspector.tsx`
- Create: `src/components/graph/graph-asset.tsx`
- Create: `src/components/graph/graph-error-boundary.tsx`
- Create: `src/components/graph/graph-semantic-list.tsx`
- Create: `src/lib/graph/view-selection.ts`
- Test: `src/lib/graph/view-selection.test.ts`
- Test: Playwright graph interaction specs; do not add Vitest DOM component tests unless jsdom/testing-library is separately introduced and configured
- Modify: `src/app/globals.css` only for React Flow styles and graph tokens

- [ ] **Step 1: Write component behavior tests**
  Cover one selected/expanded node, `aria-expanded` and `aria-controls`, `See more`, roving tab index, Escape focus restoration, arrow navigation, keyboard zoom/pan, fit-to-width, hidden context reveal, edge emphasis, reduced motion, and semantic-list equivalence in Playwright. Test the pure per-view fallback selector in `src/lib/graph/view-selection.test.ts`; it must cover client failure and missing graph/Mermaid states without requiring a DOM runner.

- [ ] **Step 2: Implement the client-only boundary**
  Keep every `@xyflow/react` import below `'use client'`. Make `graph-loader.tsx` the `'use client'` owner of `next/dynamic(..., { ssr: false })`; never pass `ssr: false` from the Server Component pages. Import `@xyflow/react/dist/style.css` from the client graph boundary or approved global stylesheet and verify the Next.js 16 production build with the graph route.

- [ ] **Step 3: Implement graph state separation**
  Keep selection, expansion, comparison IDs, and viewport state separate. Use one selected/expanded node. Clear transient selection when filtering removes the node without changing URL-backed filters or comparison IDs.

- [ ] **Step 4: Implement accessible nodes and inspector**
  Render focusable buttons/links with stable names, `aria-expanded`, and `aria-controls`. Configure React Flow with `nodesFocusable: false`, `edgesFocusable: false`, and `disableKeyboardA11y: true` where supported so nested custom controls own focus. Use deterministic stage/order or numeric-position roving navigation. Give Enter/Space to node activation, arrows to graph navigation, `+`/`-`/`0` to viewport controls, and Escape to close/restore focus. Move focus to the inspector heading on expansion and announce selection changes politely.

- [ ] **Step 5: Implement assets and fallbacks**
  Resolve semantic asset IDs locally. If the asset is missing, render a deterministic CSS/SVG glyph with the same accessible label. Never make node interaction depend on image load.

- [ ] **Step 6: Implement motion and responsive behavior**
  Animate only active edges, disable animations for reduced motion, keep touch targets at least 44 CSS pixels, and use a bottom-sheet/full-width expansion region on mobile. Track `hasInteracted`; ResizeObserver refits only before first interaction, then preserves the manual viewport.

- [ ] **Step 7: Run component/lint checks**
  Run: `npm run typecheck && npm run lint`
  Expected: PASS.

---

## Chunk 3: Detail and Landscape Migration

### Task 6: Migrate pathway detail graphs

**Files:**
- Modify: `src/components/pathway/pathway-diagrams.tsx`
- Modify: `src/app/pathways/[id]/page.tsx`
- Create: `tests/e2e/pathway-graph.spec.ts`
- Modify: `tests/e2e/smoke.spec.ts`

- [x] **Step 1: Add failing E2E coverage**
  Assert graph-only detail rendering, both system-flow and operational-sequence tabs, inline expansion without routing, `See more` anchors, active edge emphasis, keyboard operation, and mobile expansion.

- [x] **Step 2: Implement detail DTO preparation**
  Load graph node references and all inspector material/source/metric summaries on the server. Parallelize independent citation/material/reference work with `Promise.all` and avoid per-node client fetches.

- [x] **Step 3: Integrate independent view fallback**
  Make graph and Mermaid props optional. Mount the diagram region when either graph or Mermaid exists. Select React Flow, Mermaid, or existing content fallback independently for each view according to the spec matrix.

- [x] **Step 4: Add stable deep-dive anchors**
  Add stable `id` anchors for mechanism, metrics, materials, and literature. Encode the landscape query in `back` when `See more` routes from the overview.

- [x] **Step 5: Test the full migration fallback matrix**
  Add pure fixtures for missing process graph, missing operational graph, both graphs missing, independent client render failure, and missing Mermaid sources. Assert per-view `React Flow -> Mermaid -> existing content` fallback and that one failed view does not take down the page. Do not depend on mutating the production seed database from E2E; the fallback matrix is tested at the pure view-selection boundary, while E2E covers a complete seeded graph surface.

- [x] **Step 6: Mount the semantic alternative**
  Render `GraphSemanticList` alongside or behind the accessible graph toggle on the detail page. It must expose the same node labels, stage order, relationships, metric values, material/source references, and evidence as the canvas. Test equivalence against the process adapter DTO.

- [x] **Step 7: Run detail E2E**
  Run: `./node_modules/.bin/playwright test tests/e2e/pathway-graph.spec.ts`
  Expected: PASS.

### Task 7: Migrate the landscape overview

**Files:**
- Modify: `src/app/page.tsx`
- Create: `src/components/landscape/landscape-graph.tsx`
- Modify: `src/components/landscape/pathway-list.tsx` only if graph comparison wiring needs a shared callback
- Retain: `src/components/landscape/scatter-plot.tsx`
- Create/modify: `tests/e2e/landscape-graph.spec.ts`
- Modify: `tests/e2e/smoke.spec.ts`

- [ ] **Step 1: Add failing overview E2E coverage**
  Assert filtered pathway nodes, axis changes, log mode, benchmark/settings/TRL filters, selection inspector, relationship highlighting, comparison IDs, unmapped rail, table fallback, and direct `See more` navigation.

- [ ] **Step 2: Load landscape graph data**
  Fetch the persisted `LandscapeGraph` and resolve mechanism summaries, metric ranges, material summaries, citation/source summaries, and connected-concept labels for filtered pathway nodes in one server-side DTO preparation step. Pass those summaries to the landscape adapter; do not serialize full process graphs into the overview payload. Filter only pathway nodes and relationship edges; retain every setting/material context node in the DTO so hidden endpoints remain resolvable.

- [ ] **Step 3: Implement graph-first fallback**
  Render the interactive landscape graph when valid graph data is present, always retaining `PathwayList` below it. If graph data is unavailable or the client graph fails, render the current `ScatterPlot` and `PathwayList`; there is no Mermaid overview fallback.

- [ ] **Step 4: Preserve existing URL behavior**
  Keep canonical query construction, axis selectors, log-X, filters, and `ids`. Graph selection must not mutate comparison selection.

- [ ] **Step 5: Migrate old assertions**
  Update `tests/e2e/smoke.spec.ts`: replace the 18-dot and Mermaid-primary assertions with graph/unmapped-rail assertions, while retaining explicit scatter fallback coverage. Missing-`LandscapeGraph` and client-failure selection are covered by the pure view-selector tests in Task 6, not by an impossible production-database mutation during E2E.

- [ ] **Step 6: Run overview E2E**
  Run: `./node_modules/.bin/playwright test tests/e2e/landscape-graph.spec.ts`
  Expected: PASS.

### Task 8: Author and validate all graph YAML before migrations

**Files:**
- Modify: all 24 files under `data/pathways/*.yaml`
- Create: `data/landscape.yaml`
- Modify: `scripts/check-mermaid.mjs` to fail if any of the expected 24 flow or 24 sequence sources is missing
- Modify: `taskfiles/data.yml` and `taskfiles/quality.yml`

- [ ] **Step 1: Add graph documents incrementally**
  Execute this phase before Task 6. Convert every one of the 24 Mermaid system flows and 24 operational sequences into explicit typed nodes/edges. During intermediate batches, validate with the partial flag; after the final batch require exactly one `process_graph` and one `operational_graph` for every loaded pathway ID. Operational non-self messages become `GRAPH_EDGE_KIND_MESSAGE`; self messages become `GRAPH_EDGE_KIND_SELF_TRANSITION`; ordinary process arrows become `GRAPH_EDGE_KIND_FLOW`; recycle-closing arrows become `GRAPH_EDGE_KIND_FEEDBACK` under `GRAPH_CYCLE_POLICY_RECYCLE_ALLOWED`. Preserve dotted support/conditional/co-benefit edges with explicit labels/kinds, Mermaid implicit nodes such as `WASTE` and `SEQ`, and `Note` content in node summaries or edge labels. Do not silently drop a Mermaid statement.

- [ ] **Step 2: Add landscape relationships**
  Execute this phase before Task 7. Add exactly one landscape pathway node per loaded pathway plus namespaced setting/material context nodes and `edge:` relationship IDs. Mark material context nodes with `initially_hidden: true`; ensure namespace prefixes match entity types.

- [ ] **Step 3: Run seed validation after each batch**
  Run: `./node_modules/.bin/tsx src/lib/seed/check.ts data --allow-partial-graphs`
  Expected: the current partial batch passes with no dangling references/cycle violations; strict `24/24/1` counts are checked only in Step 6.

- [ ] **Step 4: Keep Mermaid validation active**
  Update the checker to enumerate all 24 pathways and require both Mermaid fields before rendering. Run: `task quality:mermaid`. Expected: exactly `48/48` sources remain valid during migration; missing fields fail instead of being skipped.

- [ ] **Step 5: Wire the verification gate**
  Extend existing `task data:check`; add it to `taskfiles/quality.yml`'s `verify` task rather than creating a duplicate task.

- [ ] **Step 6: Enable strict corpus validation**
  After all 24 pathway files and `data/landscape.yaml` exist, run `task data:check` without `--allow-partial-graphs`. Require exactly 24 process graphs, 24 operational graphs, and 1 landscape graph before enabling the graph-first migration E2E gate.

Execution ordering: complete Task 8 Step 1 before Task 6, then complete Task 8 Step 2 before Task 7. The YAML authoring task is listed here so its corpus rules are centralized, but migrations must not begin against an incomplete graph corpus.

---

## Chunk 4: Generated Assets and Embed Contract

### Task 9: Generate and install semantic assets

**Files:**
- Create after approved export: `public/graph-assets/manifest.json`
- Create after approved export: `public/graph-assets/*.png`
- Create optional after QA: `public/graph-assets/*.svg`
- Create: `public/graph-assets/README.md` or metadata schema documentation if needed
- Modify: graph asset mapping code/tests

- [ ] **Step 1: Authenticate and preflight the BrandBrain flow**
  Call `whoami_brandbrain`, using `login_brandbrain` if required. Discover the advertised MCP tools and require `update_asset_set_plan`, `approve_asset_set_plan`, and `get_asset_set_plan_history`. Call `get_flow_processor_health` before any session mutation and require enabled/available local execution, zero provider token cost, pinned processor revisions, split/trim-normalize/vectorize/local-review capability, and deterministic matte/alpha support. These capabilities permit planning, validation, and mock execution even when `background_removal.production_ready` is false; production readiness is a separate hard gate immediately before a paid call. Stop before session creation if authentication, lifecycle tools, or deterministic mock capabilities are absent.

- [ ] **Step 2: Select the canonical flow and prepare the manifest**
  Call `list_asset_flow_templates`, pass its returned canonical `icon-set` template ID to `create_asset_flow`, call `get_asset_flow`, and capture the persisted plan-node ID/revisions. Never invent a template/session ID. The manifest contains these exact 11 roles: source, capture, sorbent/material, membrane, electrochemical unit, heat/regeneration, separation, compression/transport, storage/mineralization, biological/ocean system, and waste/byproduct. Require `requested_formats: ["png", "svg"]`, each item `required: true`, `required_formats: ["png"]`, and `desired_formats: ["png", "svg"]`, stable item IDs and safe filename stems, distinct `grid_index`, complete `background_policy`/`matte_color`/layout/consistency/retry/spend fields, `max_total_generation_usd: 1.00`, `max_retry_items: 0`, `max_attempts_per_item: 1`, `auto_retry_enabled: false`, `max_semantic_review_usd: 0`, `max_semantic_review_tokens: "0"`, and zero retry spend. Inspect the persisted review node for `process.review.semantic_enabled === false`; do not invent `semantic_enabled` as a manifest field. Omitted proto3 false/zero fields are treated as defaults. Use abstract line-art prompts, not embedded labels or claims.

- [ ] **Step 3: Persist and approve the exact manifest**
  Refetch `get_asset_flow` immediately before mutation and approval. Update the complete plan with expected revisions, present the returned revision/hash and item list, wait for explicit approval of that exact draft, call `approve_asset_set_plan` with the returned hash/revisions, and verify approval history. On a conflict, refetch and present the new draft; do not guess revisions, forge authority fields, or use raw REST.

- [ ] **Step 4: Run mock and inspect**
  Call `validate_asset_flow`, then use `run_asset_flow` and its returned task handle with the MCP task-polling contract, or use `start_asset_flow_run` followed by `get_asset_flow_task`; do not use `get_asset_flow_task` for a run that did not create that task type. Verify the persisted result with `get_asset_flow_run`. Inspect outputs, QA, trace, and zero-token local stages. Do not request paid confirmation if mock or readiness fails.

- [ ] **Step 5: Confirm and run one paid call only if needed**
  Refetch `get_asset_flow` immediately before the call and compare the complete approved manifest revision, content hash, and item payload with the user-approved draft; if any differ, stop and obtain approval again. Confirm exactly one reachable provider node. Require `BRANDBRAIN_MAX_PROVIDER_SPEND_USD_MICROS` to be present and at least the estimated cost while remaining no greater than the `$1.00` manifest ceiling. Present provider/model, set scope, quality, a newly generated idempotency key, both ceilings, and estimated cost. Re-check `production_ready=true` immediately before dispatch, wait for immediate user confirmation for that exact call, run atomically exactly once, and do not auto-retry or regenerate.

- [ ] **Step 6: Export authenticated outputs**
  After a live `run_asset_flow`, poll its returned task handle; after a live `start_asset_flow_run`, poll `get_asset_flow_task`. Verify the exact persisted run with `get_asset_flow_run`; call `get_flow_trace` and inspect local-node ledger evidence for zero provider tokens/cost. Then use the exact `sessionId` and `runId` with `get_flow_outputs` (attempt is retained as provenance, not passed to that API). Accept only the latest eligible persisted `raw_sheet` lineage and retain session/plan/run/attempt IDs, approved manifest revision/hash, item status/QA, and every credential-free artifact URL internally. Call `open_flow_gallery`, require an opened result, and inspect one `open_in_browser` asset detail; if browser control is unavailable, record that fact. Retrieve every required PNG and accepted SVG through authenticated BrandBrain artifact access, validate content type, transparency/alpha, decodability, provenance, sanitizer/complexity/raster-fidelity QA, and output lineage. Reject signed URLs, embedded tokens, or provider credentials. An optional SVG failure retains the valid PNG. Do not use auth-bound URLs at Carbon runtime.

- [ ] **Step 7: Install and test local mappings**
  Copy only validated files into `public/graph-assets/`. Write `manifest.json` with approved manifest revision/hash, session/plan/run/attempt IDs, item statuses/QA, and semantic ID to local relative path mappings. Enforce safe slug stems and reject absolute paths, `..`, `/`, `\\`, unexpected extensions, and symlink escapes; resolve every destination beneath `public/graph-assets/`. Test missing-asset fallbacks. Do not claim generated assets exist until persisted output evidence and local file checks pass.

### Task 10: Make the host embed seamless and secure

**Files:**
- Modify: `src/components/embed-frame.tsx`
- Modify: `src/app/layout.tsx`, `src/app/globals.css`
- Modify: `next.config.ts`
- Modify: `Dockerfile`
- Modify: `taskfiles/deploy.yml`
- Modify: `.github/workflows/build-push.yml`
- Modify: `/Users/benebsworth/projects/benebsworth.com/app/lab/carbon/carbon-embed.tsx`
- Modify: `/Users/benebsworth/projects/benebsworth.com/public/_headers`
- Create: `/Users/benebsworth/projects/benebsworth.com/e2e/carbon-embed.spec.ts`
- Create/modify: child E2E coverage

- [ ] **Step 1: Add failing message-security tests**
  Cover wrong origin, wrong source window, malformed payloads, non-finite/fractional heights, rejected heights 199 and 20,001, and accepted boundary heights 200 and 20,000. Normalize the configured parent URL to its exact `.origin` before comparing.

- [ ] **Step 2: Fail closed in the child**
  Require `NEXT_PUBLIC_EMBED_PARENT_ORIGIN=https://benebsworth.com` in production and do not call `postMessage` with `'*'`. Keep localhost support only in development. Remove the current `src/app/layout.tsx:46` embed wrapper max-width and horizontal padding around the graph stage, while retaining intentional embed navigation chrome and transparent `html`/`body` backgrounds.

- [ ] **Step 3: Harden the host listener**
  Normalize `NEXT_PUBLIC_CARBON_URL` with `new URL(value).origin` for both iframe construction and message comparison. Require exact origin, exact iframe `contentWindow`, finite integer height, and inclusive 200..20,000 bounds. Keep the iframe `display: block`, `width: 100%`, and `border: 0`.

- [ ] **Step 4: Remove child visual seams**
  Apply transparent embed body background and remove max-width/padding constraints around the graph stage. Preserve only intentional embed navigation chrome.

- [ ] **Step 5: Narrow CSP**
  In Carbon `next.config.ts`, allow only `https://benebsworth.com` in production frame ancestors and localhost only in development. In host `public/_headers`, keep exact `frame-src https://carbon.benebsworth.com` and no wildcard Carbon subdomains. Test the emitted Carbon response headers and generated host static `_headers`, not only source configuration.

- [ ] **Step 6: Inject build-time configuration**
  Add a Docker builder `ARG`/`ENV` before `next build`, fail the production build when it is absent or invalid, and pass `https://benebsworth.com` from `task deploy:image` and the GitHub Actions Docker build args. Update `.env.example` to mark the production value required. Document the value in the chart/deployment contract; Kubernetes runtime env alone is insufficient for `NEXT_PUBLIC_*`. Verify failure with `NEXT_PUBLIC_EMBED_PARENT_ORIGIN= npm run build` and an invalid-origin build, and verify success with the exact HTTPS origin.

- [ ] **Step 7: Run host/child checks**
  For local host E2E, start Carbon dev on `:3000` with `NEXT_PUBLIC_EMBED_PARENT_ORIGIN=http://localhost:4321`, verify its listener PID, rebuild the static host with `NEXT_PUBLIC_CARBON_URL=http://localhost:3000 pnpm build`, serve the resulting `out/` on `:4321`, and verify that listener PID before testing. In `/Users/benebsworth/projects/benebsworth.com`, run `pnpm exec playwright test e2e/carbon-embed.spec.ts` against that verified host server. Normalize both configured URLs to exact origins in the test setup. Expected: no visible iframe border, opaque child background, or nested scrollbars; invalid message origin/source/height payloads are ignored. Separately run the production HTTPS header/build checks.

---

## Chunk 5: Full Verification and Rollout

### Task 11: Update verification and deployment gates

**Files:**
- Modify: `taskfiles/quality.yml`
- Modify: `taskfiles/data.yml`
- Modify: `taskfiles/deploy.yml`
- Modify: `.github/workflows/build-push.yml`
- Modify: `Dockerfile`
- Modify: `deploy/kubernetes/chart/values.yaml`, `deploy/kubernetes/chart/templates/deployment.yaml`, and `deploy/kubernetes/application.yaml` for the documented build-time origin contract

- [ ] **Step 1: Wire local gates**
  Ensure `task verify` runs typecheck, lint, unit tests, `task data:check`, and Mermaid validation. Ensure `task deploy:image` runs `task data:check` before Docker build. Update `taskfiles/deploy.yml` to target the canonical Paprika deployment `carbon-release-carbon-stable` (with a preflight that fails if it is absent) and make `task deploy:health` fail on non-200/non-healthy JSON instead of truncating a silent curl response.

- [ ] **Step 2: Wire CI prerequisites**
  In GitHub Actions, install Node from `.nvmrc`, run `npm ci`, use the direct `./node_modules/.bin/tsx src/lib/seed/check.ts data` path as the normative data gate unless a Task version is explicitly pinned, then build/push with the embed-origin build arg.

- [ ] **Step 3: Run the full local gate**
  Run: `task verify`
  Expected: PASS, including graph validation and Mermaid validation.

- [ ] **Step 4: Run build and E2E**
  Run: `NEXT_PUBLIC_EMBED_PARENT_ORIGIN=https://benebsworth.com npm run build`
  Expected: production build passes with the origin present and fails when the production origin is omitted/invalid. Then run `npm run e2e` against the configured dev server, and separately start the built app with `NEXT_PUBLIC_EMBED_PARENT_ORIGIN=https://benebsworth.com npm run start` and run the embed/header smoke checks against that production server. Host checks run from `/Users/benebsworth/projects/benebsworth.com` using its existing test/build command and inspect `/lab/carbon/` plus `public/_headers`.

- [ ] **Step 5: Verify payload/performance budgets**
  Confirm landscape DTO is under 200 KB gzip excluding images, stays within 64 pathway + 20 context nodes and 160 edges, and detail views stay within 80 nodes + 160 edges. Use a repeatable gzip-size script or recorded build artifact, inspect the production bundle for client-only React Flow loading, and verify the container resource limit remains 512 MiB.

### Task 12: Deploy and verify incrementally

**Files:**
- No new files; deployment uses the existing Carbon VKE workflow.

- [ ] **Step 1: Inspect the final diff**
  Run: `git status --short && git diff --check && git diff --stat`
  Expected: only intended graph, asset, embed, test, generated, and deployment files are changed. Do not revert unrelated work.

- [ ] **Step 2: Build/push after data gate**
  The standard path is the GitHub Actions build that pushes `ghcr.io/castlemilk/carbon:latest`; wait for that workflow to succeed before restarting VKE. The local `task deploy:image` path pushes `:local` and a TTL image only, so it must not be followed by `task deploy:restart` unless the Paprika chart image tag is explicitly overridden to that exact image and then restored.

- [ ] **Step 3: Roll out through Paprika/VKE**
  Before restart, preflight that the canonical Paprika service is `carbon-release-carbon` and deployment is `carbon-release-carbon-stable` (derived from the current Application release name). Reconcile `taskfiles/deploy.yml` if it still targets `carbon-carbon-stable`. Use the existing `task deploy:restart` path only after the expected image tag is available. Do not change cluster state outside the documented Carbon deployment workflow.

- [ ] **Step 4: Verify rollout and public behavior**
  Run: `task deploy:status` followed by a fail-closed health check using `curl --fail --show-error --silent https://carbon.benebsworth.com/api/health` and JSON validation that `status == "ok"` and `components.database.status == "healthy"`.
  Expected: the `carbon-release-carbon-stable` rollout is ready and the public health response is HTTP 200 with healthy database JSON.

- [ ] **Step 5: Verify both surfaces publicly**
  Check the landscape graph, filtered/unmapped pathways, detail graph tabs, inline inspector, `See more`, mobile behavior, theme, fallback state, and `https://benebsworth.com/lab/carbon/` embed presentation.

Do not create commits during execution unless the user explicitly requests them. At each task boundary, inspect the diff and leave unrelated worktree changes untouched.
