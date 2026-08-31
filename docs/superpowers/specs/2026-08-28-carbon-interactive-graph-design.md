# Carbon Interactive Graph Design

**Date:** 2026-08-28
**Status:** Approved for implementation planning
**Scope:** Replace the current Mermaid-first landscape and pathway diagrams with explicit, interactive React graph views, while retaining a safe migration fallback and adding a coordinated generated visual asset set.

## Summary

Carbon will expose the pathway landscape and individual pathway processes as explorable graph surfaces. The landscape will preserve the current quantitative comparison and URL-backed filters while making each pathway an interactive node. Pathway detail pages will expose a stage-based process graph with inline node expansion and deeper `See more` drilldowns.

The graph data will be explicit protobuf/YAML data, not derived from Mermaid source. React Flow will provide viewport, connection, and interaction primitives. Custom React nodes and edges will carry the Carbon visual language and scientific content. Generated imagery will support node identity but will never be required for comprehension.

The initial rollout stays inside the Carbon application. The existing cross-origin host embed remains a boundary, but will be visually seamless: borderless, transparent, full-width, and height-synchronized. A future same-origin port is not part of this change.

## Approved Decisions

| Decision | Choice |
| --- | --- |
| Surfaces | Redesign both the landscape overview and pathway detail pages |
| Primary renderer | React Flow with custom React nodes and SVG edges |
| Data source | Explicit protobuf messages authored through YAML seed data |
| Mermaid | Migration fallback and validation artifact until graph coverage is complete |
| Node behavior | Click expands an inline inspector; `See more` opens deeper existing content |
| Landscape behavior | Preserve quantitative axes, filters, comparison URLs, and table fallback |
| Detail behavior | Stage-based process graph with active-flow highlighting and evidence links |
| Generated imagery | Coordinated abstract scientific line-art asset set with transparent PNG masters and optional SVG derivatives |
| Image generation | BrandBrain Flow Orchestrator asset-set workflow |
| WebGL | Not required for the first pass; possible later decorative enhancement only |
| Host integration | Keep iframe boundary initially, remove visible iframe treatment |

## Goals

1. Make the 24 pathways and their process stages explorable rather than static.
2. Let users understand a node without leaving the current graph.
3. Provide a clear path from overview comparison to mechanism, materials, metrics, and literature.
4. Preserve current evidence, URL filters, shortlist/comparison behavior, and accessible table content.
5. Use generated imagery to create visual identity without encoding scientific meaning in an image.
6. Make the graph resilient to missing assets, malformed data, small screens, reduced motion, and future content changes.
7. Keep the migration reversible and preserve a usable Mermaid fallback.

## Non-goals

- Replacing the Carbon backend or introducing graph-specific runtime APIs.
- Making generated imagery the authoritative representation of a process or material.
- Adding a Three.js/WebGL dependency in the initial implementation.
- Rebuilding the host site as a same-origin Carbon application.
- Removing the accessible pathway table or source/reference views.
- Generating a unique decorative illustration for every pathway when a shared semantic asset is sufficient.

## Information Model

Add graph messages to the protobuf model and regenerate committed TypeScript output. The exact field names should follow the repository's existing snake_case proto conventions. Existing Mermaid fields 13 and 14 remain active during migration and are not reused. They may be reserved only after Mermaid removal.

### Process graph

Each pathway may contain a `process_graph` and an `operational_graph`, both using `ProcessGraph`. This preserves the current system-flow and operational-sequence distinction while giving both views the same React interaction model.

The concrete proto shape is:

```proto
enum GraphNodeKind {
  GRAPH_NODE_KIND_UNSPECIFIED = 0;
  GRAPH_NODE_KIND_INPUT = 1;
  GRAPH_NODE_KIND_CAPTURE = 2;
  GRAPH_NODE_KIND_MATERIAL = 3;
  GRAPH_NODE_KIND_MEMBRANE = 4;
  GRAPH_NODE_KIND_CONVERSION = 5;
  GRAPH_NODE_KIND_ELECTROCHEMICAL = 6;
  GRAPH_NODE_KIND_REGENERATION = 7;
  GRAPH_NODE_KIND_SEPARATION = 8;
  GRAPH_NODE_KIND_TRANSPORT = 9;
  GRAPH_NODE_KIND_STORAGE = 10;
  GRAPH_NODE_KIND_BIOLOGICAL = 11;
  GRAPH_NODE_KIND_WASTE = 12;
  GRAPH_NODE_KIND_SEQUENCE_PARTICIPANT = 13;
}

enum GraphStage {
  GRAPH_STAGE_UNSPECIFIED = 0;
  GRAPH_STAGE_INPUT = 1;
  GRAPH_STAGE_CAPTURE = 2;
  GRAPH_STAGE_CONVERSION = 3;
  GRAPH_STAGE_REGENERATION = 4;
  GRAPH_STAGE_SEPARATION = 5;
  GRAPH_STAGE_TRANSPORT = 6;
  GRAPH_STAGE_STORAGE = 7;
  GRAPH_STAGE_BYPRODUCT = 8;
}

enum GraphEdgeKind {
  GRAPH_EDGE_KIND_UNSPECIFIED = 0;
  GRAPH_EDGE_KIND_FLOW = 1;
  GRAPH_EDGE_KIND_FEEDBACK = 2;
  GRAPH_EDGE_KIND_MESSAGE = 3;
  GRAPH_EDGE_KIND_SELF_TRANSITION = 4;
  GRAPH_EDGE_KIND_RELATION = 5;
}

enum GraphCyclePolicy {
  GRAPH_CYCLE_POLICY_UNSPECIFIED = 0;
  GRAPH_CYCLE_POLICY_ACYCLIC = 1;
  GRAPH_CYCLE_POLICY_RECYCLE_ALLOWED = 2;
}

enum GraphEntityType {
  GRAPH_ENTITY_TYPE_UNSPECIFIED = 0;
  GRAPH_ENTITY_TYPE_PATHWAY = 1;
  GRAPH_ENTITY_TYPE_MATERIAL = 2;
  GRAPH_ENTITY_TYPE_CITATION = 3;
  GRAPH_ENTITY_TYPE_SETTING = 4;
}

message GraphNode {
  string id = 1;                       // graph-local stable ID
  string label = 2;
  GraphNodeKind kind = 3;
  GraphStage stage = 4;
  string summary = 5;                  // markdown-safe short summary
  GraphEntityType entity_type = 6;
  string entity_id = 7;
  repeated string material_ids = 8;
  repeated string source_refs = 9;
  repeated string metric_keys = 10;
  string asset_id = 11;                // semantic generated-asset ID
  int32 order = 12;
  bool initially_hidden = 13;          // landscape context nodes only
}

message GraphEdge {
  string id = 1;                       // graph-local stable ID
  string source_node_id = 2;
  string target_node_id = 3;
  GraphEdgeKind kind = 4;
  string label = 5;
  repeated string source_refs = 6;
}

message ProcessGraph {
  GraphCyclePolicy cycle_policy = 1;
  repeated GraphNode nodes = 2;
  repeated GraphEdge edges = 3;
}

message LandscapeGraph {
  repeated GraphNode nodes = 1;
  repeated GraphEdge edges = 2;
}
```

Add `process_graph` and `operational_graph` to `Pathway` at new field numbers 15 and 16. Add `LandscapeGraph` to a new `landscape.proto`; its node IDs use explicit namespaces such as `pathway:<id>`, `setting:<enum_name>`, and `material:<id>`, while landscape edge IDs use `edge:<stable-id>`. All process node IDs use a `node:` prefix and edge IDs use an `edge:` prefix. IDs must be globally unique within the graph document, including across node and edge collections. Process graph node and edge IDs are graph-local and cannot be referenced across graphs.

The seed/store ownership is explicit. `SeedPayload` gains an optional `landscape_graph`, `SeedCounts` gains a landscape graph count, and `CarbonStore` gains `getLandscapeGraph()`. Both SQLite and Turso add a singleton `landscape_graph` document table and write it inside the existing seed replacement transaction. During migration, a missing `data/landscape.yaml` is valid, produces a zero landscape count, clears any previously persisted singleton graph, and makes `getLandscapeGraph()` return undefined so the overview can use its scatter/table fallback. The final corpus gate requires the file. The loader reads and validates `data/landscape.yaml` when present before calling `replaceSeed`; this keeps the graph in the same database-backed source-of-truth path as pathways, materials, and citations. For a `SETTING` node, `entity_id` is the `Setting` enum name and validation checks it against the generated enum, not against a seed table. `PATHWAY`, `MATERIAL`, and `CITATION` entity IDs are raw seed IDs; their namespaced graph node IDs are separate.

