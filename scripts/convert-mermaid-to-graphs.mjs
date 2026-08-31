#!/usr/bin/env node
/**
 * Convert Mermaid flowchart + sequenceDiagram into typed ProcessGraph YAML.
 * Reads each data/pathways/<id>.yaml, parses mermaid_source and
 * mermaid_sequence_source, and adds process_graph + operational_graph fields.
 */
import fs from 'node:fs'
import path from 'node:path'
import { parse, stringify } from 'yaml'

const ROOT = path.resolve(import.meta.dirname, '..')
const DIR = path.join(ROOT, 'data', 'pathways')

// ===========================================================================
// Enums (proto string forms)
// ===========================================================================

const NODE_KIND = {
  INPUT: 'GRAPH_NODE_KIND_INPUT',
  CAPTURE: 'GRAPH_NODE_KIND_CAPTURE',
  MATERIAL: 'GRAPH_NODE_KIND_MATERIAL',
  MEMBRANE: 'GRAPH_NODE_KIND_MEMBRANE',
  CONVERSION: 'GRAPH_NODE_KIND_CONVERSION',
  ELECTROCHEMICAL: 'GRAPH_NODE_KIND_ELECTROCHEMICAL',
  REGENERATION: 'GRAPH_NODE_KIND_REGENERATION',
  SEPARATION: 'GRAPH_NODE_KIND_SEPARATION',
  TRANSPORT: 'GRAPH_NODE_KIND_TRANSPORT',
  STORAGE: 'GRAPH_NODE_KIND_STORAGE',
  BIOLOGICAL: 'GRAPH_NODE_KIND_BIOLOGICAL',
  WASTE: 'GRAPH_NODE_KIND_WASTE',
  SEQ_PART: 'GRAPH_NODE_KIND_SEQUENCE_PARTICIPANT',
}

const STAGE = {
  UNSPECIFIED: 'GRAPH_STAGE_UNSPECIFIED',
  INPUT: 'GRAPH_STAGE_INPUT',
  CAPTURE: 'GRAPH_STAGE_CAPTURE',
  CONVERSION: 'GRAPH_STAGE_CONVERSION',
  REGENERATION: 'GRAPH_STAGE_REGENERATION',
  SEPARATION: 'GRAPH_STAGE_SEPARATION',
  TRANSPORT: 'GRAPH_STAGE_TRANSPORT',
  STORAGE: 'GRAPH_STAGE_STORAGE',
  BYPRODUCT: 'GRAPH_STAGE_BYPRODUCT',
}

const EDGE_KIND = {
  FLOW: 'GRAPH_EDGE_KIND_FLOW',
  FEEDBACK: 'GRAPH_EDGE_KIND_FEEDBACK',
  MESSAGE: 'GRAPH_EDGE_KIND_MESSAGE',
  SELF_TRANSITION: 'GRAPH_EDGE_KIND_SELF_TRANSITION',
}

const CYCLE_POLICY = {
  ACYCLIC: 'GRAPH_CYCLE_POLICY_ACYCLIC',
  RECYCLE_ALLOWED: 'GRAPH_CYCLE_POLICY_RECYCLE_ALLOWED',
}

// ===========================================================================
// classDef → (kind, stage) mapping for process graphs
// ===========================================================================

const CLASS_MAP = {
  stream: [NODE_KIND.INPUT, STAGE.INPUT],
  equip: [NODE_KIND.CAPTURE, STAGE.CAPTURE],
  sorb: [NODE_KIND.MATERIAL, STAGE.CAPTURE],
  co2: [NODE_KIND.STORAGE, STAGE.STORAGE],
  seq: [NODE_KIND.STORAGE, STAGE.STORAGE],
  heat: [NODE_KIND.REGENERATION, STAGE.REGENERATION],
  waste: [NODE_KIND.WASTE, STAGE.BYPRODUCT],
  air: [NODE_KIND.INPUT, STAGE.INPUT],
  bio: [NODE_KIND.BIOLOGICAL, STAGE.CAPTURE],
  water: [NODE_KIND.INPUT, STAGE.INPUT],
  geol: [NODE_KIND.STORAGE, STAGE.STORAGE],
  solid: [NODE_KIND.MATERIAL, STAGE.STORAGE],
  ocean: [NODE_KIND.INPUT, STAGE.INPUT],
  fuel: [NODE_KIND.INPUT, STAGE.INPUT],
  elec: [NODE_KIND.REGENERATION, STAGE.REGENERATION],
  perm: [NODE_KIND.MEMBRANE, STAGE.SEPARATION],
  h2: [NODE_KIND.STORAGE, STAGE.BYPRODUCT],
  energy: [NODE_KIND.REGENERATION, STAGE.REGENERATION],
  crop: [NODE_KIND.BIOLOGICAL, STAGE.CAPTURE],
  build: [NODE_KIND.STORAGE, STAGE.STORAGE],
  warn: [NODE_KIND.WASTE, STAGE.BYPRODUCT],
}

