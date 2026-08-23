# Carbon Capture Research Platform — Design Spec

Date: 2026-08-23
Status: Approved design, pending implementation plan

## Purpose

A local web platform for researching next-generation carbon capture. It maps the full capture-pathway landscape (point-source, DAC, ocean, mineralization, biological), compares pathways on cited cost/energy/TRL values, and supports convergence: shortlisting pathways, recording elimination reasoning, and driving toward a chosen direction to pursue deeper.

## Decisions (from discovery)

| Question | Decision |
|---|---|
| Primary artifact | Web app / research platform |
| Core daily loop | Pathway landscape explorer (compare pathways, drill into materials & papers) |
| Knowledge source | Hybrid: curated seed spine + live literature/structure edges |
| Tradeoff exploration | Static comparison views with cited ranges (v1); schema leaves room for weighted scoring/TEA later |
| Audience | Single user, local, no auth |
| Landscape scope | Full landscape incl. mature benchmark anchors |
| End goal | Converge on a direction (shortlist + decision journal) |
| Architecture | Approach 1: single Next.js app, protobuf-typed data layer, buf tooling |

## Architecture

One process: `next dev` / `next start`. No auth, no background workers beyond lazy cache refreshes triggered by requests.

```
carbon/
├── proto/
│   ├── buf.yaml              # lint + breaking-change checks
│   ├── buf.gen.yaml          # buf generate → TS via @bufbuild/protoc-gen-es
│   └── carbon/v1/
│       ├── common.proto      # Citation, MetricRange
│       ├── pathway.proto     # Pathway, Setting enum
│       ├── material.proto    # Material, MaterialClass enum
│       └── research.proto    # ShortlistEntry, JournalEntry + enums
├── data/
│   ├── sources/*.yaml        # bibliography; stable citation ids
│   └── pathways/*.yaml       # one file per pathway (+ materials files)
├── src/
│   ├── app/                  # Next.js App Router routes
│   ├── components/           # shadcn primitives + bespoke viz (scatter, compare tables)
│   ├── lib/
│   │   ├── gen/              # buf-generated TypeScript (committed)
│   │   ├── seed/loader.ts    # YAML → protojson validate → SQLite
│   │   ├── db/               # better-sqlite3, thin repository layer
│   │   └── edges/            # OpenAlex + AlphaFold/PDB clients with cache
│   └── ...
└── carbon.db                 # SQLite (gitignored)
```

Stack: Next.js (App Router, TypeScript), shadcn/ui + Tailwind, buf + @bufbuild/protoc-gen-es, better-sqlite3, OpenAlex public API, Mol* viewer for structures. Markdown rendering for journal/mechanism text.

### Runtime data flow

1. On boot, the seed loader reads `data/**/*.yaml`, converts YAML→JSON→protojson, and validates each document against generated types.
2. Validated entities are upserted into SQLite. Boot fails loudly on any validation error (unknown fields, missing units, unresolved references).
3. Read paths serve pages from SQLite. Live-edge route handlers fetch external APIs on demand, normalize into proto types, cache in SQLite with TTL, and render cached data immediately while refreshing in the background (stale-while-revalidate).

Protobuf is the source of truth for *shape*; YAML is the human-editable carrier for *content*; git diffs of `data/` are research provenance.

## Data model

Principle: every number is a range with a citation. Cost estimates vary 5–10x across studies; point values would bake in false precision.

```protobuf
// common.proto
message Citation {
  string id;            // stable id, e.g. "mcqueen2021"
  string title;
  repeated string authors;
  int32 year;
  string venue;
  string url;           // doi or url
}

message MetricRange {
  double low;
  double high;
  string unit;          // validated against the unit allowlist
  int32 year_basis;
  string source_ref;    // -> Citation.id; required
}
```