Initial node kinds cover input/source, capture, sorbent/material, membrane, conversion, electrochemical, regeneration/heat, separation, transport/compression, storage/mineralization, biological/ocean system, sequence participant, and waste/byproduct. The list remains an enum so unsupported kinds fail seed validation rather than silently rendering as generic content. The electrochemical asset role maps directly to `ELECTROCHEMICAL`, not an ambiguous generic conversion node. `initially_hidden` is valid only for landscape material context nodes and is false for process nodes and pathway/setting nodes.

### Landscape graph

The shared `LandscapeGraph` seed document contains pathway nodes plus setting and material context nodes and explicit relationship edges. Pathway nodes are always present in the graph model. Setting nodes are visible as a small context rail. Material nodes and their edges remain serialized with the `initially_hidden` presentation flag until a pathway is selected; selection changes that flag in transient client state. They are never omitted from the React Flow node map, so every edge endpoint remains resolvable. `metric_keys` are required only on pathway nodes and must be valid for the referenced pathway. Quantitative x/y placement remains derived from the selected metric axes because those positions must respond to filters and axis changes. Explicit relationships control highlighting and exploration, not numeric plotting.

### YAML authoring

Process graph data will live with each pathway YAML file. Landscape relationships will live in a dedicated `data/landscape.yaml` document. Seed validation must reject empty or duplicate IDs, dangling edges, unknown node/entity kinds, invalid entity references, invalid stage values, duplicate edge IDs, invalid metric keys, and invalid process flow cycles where a graph declares a directed acyclic flow. `entity_type` is a closed enum; a non-unspecified type requires a non-empty matching `entity_id` and the entity must exist in the seed set. Node `metric_keys` must be `trl` or keys present in the containing pathway's metrics.

Mermaid fields remain during migration. They may be removed only after every graph has validated and visual regression coverage exists.

`cycle_policy` is mandatory for authored process graphs. `FLOW` edges are the ordinary process graph; `FEEDBACK` edges close a recycle loop and `SELF_TRANSITION` edges must have identical source and target IDs. `MESSAGE` is allowed only in `operational_graph`, and `RELATION` is allowed only in `LandscapeGraph`; neither participates in process-flow cycle detection. `ACYCLIC` rejects any `FEEDBACK`/`SELF_TRANSITION` edge and rejects cycles among `FLOW` edges. `RECYCLE_ALLOWED` requires the graph remaining after removing `FEEDBACK` and `SELF_TRANSITION` edges to be acyclic, allowing a cycle only when its closing edge is explicitly feedback/self-transition. Existing absorber/solvent loops and sequence self-messages therefore remain valid only with the explicit edge kinds and policy that describe them.

## User Experience

### Landscape overview

The current scatter plot becomes a full-width graph stage that retains metric axes, axis selectors, log mode, setting filters, TRL filtering, benchmark filtering, and URL-backed comparison IDs.

Each pathway node includes its name, setting, TRL, cost range, benchmark state, and a small semantic asset. On selection, connected settings, materials, and pathways are emphasized while unrelated nodes soften. The selected node expands an inline inspector with mechanism summary, key metrics, materials, evidence count, and connected concepts. `See more` opens the existing pathway route while preserving the current landscape query.

All filtered pathways remain discoverable even when an axis value is missing. A pathway missing the selected x or y value is placed in a clearly labeled `Unmapped on this view` rail without a numeric axis position, and remains available in the table. This replaces the current scatter-only exclusion for the graph view; valid points retain the existing scale, log-X handling, and screen-Y inversion.

The existing pathway table remains below the graph as a keyboard-friendly and screen-reader-friendly fallback. It continues to reflect the active graph filters, provide comparison selection and source badges, and provide direct pathway links. A separate table search control is not part of this change.