// Equipment block label hints: if shape is [/.../] and label contains one
// of these tokens, override the equip default with a more specific kind.
const EQUIP_LABEL_OVERRIDE = [
  { kw: /\bmembrane|membran\b/i, kind: NODE_KIND.MEMBRANE, stage: STAGE.SEPARATION },
  { kw: /\b(stripper|regenerator|reboiler|calciner|desorber)\b/i, kind: NODE_KIND.REGENERATION, stage: STAGE.REGENERATION },
  { kw: /\b(compressor|compressor|comp)\b/i, kind: NODE_KIND.TRANSPORT, stage: STAGE.TRANSPORT },
  { kw: /\b(electrolyzer|electrolys|cell|electrodialysis|electrochem|electro-swing)\b/i, kind: NODE_KIND.ELECTROCHEMICAL, stage: STAGE.CONVERSION },
  { kw: /\b(pyrolyzer|pyrolysis)\b/i, kind: NODE_KIND.CONVERSION, stage: STAGE.CONVERSION },
  { kw: /\b(contactor|absorber|column|bed|hopper|reactor|chamber|scrubber|tank|vessel|well|boiler|burner|kiln|furnace|jet|hopper|monolith|hopper)\b/i, kind: NODE_KIND.CAPTURE, stage: STAGE.CAPTURE },
]

// ===========================================================================
// Pathway-specific material mappings
// ===========================================================================

// Map pathway id → list of { keyword, material_id } tuples. If any keyword
// (regex) matches a node's id or label, that material is attributed.
const PATHWAY_MATERIAL_RULES = {
  'mea-scrubbing': [{ id: 'MEA', kw: /^MEA$|monoethanolamine|^MEA\b/, materialId: 'mea' }],
  'advanced-amine-point-source': [{ id: 'SOLV', kw: /CANSOLV|sterically|tertiary amine|advanced/i, materialId: 'cansolv-solvent' }],
  'mof-dac': [{ id: 'MOF', kw: /Mg2\(dobpdc\)|Mg₂\(dobpdc\)|MOF|diamine/i, materialId: 'mg2dobpdc' }],
  'amine-silica-dac': [{ id: 'SORB', kw: /Amine-grafted|amine-grafted|PEI|APS|mesoporous silica/i, materialId: 'solid-amine-silica' }],
  'solid-amine-point-source': [{ id: 'SORB|RICH|LEAN', kw: /Amine-functionalized|silica|mesoporous|R-NH|carbamate/i, materialId: 'solid-amine-silica' }],
  'enzymatic-absorption': [{ id: 'ENZ', kw: /carbonic anhydrase|immobilized|thermostable/i, materialId: 'carbonic-anhydrase' }],
  'electro-sorption-dac': [{ id: 'QT', kw: /polyanthraquinone|quinone|CNT/i, materialId: 'quinone-electrode' }],
  'selexol-precombustion': [{ id: 'SOLV', kw: /Selexol|dimethyl ethers|PEG/i, materialId: 'selexol-solvent' }],
  'calcium-looping': [{ id: 'LIME', kw: /CaO|CaCO|limestone|limestone/i, materialId: 'cao-lime' }],
  'mineral-addition-oae': [{ id: 'LIME', kw: /CaO|Ca\(OH\)|quicklime|alkaline/i, materialId: 'cao-lime' }],
  'enhanced-weathering-cropland': [
    { id: 'ROCK', kw: /basalt|olivine|silicate rock/i, materialId: 'olivine' },
    { id: 'ROCK', kw: /basalt|olivine|silicate rock/i, materialId: 'basalt' },
  ],
  'basalt-injection': [{ id: 'BAS', kw: /basalt|Ca\/Mg\/Fe/i, materialId: 'basalt' }],
}

// Capture-node id per pathway (for metric_keys ['trl'] attribution)
const PRIMARY_CAPTURE_NODE = {
  'mea-scrubbing': 'ABS',
  'advanced-amine-point-source': 'ABS',
  'mof-dac': 'CONT',
  'amine-silica-dac': 'ADS',
  'solid-amine-point-source': 'ADS',
  'enzymatic-absorption': 'ABS',
  'electro-sorption-dac': 'CELL',
  'selexol-precombustion': 'SELX',
  'calcium-looping': 'CARB',
  'mineral-addition-oae': 'DISS',
  'enhanced-weathering-cropland': 'RXN',
  'basalt-injection': 'INJ',
  'oxy-fuel-combustion': 'BOILER',
  'membranes-point-source': 'S1',
  'beccs': 'CAP',
  'biochar': 'PYRO',
  'liquid-solvent-dac': 'CONT',
  'humidity-swing-dac': 'DRY',
  'macroalgae-cultivation': 'FARM',
  'aggregate-carbonation': 'CURE',
  'slag-carbonation': 'RXN',
  'electrodialysis-doc': 'BPM',
  'electrochemical-oae': 'CELL',
  'soil-carbon-sequestration': 'PHOTO',
}