```protobuf
// pathway.proto
enum Setting { POINT_SOURCE; DAC; OCEAN_DIC; MINERALIZATION; BIOLOGICAL; }

message Pathway {
  string id;
  string name;
  Setting setting;
  bool is_benchmark;      // mature anchors, e.g. MEA scrubbing
  string mechanism;       // markdown chemistry explainer
  int32 trl;              // 1–9
  repeated string search_terms;  // drives literature queries
  map<string, MetricRange> metrics;  // keys: cost, energy_thermal, energy_electric,
                                     // capacity_potential, permanence, land_footprint, water_footprint...
  repeated string advantages;
  repeated string challenges;
  repeated string material_ids;
  repeated string source_refs;
}
```

```protobuf
// material.proto
enum MaterialClass { AMINE_SORBENT; MOF; LIQUID_SOLVENT; ENZYME;
                     ELECTRODE_MATERIAL; MINERAL; OTHER; }

message Material {
  string id;
  string name;
  MaterialClass class;
  string summary;
  map<string, MetricRange> properties; // working_capacity, regeneration_energy,
                                       // selectivity, lifetime, cost
  string uniprot_id;                   // enzymes → AlphaFold DB structure
  string pdb_ids_csv;                  // optional experimental structures
}
```

```protobuf
// research.proto
enum ShortlistStatus { CANDIDATE; UNDER_EVALUATION; ELIMINATED; CHOSEN; }

message ShortlistEntry {
  string pathway_id;
  ShortlistStatus status;
  string rationale;      // markdown
  string updated_at;     // ISO 8601
}

enum EntryKind { OBSERVATION; COMPARISON_NOTE; DECISION; ELIMINATION; }

message JournalEntry {
  string id;
  EntryKind kind;
  string title;
  string body_markdown;
  repeated string pathway_refs;
  string created_at;     // ISO 8601
}
```

Notes:
- `map<string, MetricRange>` avoids nullable-field sprawl across heterogeneous pathways and lets new metric types be added without schema churn (evolution path to TEA models).
- Cached literature normalizes into the shared `Citation` message; detail pages render one unified evidence list.
- Structures stay external in v1 (UniProt/PDB ids resolved live); structure files are not stored.

## Seed dataset

~24 pathways across all settings, including mature benchmarks (`is_benchmark`) for calibration:

| Setting | Pathways |
|---|---|
| POINT_SOURCE | MEA scrubbing*, advanced amine solvents (Cansolv-class), solid amine on structured support, calcium looping*, membranes |
| DAC | liquid solvent (KOH/calciner), amine-functionalized silica, MOF sorbents, humidity/water-swing sorbents, electro-sorption (quinone electrodes) |
| OCEAN_DIC | electrodialysis direct ocean capture, electrochemical alkalinity production, mineral-addition OAE |
| MINERALIZATION | in-situ basalt injection, ex-situ slag/tailings carbonation, agricultural enhanced weathering |
| BIOLOGICAL | enzymatic absorption (carbonic anhydrase), BECCS*, macroalgae cultivation |

\* benchmark anchors. The list is plain YAML; editing is trivial.

Authoring format example:

```yaml
# data/pathways/mof-dac.yaml
id: mof-dac
name: "MOF-based DAC (diamine-Mg2(dobpdc) class)"
setting: DAC
trl: 5
search_terms: ["metal-organic framework direct air capture", "Mg2(dobpdc) CO2"]
metrics:
  cost: { low: 80, high: 600, unit: USD/tCO2, year_basis: 2022, source_ref: sinha2025 }
  energy_thermal: { low: 4.0, high: 6.5, unit: GJ/tCO2, year_basis: 2022, source_ref: sinha2025 }
material_ids: [mg2dobpdc]
source_refs: [sinha2025, darunte2019]
```

Loader validation rules (all enforced at boot):
- Unknown fields rejected (strict protojson parsing)
- Units must come from an allowlist
- Every `source_ref` resolves to an entry in `data/sources/*.yaml`
- Every `material_id` resolves to a material file
- TRL within 1–9; range low ≤ high
- The unit allowlist is a fixed constant in `src/lib/seed/loader.ts` (USD/tCO2, GJ/tCO2, GJ-electric/tCO2, Gt/yr, years, tCO2/t-material); extending it is a code change so units stay deliberate.