Selection, expansion, comparison selection, and viewport are independent state machines. Selection and expansion are local transient state and clear when their node is filtered out. Comparison IDs and filters remain URL-backed. Filter changes must not mutate comparison IDs or accidentally route from a selected node. `See more` targets stable anchors such as `#mechanism`, `#metrics`, `#materials`, and `#literature`, with the current landscape query encoded in the existing `back` parameter.

### Pathway detail

Replace the Mermaid tabs with a process graph organized into readable stages: input, capture, conversion, regeneration/separation, transport, storage, and byproducts. Custom nodes can show explanatory copy, metric chips, source badges, material references, and semantic imagery.

Clicking a node expands its content in place and highlights incoming and outgoing edges. `See more` opens a focused deep-dive section or existing detail anchor for the relevant mechanism, material, literature, or metric. On mobile, the expanded content becomes a bottom sheet or full-width detail region instead of a tiny floating node.

The existing two-view affordance remains: `process_graph` renders as `System flow` and `operational_graph` renders as `Operational sequence`. Both use the same node and edge primitives, but sequence edges use `MESSAGE` and `SELF_TRANSITION` semantics.

### Motion

Edges animate only for active or selected flows. Selection uses a restrained glow and a layout-preserving expansion transition. Generated imagery may receive a subtle hover/depth treatment. `prefers-reduced-motion` disables edge animation and uses immediate state changes.

## Components and Boundaries

Create focused client components with plain serialized graph data as their input:

- `GraphCanvas`: React Flow setup, viewport, fit-to-width, pan/zoom, keyboard focus, and responsive configuration.
- `GraphNode`: visual node shell, node-kind styling, asset display, selection, and expansion trigger.
- `GraphInspector`: expanded node content, evidence/metric summaries, connected-context links, and `See more`.
- `GraphEdge`: relationship styling, directional markers, and active-flow animation.
- `GraphAsset`: generated asset lookup, meaningful alt text, and deterministic fallback glyph.
- Landscape graph adapter: maps filtered pathway data and metrics to React Flow nodes while preserving numeric positions.
- Process graph adapter: maps pathway protobuf graph data to stage-aware nodes and edges.

Server components continue to load database/protobuf records. Client components do not add graph-specific fetch waterfalls. The graph bundle should be loaded only for graph surfaces so unrelated routes do not pay its cost.

Use the pinned `@xyflow/react` package compatible with the repository's React 19 version. The package version, React Flow stylesheet import, and client-only boundary must be verified against Next.js 16.3.2 in the implementation plan. Browser-dependent graph code stays below a client component boundary and is dynamically loaded from the two graph surfaces; production build output must verify that server routes do not import browser-only modules during build.

The graph wrapper accepts optional `processGraph` and `operationalGraph` values. The existing diagram wrapper also accepts optional `flowSource` and `sequenceSource` values; it must not assume both Mermaid sources exist. Because the overview and detail pages are Server Components, each page renders a small `'use client'` graph loader wrapper that owns any `next/dynamic` call. `ssr: false` is never passed directly from a Server Component, in accordance with the Next.js 16 boundary rule.

## Asset Generation

Use the BrandBrain Flow Orchestrator asset-set workflow documented in the BrandBrain repository. The first coordinated pack should contain stable semantic roles for source, capture, sorbent/material, membrane, electrochemical unit, heat/regeneration, separation, compression/transport, storage/mineralization, biological/ocean system, and waste/byproduct.

The manifest must specify:

- transparent PNG as the required format;
- optional SVG as a desired, quality-gated format;
- stable item IDs and filename stems;
- one semantic role and prompt per item;
- shared abstract scientific line-art style;
- consistent palette, stroke weight, and legibility at node size;
- no labels, claims, axes, or text embedded in the generated image;
- no automatic paid retries and an explicit spend ceiling.