// ===========================================================================
// Helpers
// ===========================================================================

const sanitize = (s) => s.toLowerCase().replace(/[^a-z0-9_]/g, '_').replace(/^_+|_+$/g, '')

// ===========================================================================
// Flowchart parsing
// ===========================================================================

/**
 * Mermaid flowchart grammar (subset we encounter):
 *   flowchart LR            — header
 *   classDef NAME fill:...  — class definition (skip)
 *   class X Y               — class assignment (skip; we read :::class from decl)
 *   ID["label"]:::class     — rectangle node with class
 *   ID[/"label"/]:::class   — parallelogram node with class
 *   ID[("label")]:::class   — cylindrical node with class
 *   ID{{"label"}}:::class   — hexagonal node with class
 *   ID(("label"))           — double-circle node, no class
 *   A -->|"label"| B        — solid edge with label
 *   A --> B                 — solid edge no label
 *   A -.->|"label"| B       — dotted edge with label
 *   A -.-> B                — dotted edge no label
 *   A <-->|"label"| B       — bidirectional edge (recycle)
 *   A ==>|label| B          — thick edge
 *   A -- text --- B         — older syntax (rare)
 *
 * Inline declarations appear inside edge targets/sources, e.g.
 *   CO2 -->|"dense-phase"| SEQ(("Geological storage"))
 *
 * Lines are indented with 6 spaces (yaml block scalar indent) — trim first.
 */
function parseFlowchart(source) {
  const lines = source.split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('%%'))
  // Drop the header
  if (lines[0] && /^flowchart\b|^graph\b/i.test(lines[0])) lines.shift()

  const nodes = new Map()
  const edges = []
  const edgeCounter = { i: 0 }
  let hasFeedback = false

  for (const line of lines) {
    if (/^classDef\b/i.test(line)) continue
    if (/^class\b/i.test(line)) continue

    // Try edge parse: <id> <arrow> <rest>
    const m = line.match(/^([^\s<][^\s]*?)\s*(-->|\-\-\->|-\.->|==>|<-->|<==>|<-|<\.-)\s*(.*)$/)
    if (m) {
      const [, sourceId, arrow, rest] = m
      // Skip if sourceId looks like a declaration (has [ or { or ( or ")
      if (/[\[\(\{"]/.test(sourceId)) {
        // fall through to decl parser
      } else {
        const edge = parseEdgeArrowRest(arrow, rest)
        if (edge) {
          const sourceNode = ensureNodeFromId(sourceId, nodes)
          const { targetId, targetDecl } = splitTargetOrDecl(edge.target)
          const targetNode = ensureNodeFromId(targetId, nodes, targetDecl)
          const eid = `edge:e${++edgeCounter.i}`
          edges.push({
            id: eid,
            source_node_id: sourceNode,
            target_node_id: targetNode,
            kind: edge.kind,
            label: edge.label,
          })
          if (edge.kind === EDGE_KIND.FEEDBACK) hasFeedback = true
          continue
        }
      }
    }

    // Try node declaration parser (handles "decl" and "decl --> target" forms)
    const declEdge = tryParseDeclWithEdge(line, nodes, edges, edgeCounter)
    if (declEdge.handled) {
      if (declEdge.hasFeedback) hasFeedback = true
      continue
    }

    // Bare inline form: <id> --> <decl>
    const inlineRe = /^(\w+)\s*(-->|\-\-\->|-\.->|==>|<-->|<==>|<-|<\.-)\s*(.*\)$|.*\]$|.*\}$)/
    const inlineMatch = line.match(inlineRe)
    if (inlineMatch) {
      const [, srcId, , rest] = inlineMatch
      const arrowMatch = rest.match(/^(-->|\-\-\->|-\.->|==>|<-->|<==>|<-|<\.-)\s*(.*)$/)
      if (arrowMatch) {
        const edge = parseEdgeArrowRest(arrowMatch[1], arrowMatch[2])
        if (edge) {
          ensureNodeFromId(srcId, nodes)
          const { targetId, targetDecl } = splitTargetOrDecl(edge.target)
          const targetNode = ensureNodeFromId(targetId, nodes, targetDecl)
          const eid = `edge:e${++edgeCounter.i}`
          edges.push({
            id: eid,
            source_node_id: nodes.get(srcId).id,
            target_node_id: targetNode,
            kind: edge.kind,
            label: edge.label,
          })
          if (edge.kind === EDGE_KIND.FEEDBACK) hasFeedback = true
          continue
        }
      }
    }
  }

  return { nodes: [...nodes.values()], edges, hasFeedback }
}