## Live edges

Never block core browsing; detail-page-only enrichment.

- **Literature**: OpenAlex (free, no key). Query = pathway `name` + `search_terms`. Results normalized into `Citation`, cached in SQLite, 7-day TTL, stale-while-revalidate: page renders instantly from cache, background refresh updates, UI shows freshness badge ("literature as of ⟨date⟩"; amber on stale/upstream failure with retry). Cold cache (first visit): the panel renders a loading placeholder and fills when the fetch resolves — never blocks the rest of the page.
- **Structures**: Material detail resolves `uniprot_id` → embedded Mol* viewer against AlphaFold DB; `pdb_ids_csv` → PDB structures. External-link fallback if embedding fails.

## UI surfaces

App shell: shadcn sidebar → **Landscape · Compare · Materials · Decision Space · About**.

1. **Landscape** (home) — chart-first layout (user-selected): large switchable-axis scatter dominates ($/t vs TRL default), filters by setting / TRL range / benchmark-only (mechanism is freeform text, not filterable), compact list of all pathways below. Hover dot → tooltip with cited ranges; click → Pathway Detail. Filters persist during drilling.
2. **Compare** — pick N pathways → side-by-side table with cited ranges and per-metric bar visualizations.
3. **Pathway Detail** — mechanism explainer, metrics with inline citations, materials involved, advantages/challenges, live literature panel with freshness badge, shortlist actions (shortlist / eliminate with rationale).
4. **Materials Index** — filterable by class; enzyme/MOF detail pages embed structure viewers where ids exist.
5. **Decision Space** — shortlist board (CANDIDATE → UNDER EVALUATION → ELIMINATED / CHOSEN) with rationale editing + decision journal timeline (markdown entries linked to pathways). Status transitions: shortlisting/eliminating from a Pathway Detail page sets CANDIDATE/ELIMINATED; moves to UNDER_EVALUATION and CHOSEN are made on the Decision Space board itself, each optionally with a rationale note.

Drill path: Landscape → hover tooltips → click → Pathway Detail → Material Detail; breadcrumbs back up; shortlisting from any detail page lands in Decision Space immediately.

About/methodology page documents sourcing conventions and caveats.

Bespoke visualization components are appropriate here (scatter plots, range-bar comparisons) per project conventions; forms/dialogs/inputs use shadcn primitives.

## Error handling

- Boot validation failures exit with file+field precision (e.g. `mof-dac.yaml: source_ref 'sinha2025' not found in sources/`). Bad data never silently renders.
- Live edges always degrade gracefully: cached literature with freshness badge; amber badge + retry button on upstream failure; structure viewer falls back to external links.
- Empty states: fresh install shows empty shortlist/journal with one-line primers ("Shortlist a pathway from its detail page to begin converging").
- Seed drift: if a `ShortlistEntry`/`JournalEntry` references a pathway id no longer present in the seed, boot logs a warning and Decision Space shows a "removed from seed" tombstone badge — rationale text is preserved, never deleted.

## Testing

- **Unit**: seed loader validation (bad refs, unknown fields, unit allowlist, range sanity), proto JSON round-trips, metric range formatting.
- **Integration**: OpenAlex client against mocked responses (normalization → `Citation`, TTL/stale logic); repositories against temp SQLite files.
- **E2E smoke (Playwright)**: load landscape → filter DAC → open MOF detail → shortlist with rationale → entry appears in Decision Space board; journal entry persists across restart. Verify against the running app, confirming the listen pid is the freshly started server before trusting results.
- **Proto hygiene**: `buf lint` + `buf breaking` in a check script.

## Out of scope (v1)

- Weighted scoring / adjustable assumptions (schema designed to admit later)
- Per-pathway techno-economic models
- Multi-user auth, sharing, public deployment
- Continuous ingestion pipelines / agent-driven extraction
- Storing or versioning structure files locally