The persisted manifest must use the canonical BrandBrain asset-set shape: `title`, `purpose`, `requested_formats` in `['png']` or `['png', 'svg']` order, complete layout fields, consistency rules, matte/background policy, retry policy with `auto_retry_enabled: false`, `max_retry_items: 0`, `max_attempts_per_item: 1`, zero retry spend, and every item with a distinct `grid_index`, `required_formats: ['png']`, and desired formats matching the request. The implementation must verify the returned draft revision/hash and approval history before mock or live execution, then deliver output URLs, QA state, and zero-token local-processing evidence. No paid generation has been run for this Carbon work.

Before creating or mutating a BrandBrain session, call `get_flow_processor_health` and require enabled/available local execution, provider token cost of zero, non-empty VTracer/resvg revisions, split/trim-normalize/vectorize/local-review capabilities, and deterministic matte/alpha support for transparent assets. Use the canonical supported `icon-set` template. Do not require an unadvertised processor-profile mutation: line-art is expressed through the shared manifest consistency rules and per-item prompts, while the currently supported processor configuration is accepted as-is. If a future MCP advertises an allowlisted profile override, it must still be revision-checked and approved before use; Carbon must not use raw REST or invented graph edits. Set `max_total_generation_usd: 1.00` and stop for user review if the provider estimate exceeds it. Treat omitted proto3 false/zero fields as their defaults, but explicitly inspect semantic-review configuration and require `semantic_enabled: false`; require `max_semantic_review_usd: 0` and `max_semantic_review_tokens: "0"`. The workflow must persist and inspect the complete draft manifest, obtain approval for the exact manifest, run mock validation, and pause for a separate immediate confirmation before any paid provider generation. Local split, background removal, trim/normalize, vectorization, and review must be inspected as zero-provider-cost stages. Re-check `production_ready=true` for background removal immediately before paid execution. After the run, use authenticated BrandBrain output retrieval to fetch every required PNG and any accepted SVG from the persisted artifact URLs, validate content type, decodability, provenance, and QA evidence, then copy only validated files into Carbon's committed `public/graph-assets/` directory with metadata mapping semantic IDs to paths. BrandBrain artifact URLs are not used directly by Carbon at runtime.

If an asset is unavailable, unsafe, or rejected by quality gates, Carbon renders a CSS/SVG fallback with the same semantic label. No graph content or interaction may depend on a generated image.

## Data Flow

1. Seed loader reads pathway and landscape YAML.
2. Protobuf decoding produces typed graph records.
3. Seed validation checks graph structure and entity references.
4. Server page loaders fetch filtered pathways and serialize plain graph data to client components.
5. Landscape adapter maps metric values to responsive node positions and explicit relationships to edges.
6. Process adapter maps authored stage/order hints to stable process positions and edges.
7. React Flow owns transient viewport, selection, expansion, and pan/zoom state.
8. `See more` routes to existing detail content and preserves relevant query/context state.
9. Missing graph data falls back to Mermaid/source rendering during migration.

The landscape adapter contract accepts filtered pathway rows plus the loaded `LandscapeGraph`, and returns a serializable DTO containing every pathway node, every context node, an `initially_hidden` flag, explicit positions or an unmapped-rail placement, and only edges whose endpoints are present in that DTO. It reuses `makeScales` semantics, including log-X and screen-Y inversion. In log mode, only positive x values enter scale-domain construction; non-positive x values are routed to the unmapped rail and never passed to `sx`. It assigns deterministic overlap offsets and does not include full process graphs. The process adapter returns one view at a time with stable node/edge IDs plus all node content required by the inspector, including referenced metric, material, and source summaries.

No graph interaction state is persisted to the database in the initial release. URL-backed filters and comparison IDs remain the durable navigation state.

### Migration state matrix

| Process graph | Operational graph | Mermaid sources | Required behavior |
| --- | --- | --- | --- |
| valid | valid | any | Render React Flow views |
| valid | missing | sequence Mermaid present | Render React Flow system flow and Mermaid operational sequence |
| missing | valid | flow Mermaid present | Render Mermaid system flow and React Flow operational sequence |
| missing | missing | one or both Mermaid sources present | Render available Mermaid view(s) |
| missing | missing | none | Render existing mechanism/metrics/material/evidence content with an explicit graph-unavailable state |
| client render failure | client render failure | any | Fall back independently per view to Mermaid, then semantic content |