/**
 * Try to parse a node declaration; if the line contains a trailing edge,
 * record both the node and the edge.
 */
function tryParseDeclWithEdge(line, nodes, edges, edgeCounter) {
  // Split off a trailing edge if present (we want to parse the decl separately)
  // Match: "<decl> --> <rest>" or similar
  // We need to be careful: the label can contain "-->" if escaped/quoted.
  // Approach: try to find an arrow token that is OUTSIDE the label quotes.
  let inQuote = false
  let arrowIdx = -1
  let arrowStr = ''
  for (let i = 0; i < line.length; i++) {
    const c = line[i]
    if (c === '"') {
      inQuote = !inQuote
      continue
    }
    if (inQuote) continue
    // Check if arrow starts here
    if (c === '-' && line[i + 1] === '-') {
      // Confirm this is an arrow (followed by > or .-> or ->) — accept -->
      if (line[i + 2] === '>') {
        arrowIdx = i
        arrowStr = '-->'
        break
      }
    }
    if (c === '-' && line[i + 1] === '.') {
      if (line[i + 2] === '-' && line[i + 3] === '>') {
        arrowIdx = i
        arrowStr = '-.->'
        break
      }
    }
    if (c === '=' && line[i + 1] === '=') {
      if (line[i + 2] === '>') {
        arrowIdx = i
        arrowStr = '==>'
        break
      }
    }
    if (c === '<' && (line[i + 1] === '-' || line[i + 1] === '=')) {
      // <-- or <== or <- (rare)
      if (line[i + 2] === '-') {
        // <-- or <-.->
        if (line[i + 3] === '>') {
          arrowIdx = i
          arrowStr = '<-->'
          break
        }
        if (line[i + 3] === '.' && line[i + 4] === '-' && line[i + 5] === '>') {
          arrowIdx = i
          arrowStr = '<-.->'
          break
        }
        // plain <-
        if (i > 0 && /\s/.test(line[i - 1])) {
          arrowIdx = i
          arrowStr = '<-'
          break
        }
      }
      if (line[i + 2] === '=' && line[i + 3] === '>') {
        arrowIdx = i
        arrowStr = '<==>'
        break
      }
    }
  }

  let declPart = line
  let trailingEdge = null
  if (arrowIdx >= 0) {
    declPart = line.slice(0, arrowIdx).trim()
    const rest = line.slice(arrowIdx + arrowStr.length).trim()
    trailingEdge = { arrow: arrowStr, rest }
  }

  const decl = parseNodeDecl(declPart)
  if (!decl) return { handled: false }

  // Merge into nodes
  if (!nodes.has(decl.id)) {
    nodes.set(decl.id, decl)
  } else {
    const existing = nodes.get(decl.id)
    nodes.set(decl.id, {
      ...existing,
      ...decl,
      label: decl.label || existing.label,
      shape: decl.shape || existing.shape,
      className: decl.className || existing.className,
    })
  }

  let hasFeedback = false
  if (trailingEdge) {
    const edge = parseEdgeArrowRest(trailingEdge.arrow, trailingEdge.rest)
    if (edge) {
      const { targetId, targetDecl } = splitTargetOrDecl(edge.target)
      const targetNode = ensureNodeFromId(targetId, nodes, targetDecl)
      const eid = `edge:e${++edgeCounter.i}`
      edges.push({
        id: eid,
        source_node_id: decl.id,
        target_node_id: targetNode,
        kind: edge.kind,
        label: edge.label,
      })
      if (edge.kind === EDGE_KIND.FEEDBACK) hasFeedback = true
    }
  }
  return { handled: true, hasFeedback }
}

// Parse " |"label"| " or bare target
function parseEdgeArrowRest(arrow, rest) {
  if (!rest) return null
  // rest is everything after the arrow up to EOL; could be |"label"| T or just T
  let label = ''
  let target = rest.trim()
  // Match |"label"| at start, possibly with surrounding whitespace
  const labelRe = /^\|\s*"((?:[^"\\]|\\.)*)"\s*\|\s*(.*)$/
  const lm = rest.match(labelRe)
  if (lm) {
    label = unescapeLabel(lm[1])
    target = lm[2].trim()
  } else {
    // Could also be |label| without quotes (rare)
    const labelRe2 = /^\|\s*([^|]+?)\s*\|\s*(.*)$/
    const lm2 = rest.match(labelRe2)
    if (lm2 && lm2[2]) {
      label = lm2[1].trim()
      target = lm2[2].trim()
    }
  }
  if (!target) return null

  const isRecycleLabel = (label) => /\brecycle|regenerat|return\s|heat\sduty/i.test(label)
  const kind =
    arrow === '<-->' || arrow === '<==>' || arrow === '<-.->'
      ? EDGE_KIND.FEEDBACK
      : isRecycleLabel(label)
      ? EDGE_KIND.FEEDBACK
      : EDGE_KIND.FLOW
  const isDotted = arrow === '-.->' || arrow === '<-.->'
  return { kind, label, target, isDotted }
}

function unescapeLabel(s) {
  return s.replace(/\\n/g, '\n').replace(/\\"/g, '"').replace(/\\\\/g, '\\')
}

/**
 * Parse a node declaration of the form:
 *   ID<shape>"label"<shape><class?>
 * Shapes seen:
 *   ["..."]            rectangle
 *   [/"..."/]          parallelogram
 *   [("...")]          cylindrical
 *   {{"..."}}          hexagonal
 *   (("..."))          double circle
 * Returns { id, label, shape, className } or null if not a declaration.
 * Handles a single declaration with no edge after.
 */
function parseNodeDecl(line) {
  // First, try to split off any trailing edge (we don't need it here)
  // The line may contain:  ID[ ... ]:::class  (no edge)
  // Strip a trailing edge if present
  let l = line
  const edgePart = l.match(/^(\S.*?)(\s*--?>|\s*-\.->|\s*==>)\s*(.*)$/)
  if (edgePart && /[\[\(\{]/.test(edgePart[1])) {
    // "Decl --> target" — pull off the arrow+target so we can parse decl
    l = edgePart[1]
  }

  // Match: ID <open-bracket-or-paren> <quote>label<quote> <close> [:::class]
  // The "open" / "close" characters include `/` for parallelograms
  // (e.g. `[/"Absorber"/]` is Mermaid's parallelogram — `[/...]` with `/` as the lean marker).
  // NOTE: must escape each `:` in `:::` so the regex engine does not interpret
  // `(?:::` as `(?::` (open non-capturing group) + `::` (two literal colons).
  const re = /^([A-Za-z_][A-Za-z0-9_]*)\s*([\[\(\{\/]{1,3})\s*"((?:[^"\\]|\\.)*)"\s*([\]\)\}\/]{1,3})\s*(?:\:\:\:([A-Za-z_][A-Za-z0-9_]*))?\s*$/
  const m = l.match(re)
  if (!m) return null
  const [, id, open, label, close, className] = m
  // Detect parallelogram explicitly: `[/.../]` or `[/...\]` or `[\...\]` etc.
  // Anything containing a `/` in either open or close (and matching brackets) is a parallelogram.
  let shape
  if (open.includes('[') && close.includes(']') && (open.includes('/') || close.includes('/'))) {
    shape = '[/]'
  } else if (open.includes('{') && close.includes('}')) {
    shape = '{}'
  } else if (open.includes('(') && close.includes(')') && open.length > 1) {
    shape = '[()]'
  } else if (open.includes('(') && close.includes(')')) {
    shape = '(())'
  } else if (open.includes('[') && close.includes(']')) {
    shape = '[]'
  } else {
    shape = `${open[0]}${close[close.length - 1]}`
  }
  return { id, label, shape, className: className || '' }
}

/**
 * Split a target token into a bare id + optional inline declaration.
 * Input might be: "B" (bare) or "B((...))" (id with inline shape) or "B[...]:class".
 * In our usage, inline declarations on edges only appear with no class:
 *   SEQ(("Geological<br/>storage")) or WASTE(["to atmosphere"])
 */
function splitTargetOrDecl(token) {
  const t = token.trim()
  // Try "ID((...))" or "ID[...]" or "ID{{...}}" — inline with no class
  const inlineRe = /^([A-Za-z_][A-Za-z0-9_]*)\s*([\[\(\{]{1,3})\s*"((?:[^"\\]|\\.)*)"\s*([\]\)\}]{1,3})\s*$/
  const m = t.match(inlineRe)
  if (m) {
    const [, id, open, label, close] = m
    return {
      targetId: id,
      targetDecl: { id, label, shape: `${open[0]}${close[close.length - 1]}`, className: '' },
    }
  }
  // Also "ID[.../]:::class" with class
  const inlineClassRe = /^([A-Za-z_][A-Za-z0-9_]*)\s*([\[\(\{]{1,3})\s*"((?:[^"\\]|\\.)*)"\s*([\]\)\}]{1,3})\s*\:\:\:\s*([A-Za-z_][A-Za-z0-9_]*)\s*$/
  const mc = t.match(inlineClassRe)
  if (mc) {
    const [, id, open, label, close, className] = mc
    return {
      targetId: id,
      targetDecl: { id, label, shape: `${open[0]}${close[close.length - 1]}`, className: className || '' },
    }
  }
  return { targetId: t, targetDecl: null }
}

function ensureNodeFromId(id, nodes, decl) {
  if (nodes.has(id)) return nodes.get(id).id
  if (decl) {
    nodes.set(id, decl)
  } else {
    // Implicit node — bare id with no label/class info
    nodes.set(id, { id, label: id, shape: '[]', className: '' })
  }
  return id
}

// ===========================================================================
// Apply class/shape rules to determine kind/stage
// ===========================================================================

function classifyNode(node) {
  const shape = node.shape || '[]'
  const className = node.className || ''
  const label = node.label || node.id
  const id = node.id

  // Implicit WASTE/SEQ double-circle → STORAGE / WASTE based on id
  if (id === 'WASTE') return { kind: NODE_KIND.WASTE, stage: STAGE.BYPRODUCT }
  if (id === 'SEQ') return { kind: NODE_KIND.STORAGE, stage: STAGE.STORAGE }

  // Hexagonal {{...}} → STORAGE (sequestered output)
  if (shape === '{}') return { kind: NODE_KIND.STORAGE, stage: STAGE.STORAGE }

  // Cylindrical [("...")] with sorb/bio class → MATERIAL (default via class)
  if (shape === '[]') {
    const base = CLASS_MAP[className] || [NODE_KIND.INPUT, STAGE.INPUT]
    return { kind: base[0], stage: base[1] }
  }

  // Parallelogram [/.../] with equip class — apply label-based override
  if (shape === '[/]') {
    for (const o of EQUIP_LABEL_OVERRIDE) {
      if (o.kw.test(label)) return { kind: o.kind, stage: o.stage }
    }
    const base = CLASS_MAP[className] || [NODE_KIND.CAPTURE, STAGE.CAPTURE]
    return { kind: base[0], stage: base[1] }
  }

  // Cylindrical [("...")] (database/cylinder shape)
  if (shape === '[()]') {
    const base = CLASS_MAP[className] || [NODE_KIND.MATERIAL, STAGE.CAPTURE]
    return { kind: base[0], stage: base[1] }
  }

  // Default: use class mapping
  const base = CLASS_MAP[className] || [NODE_KIND.INPUT, STAGE.INPUT]
  return { kind: base[0], stage: base[1] }
}

// ===========================================================================
// Process graph construction
// ===========================================================================

function buildProcessGraph(pathwayId, mermaidSource) {
  const { nodes: rawNodes, edges: rawEdges } = parseFlowchart(mermaidSource)

  // Build typed nodes
  const nodes = []
  const idMap = new Map() // mermaid id → node:stable
  for (const raw of rawNodes) {
    const { kind, stage } = classifyNode(raw)
    const stableId = `node:${sanitize(raw.id)}`
    idMap.set(raw.id, stableId)
    nodes.push({
      id: stableId,
      label: raw.label || raw.id,
      kind,
      stage,
      material_ids: [],
      source_refs: [],
      metric_keys: [],
    })
  }

  // Apply pathway-specific material rules
  const materialRules = PATHWAY_MATERIAL_RULES[pathwayId] || []
  for (const rule of materialRules) {
    const ids = rule.id.split('|')
    for (const rawId of ids) {
      if (idMap.has(rawId)) {
        const stable = idMap.get(rawId)
        const node = nodes.find((n) => n.id === stable)
        if (node && !node.material_ids.includes(rule.materialId)) {
          node.material_ids.push(rule.materialId)
        }
      }
    }
  }

  // Apply primary-capture metric_keys (just `trl`)
  const primaryRaw = PRIMARY_CAPTURE_NODE[pathwayId]
  if (primaryRaw && idMap.has(primaryRaw)) {
    const stable = idMap.get(primaryRaw)
    const node = nodes.find((n) => n.id === stable)
    if (node) node.metric_keys.push('trl')
  }

  // Build typed edges
  const edges = rawEdges.map((e, i) => ({
    id: `edge:e${i + 1}`,
    source_node_id: idMap.get(e.source_node_id) || e.source_node_id,
    target_node_id: idMap.get(e.target_node_id) || e.target_node_id,
    kind: e.kind,
    label: e.label,
    isDotted: e.isDotted,
  }))

  // Resolve edges that close FLOW cycles → FEEDBACK.
  // The validator rejects cycles in FLOW edges. Per the rubric, recycle /
  // regeneration edges (including the dotted edges that close physical
  // cycles like atmospheric exchange or heat input to a regenerator) are
  // FEEDBACK. We find the strongly-connected components in the FLOW graph
  // and promote dotted edges inside an SCC to FEEDBACK until the FLOW
  // subgraph becomes a DAG.
  promoteCycleEdgesToFeedback(edges)

  // Recompute cycle policy
  const hasFeedback = edges.some((e) => e.kind === EDGE_KIND.FEEDBACK)
  const finalPolicy = hasFeedback ? CYCLE_POLICY.RECYCLE_ALLOWED : CYCLE_POLICY.ACYCLIC

  return { cycle_policy: finalPolicy, nodes, edges }
}

// Break cycles in the FLOW subgraph by promoting cycle-forming edges to
// FEEDBACK. Prefer dotted edges (they're usually the recycle/regeneration
// legs in Mermaid); fall back to non-dotted if needed.
function promoteCycleEdgesToFeedback(edges) {
  // Build adjacency (only FLOW edges)
  const flowEdges = edges.filter((e) => e.kind === EDGE_KIND.FLOW)
  const nodes = new Set(edges.flatMap((e) => [e.source_node_id, e.target_node_id]))

  for (let safety = 0; safety < 50; safety++) {
    if (isFlowAcyclic(flowEdges, nodes)) return
    // Find a cycle via DFS
    const cycle = findCycle(flowEdges, nodes)
    if (!cycle) return // shouldn't happen
    // Pick an edge in the cycle to demote to FEEDBACK
    // Prefer dotted edges (they're the recycle legs in Mermaid syntax)
    const candidate =
      cycle.find((e) => e.isDotted) ??
      cycle.find((e) => /recycle|regenerat|return/i.test(e.label)) ??
      cycle[cycle.length - 1]
    candidate.kind = EDGE_KIND.FEEDBACK
    // Remove from flowEdges for next iteration
    const idx = flowEdges.indexOf(candidate)
    if (idx >= 0) flowEdges.splice(idx, 1)
  }
}

function isFlowAcyclic(flowEdges, nodes) {
  const indeg = new Map()
  for (const n of nodes) indeg.set(n, 0)
  const adj = new Map()
  for (const n of nodes) adj.set(n, [])
  for (const e of flowEdges) {
    adj.get(e.source_node_id).push(e.target_node_id)
    indeg.set(e.target_node_id, indeg.get(e.target_node_id) + 1)
  }
  const queue = [...indeg.entries()].filter(([, d]) => d === 0).map(([id]) => id)
  let processed = 0
  while (queue.length) {
    const id = queue.pop()
    processed++
    for (const t of adj.get(id)) {
      const d = indeg.get(t) - 1
      indeg.set(t, d)
      if (d === 0) queue.push(t)
    }
  }
  return processed === nodes.size
}

function findCycle(flowEdges, nodes) {
  // Iterative DFS that returns the first cycle found (as a list of edges).
  for (const start of nodes) {
    const stack = [[start, []]]
    const onStack = new Map()
    while (stack.length) {
      const [id, path] = stack.pop()
      onStack.set(id, path)
      for (const e of flowEdges) {
        if (e.source_node_id !== id) continue
        const tgt = e.target_node_id
        if (onStack.has(tgt)) {
          // Found cycle: tgt was visited earlier on this stack
          const tgtPath = onStack.get(tgt)
          // The cycle is tgtPath + [e from tgt onward]
          // Walk forward from tgtPath to current path collecting edges
          const cycleStart = tgtPath
          const allEdges = []
          let cur = tgt
          for (let i = cycleStart.length; i < path.length; i++) {
            const edge = flowEdges.find(
              (fe) => fe.source_node_id === cur && fe.target_node_id === path[i],
            )
            if (edge) allEdges.push(edge)
            cur = path[i]
          }
          // Add the closing edge to tgt
          const close = flowEdges.find((fe) => fe.source_node_id === cur && fe.target_node_id === tgt)
          if (close) allEdges.push(close)
          return allEdges
        }
        stack.push([tgt, [...path, id]])
      }
    }
    onStack.clear()
  }
  return null
}

// ===========================================================================
// Sequence diagram parsing
// ===========================================================================

function parseSequence(source) {
  const lines = source.split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('%%'))
  if (lines[0] && /^sequenceDiagram/i.test(lines[0])) lines.shift()

  const nodes = new Map() // handle → { id, label, summary }
  const edges = []
  const edgeCounter = { i: 0 }
  let lastMessageTarget = null

  for (const line of lines) {
    // participant X as Label
    let m = line.match(/^participant\s+([A-Za-z_][A-Za-z0-9_]*)(?:\s+as\s+(.+))?$/i)
    if (m) {
      const handle = m[1]
      const label = (m[2] || handle).trim()
      nodes.set(handle, { handle, label, summary: '' })
      continue
    }

    // Note over X[,Y]: text — append to the prior participant's summary
    // (the most recent message target). For a single-handle note, also
    // attach to that handle. This keeps Notes anchored to a real node.
    m = line.match(/^Note\s+over\s+([A-Za-z_][A-Za-z0-9_,\s]*?):\s*(.+)$/i)
    if (m) {
      const handles = m[1].split(',').map((s) => s.trim())
      const text = m[2].trim()
      const target = handles.length === 1 ? handles[0] : lastMessageTarget
      if (target && nodes.has(target)) {
        const node = nodes.get(target)
        node.summary = node.summary ? `${node.summary}\n${text}` : text
      }
      continue
    }

    // Note right of X: text — same handling
    m = line.match(/^Note\s+right\s+of\s+([A-Za-z_][A-Za-z0-9_]*):\s*(.+)$/i)
    if (m) {
      const handle = m[1]
      const text = m[2].trim()
      if (nodes.has(handle)) {
        const node = nodes.get(handle)
        node.summary = node.summary ? `${node.summary}\n${text}` : text
      }
      continue
    }

    // Message edge: A->>B: text  or  A-->>B: text  or  A->B: text
    m = line.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*(--?>>?|->)\s*([A-Za-z_][A-Za-z0-9_]*)\s*:\s*(.+)$/)
    if (m) {
      const [, src, , tgt, message] = m
      // Ensure both nodes exist (in case a message precedes declaration — unusual)
      if (!nodes.has(src)) nodes.set(src, { handle: src, label: src, summary: '' })
      if (!nodes.has(tgt)) nodes.set(tgt, { handle: tgt, label: tgt, summary: '' })
      const isSelf = src === tgt
      // dashed return counts as MESSAGE per rubric; only self-loop → SELF_TRANSITION
      const kind = isSelf ? EDGE_KIND.SELF_TRANSITION : EDGE_KIND.MESSAGE
      const eid = `edge:op${++edgeCounter.i}`
      edges.push({
        id: eid,
        source_node_id: `node:${sanitize(src)}`,
        target_node_id: `node:${sanitize(tgt)}`,
        kind,
        label: message.trim(),
      })
      lastMessageTarget = tgt
      continue
    }
  }

  const nodeList = [...nodes.values()].map((n) => ({
    id: `node:${sanitize(n.handle)}`,
    label: n.label,
    kind: NODE_KIND.SEQ_PART,
    stage: STAGE.UNSPECIFIED,
    summary: n.summary,
    material_ids: [],
    source_refs: [],
    metric_keys: [],
  }))

  return { nodes: nodeList, edges }
}

function buildOperationalGraph(mermaidSeqSource) {
  const { nodes, edges } = parseSequence(mermaidSeqSource)
  const hasSelf = edges.some((e) => e.kind === EDGE_KIND.SELF_TRANSITION)
  // Always RECYCLE_ALLOWED per rubric
  const cyclePolicy = hasSelf || true ? CYCLE_POLICY.RECYCLE_ALLOWED : CYCLE_POLICY.ACYCLIC
  return { cycle_policy: cyclePolicy, nodes, edges }
}

// ===========================================================================
// Driver
// ===========================================================================

function processPathway(file) {
  const full = path.join(DIR, file)
  const doc = parse(fs.readFileSync(full, 'utf8'))
  const pid = doc.id
  if (!doc.mermaid_source || !doc.mermaid_sequence_source) {
    throw new Error(`${file}: missing mermaid source`)
  }
  const processGraph = buildProcessGraph(pid, doc.mermaid_source)
  const operationalGraph = buildOperationalGraph(doc.mermaid_sequence_source)
  return { doc, processGraph, operationalGraph }
}

function main() {
  const files = fs.readdirSync(DIR).filter((f) => f.endsWith('.yaml')).sort()
  let total = 0
  for (const file of files) {
    try {
      const { doc, processGraph, operationalGraph } = processPathway(file)
      doc.process_graph = processGraph
      doc.operational_graph = operationalGraph
      const out = stringify(doc, { lineWidth: 0, defaultKeyType: 'PLAIN', defaultStringType: 'PLAIN' })
      fs.writeFileSync(path.join(DIR, file), out)
      total++
      console.log(`${file}: process=${processGraph.nodes.length}n/${processGraph.edges.length}e, op=${operationalGraph.nodes.length}n/${operationalGraph.edges.length}e`)
    } catch (e) {
      console.error(`FAIL ${file}: ${(e).stack || e}`)
      process.exit(1)
    }
  }
  console.log(`\nConverted ${total} pathways`)
}

main()