Server seed validation prevents invalid new graph data from booting. A malformed graph subdocument is reported by `data:check` and blocks that seed update; it is not silently converted into a partial protobuf row. The client error boundary covers post-serialization rendering failures and applies the matrix independently per view without hiding the rest of the page.

The detail page mounts its diagram region when either a graph or a Mermaid source exists, and both graph and Mermaid props are optional. The system-flow and operational-sequence views choose their fallback independently. If the landscape graph is unavailable, the overview renders the current `ScatterPlot` plus `PathwayList`; the overview has no Mermaid fallback. If both detail graph and Mermaid views are unavailable, the existing mechanism, metrics, materials, source, and literature sections remain the equivalent content fallback, with an explicit unavailable-state notice rather than an invented ordered graph.

The detail page mounts its diagram region when either a graph or a Mermaid source exists, and both graph and Mermaid props are optional. The system-flow and operational-sequence views choose their fallback independently. If the landscape graph is unavailable, the overview renders the current `ScatterPlot` plus `PathwayList`; the overview has no Mermaid fallback.

## Error Handling and Accessibility

- Invalid graph seed data fails `data:check` with the exact pathway, graph, and offending ID.
- Missing graph data renders the existing Mermaid fallback when available.
- Missing generated assets render deterministic semantic fallbacks.
- Graph references are strict: missing material or citation IDs fail `data:check`, matching the existing seed validator. Only legacy/corrupt persisted rows may reach a runtime unresolved-reference state, which is rendered as an explicit warning.
- Graphs provide a visible focus target, keyboard node navigation, keyboard pan/zoom controls, meaningful labels, and non-canvas table/content alternatives.
- The process graph has a semantic ordered stage/node list alternative with equivalent labels, relationships, metrics, and evidence. Expanded content moves focus to its heading, Escape closes it and returns focus to the node, and selection changes are announced through a polite live region without trapping focus.
- Each graph node is a focusable button or link with `aria-expanded`, `aria-controls`, and a stable accessible name. Use a roving tab index for graph nodes, deterministic arrow-key navigation by stage/order (and numeric position for landscape nodes), `+`/`-`/`0` viewport keys, touch targets of at least 44 CSS pixels, and visible focus styling. These are implementation requirements, not only test assertions.
- Mobile layouts avoid requiring precision pointer interaction.
- Reduced-motion mode removes animated edges and non-essential transitions.
- Graph rendering errors are isolated by an error boundary so the rest of the pathway page remains usable.

## Performance and Responsive Behavior

- Use a client-only graph surface with server-provided data.
- Avoid rendering unnecessary relationship edges for filtered-out nodes.
- Keep generated assets small, locally served, and responsive.
- Use fit-to-width as the initial viewport behavior for oversized diagrams.
- Preserve manual viewport state after user interaction; resize should refit only before the user has interacted.
- Use a constrained stage height on desktop and a taller, touch-friendly stage on mobile.
- Do not use WebGL for labels, inspectors, metrics, or evidence.

Initial budgets are 64 visible pathway nodes plus 20 context nodes and 160 visible edges on the landscape, 80 nodes and 160 edges per detail view, and less than 200 KB gzip for a serialized graph DTO excluding images. Custom nodes must use stable inputs and be memoized where needed; pan/zoom must not trigger server work. Detail citation, material, graph-reference, and literature-independent lookups should be parallelized with `Promise.all` where independent, and the inspector DTO must contain the resolved summaries needed by the client rather than triggering per-node fetches. The deployed 512 MiB container limit is a verification constraint.

## Testing Strategy

### Data and unit tests

- Protobuf generation produces the expected graph types.
- Seed validation catches duplicate IDs, dangling edges, unsupported kinds, invalid references, and disallowed cycles.
- Landscape adapters preserve metric positions and filters.
- Process adapters preserve stable IDs, stages, edge direction, and asset mappings.
- Missing and invalid graph data selects the Mermaid fallback.

### Component and E2E tests

- Landscape graph renders filtered pathway nodes and preserves axis/filter query state.
- Clicking a landscape node expands the inspector without routing.
- `See more` routes to the correct pathway and preserves context.
- Related nodes and edges highlight while unrelated nodes soften.
- Detail graph renders process stages and directional edges.
- Clicking a detail node expands content; only one expansion transition is active at a time.
- Keyboard navigation, zoom, pan, fit-to-width, and focus-visible behavior work.
- Mobile expansion is readable and touch operable.
- Reduced-motion mode disables animated edges.
- Missing image assets render fallbacks.
- Existing table, citation, literature, shortlist, and source tests continue to pass.
- Host embed has no visible border or opaque child background and remains height-synchronized.
- Existing scatter-dot and Mermaid assertions are migrated into graph behavior assertions, while dedicated fallback tests retain coverage of the Mermaid path.

### Verification gates

Run the repository's normal gate:

```bash
npm run typecheck && npm run lint && npm test
```

Also run graph seed validation, Mermaid validation during migration, production build, and Playwright E2E tests before deployment.

Extend the existing `data:check` task in `taskfiles/data.yml` so it reports the landscape graph count and validates every process graph. Wire `task data:check` into `taskfiles/quality.yml`'s `verify` task alongside Mermaid validation. Because production builds skip instrumentation, `data:check` must also run independently before image creation and deployment. Make `task deploy:image` invoke `task data:check` before Docker build, and add the same check as a dedicated step in `.github/workflows/build-push.yml` before `docker/build-push-action`. The CI step first uses `actions/setup-node` with `.nvmrc`, runs `npm ci`, installs the pinned Task binary (or invokes the equivalent `tsx src/lib/seed/check.ts data` command if Task is unavailable), and then runs the check.

The public `NEXT_PUBLIC_EMBED_PARENT_ORIGIN` value is a build-time Next.js value, not a Kubernetes runtime secret. Add a Docker `ARG`/builder `ENV` and pass `https://benebsworth.com` through both `task deploy:image` and the GitHub Actions Docker build args before `next build`; document the same value in the chart/deployment contract for operator visibility.

The host contract is explicit: `CarbonEmbed` owns `display: block`, `width: 100%`, `border: 0`, and exact `event.origin` plus `event.source === frameRef.current?.contentWindow` validation. It accepts only finite integer heights in the inclusive range 200 to 20,000 CSS pixels. Carbon embed mode owns transparent body/background styles and removes max-width/padding constraints around the graph stage. Production requires `NEXT_PUBLIC_EMBED_PARENT_ORIGIN=https://benebsworth.com` at the Carbon Docker build stage; the child must fail closed rather than fall back to `'*'`. The child CSP is configured in Carbon's `next.config.ts` with only `https://benebsworth.com` in production and localhost only in development. The host CSP is configured in `benebsworth.com/public/_headers`, with `frame-src https://carbon.benebsworth.com` and no wildcard Carbon subdomains. Host and child E2E coverage must verify the message origin/source, borderless frame, transparent background, width, and resize behavior.

## Delivery Order

1. Add protobuf graph messages, generated output, YAML shape, store schema/accessors for the singleton landscape graph, and seed validation.
2. Add the pinned `@xyflow/react` dependency, stylesheet/client boundary, and shared canvas/node/edge primitives.
3. Author and validate all 24 process graphs while keeping Mermaid fallback.
4. Migrate pathway detail pages and add interaction/E2E coverage.
5. Author landscape relationships and migrate the overview graph while preserving scatter semantics and table fallback.
6. Generate, inspect, and install the approved BrandBrain asset set.
7. Apply final responsive, accessibility, motion, and visual polish.
8. Require production embed-origin configuration, verify the seamless host embed end to end, and deploy through the existing Carbon workflow.

## Acceptance Criteria

- Both overview and detail surfaces are interactive React graph views.
- All 24 pathways have explicit validated process graph data.
- Overview filters, axes, benchmark state, comparison URLs, and table fallback still work.
- Detail nodes expand inline and expose a deeper `See more` path.
- Graphs work with keyboard, touch, reduced motion, and missing imagery.
- Generated assets are coordinated, locally served, quality-gated, and non-essential.
- Mermaid remains a usable migration fallback until graph coverage is complete.
- The host embed appears borderless, transparent, and full-width rather than like a browser iframe.
- Typecheck, lint, unit tests, graph validation, build, E2E, and deployment health checks pass.
