import { GraphNodeKind } from '@/lib/gen/carbon/v1/graph_pb'

export const SEMANTIC_ROLES = [
  'emission-source',
  'capture-column',
  'sorbent-material',
  'membrane-module',
  'electrochemical-unit',
  'heat-regeneration',
  'separation',
  'compression-transport',
  'storage-mineralization',
  'biological-ocean',
  'waste-byproduct',
] as const

export type SemanticRole = (typeof SEMANTIC_ROLES)[number]

export const ROLE_BY_KIND: Partial<Record<GraphNodeKind, SemanticRole>> = {
  [GraphNodeKind.INPUT]: 'emission-source',
  [GraphNodeKind.CAPTURE]: 'capture-column',
  [GraphNodeKind.MATERIAL]: 'sorbent-material',
  [GraphNodeKind.MEMBRANE]: 'membrane-module',
  [GraphNodeKind.CONVERSION]: 'capture-column',
  [GraphNodeKind.ELECTROCHEMICAL]: 'electrochemical-unit',
  [GraphNodeKind.REGENERATION]: 'heat-regeneration',
  [GraphNodeKind.SEPARATION]: 'separation',
  [GraphNodeKind.TRANSPORT]: 'compression-transport',
  [GraphNodeKind.STORAGE]: 'storage-mineralization',
  [GraphNodeKind.BIOLOGICAL]: 'biological-ocean',
  [GraphNodeKind.WASTE]: 'waste-byproduct',
}

export const ASSET_BASE_PATH = '/graph-assets'

export type AssetStatus = 'available' | 'needs_review' | 'not_generated' | 'missing'

export interface ManifestEntry {
  role: SemanticRole
  file: string
  status: AssetStatus
  qa?: string | null
}

export interface AssetManifest {
  provider: 'brandbrain'
  session_id: string
  plan_node_id: string
  flow_revision: number
  manifest_revision: number
  manifest_hash: string
  approved: boolean
  generated: boolean
  run_ids: string[]
  attempt_ids: string[]
  items: ManifestEntry[]
  semantic_role_to_file: Partial<Record<SemanticRole, string>>
}

const ROLES = new Set<string>(SEMANTIC_ROLES)
const STATUSES = new Set<AssetStatus>(['available', 'needs_review', 'not_generated', 'missing'])

export type AssetResolution = { ok: true; url: string; file: string } | { ok: false; reason: string }

const FILE_RE = /^[a-z0-9][a-z0-9_-]{0,63}\.png$/

export function resolveAssetFile(file: unknown): AssetResolution {
  if (typeof file !== 'string' || file.length === 0) {
    return { ok: false, reason: 'file must be a non-empty string' }
  }
  if (file.includes('/') || file.includes('\\') || file.includes('..')) {
    return { ok: false, reason: `unsafe path segment: ${file}` }
  }
  if (file.startsWith('.') || file.includes(':')) {
    return { ok: false, reason: `unsafe file name: ${file}` }
  }
  if (!FILE_RE.test(file)) {
    return { ok: false, reason: `unexpected file name (single png stem required): ${file}` }
  }
  return { ok: true, url: `${ASSET_BASE_PATH}/${file}`, file }
}

export function assetForRole(manifest: AssetManifest, role: SemanticRole): AssetResolution {
  const entry = manifest.items.find((e) => e.role === role)
  if (!entry) return { ok: false, reason: `no manifest entry for role ${role}` }
  return resolveAssetFile(manifest.semantic_role_to_file[role] ?? entry.file)
}

export function parseAssetManifest(json: unknown): AssetManifest {
  if (typeof json !== 'object' || json === null || Array.isArray(json)) {
    throw new Error('asset manifest must be an object')
  }
  const value = json as Record<string, unknown>
  if (value.provider !== 'brandbrain') throw new Error('unsupported manifest provider')
  const requireString = (key: string): string => {
    const v = value[key]
    if (typeof v !== 'string' || v.length === 0) throw new Error(`manifest ${key} must be a non-empty string`)
    return v
  }
  const requireNumber = (key: string): number => {
    const v = value[key]
    if (typeof v !== 'number' || !Number.isFinite(v)) throw new Error(`manifest ${key} must be a finite number`)
    return v
  }
  const requireStringArray = (key: string): string[] => {
    const v = value[key]
    if (!Array.isArray(v) || v.some((item) => typeof item !== 'string' || item.length === 0)) {
      throw new Error(`manifest ${key} must be an array of non-empty strings`)
    }
    return [...v]
  }
  const manifest: AssetManifest = {
    provider: 'brandbrain',
    session_id: requireString('session_id'),
    plan_node_id: requireString('plan_node_id'),
    flow_revision: requireNumber('flow_revision'),
    manifest_revision: requireNumber('manifest_revision'),
    manifest_hash: requireString('manifest_hash'),
    approved: value.approved === true,
    generated: value.generated === true,
    run_ids: requireStringArray('run_ids'),
    attempt_ids: requireStringArray('attempt_ids'),
    items: [],
    semantic_role_to_file: {},
  }
  const items = value.items
  if (!Array.isArray(items)) throw new Error('manifest items must be an array')
  const seen = new Set<SemanticRole>()
  for (const raw of items) {
    if (typeof raw !== 'object' || raw === null) throw new Error('manifest item must be an object')
    const item = raw as Record<string, unknown>
    if (typeof item.role !== 'string' || !ROLES.has(item.role)) {
      throw new Error(`unknown role: ${String(item.role)}`)
    }
    if (seen.has(item.role as SemanticRole)) throw new Error(`duplicate role: ${item.role}`)
    const fileResolution = resolveAssetFile(item.file)
    if (!fileResolution.ok) throw new Error(fileResolution.reason)
    if (typeof item.status !== 'string' || !STATUSES.has(item.status as AssetStatus)) {
      throw new Error(`invalid status for ${item.role}`)
    }
    seen.add(item.role as SemanticRole)
    manifest.items.push({
      role: item.role as SemanticRole,
      file: fileResolution.file,
      status: item.status as AssetStatus,
      qa: typeof item.qa === 'string' ? item.qa : null,
    })
  }
  const roleMap = value.semantic_role_to_file
  if (typeof roleMap !== 'object' || roleMap === null || Array.isArray(roleMap)) {
    throw new Error('manifest semantic_role_to_file must be an object')
  }
  for (const [role, file] of Object.entries(roleMap)) {
    if (!ROLES.has(role)) throw new Error(`unknown mapped role: ${role}`)
    const fileResolution = resolveAssetFile(file)
    if (!fileResolution.ok) throw new Error(fileResolution.reason)
    manifest.semantic_role_to_file[role as SemanticRole] = fileResolution.file
  }
  return manifest
}

export function roleForNode(id: string, kind?: string, explicitAssetId?: string): string | undefined {
  if (explicitAssetId) return explicitAssetId
  if (kind === undefined) return undefined
  const enumKind = GRAPH_NODE_KIND_BY_NAME[kind]
  return enumKind === undefined ? undefined : ROLE_BY_KIND[enumKind]
}

const GRAPH_NODE_KIND_BY_NAME: Partial<Record<string, GraphNodeKind>> = Object.fromEntries(
  Object.entries(GraphNodeKind)
    .filter(([, v]) => Number.isInteger(v))
    .map(([name, value]) => [name, value as GraphNodeKind]),
)

export function isSemanticRole(value: string): value is SemanticRole {
  return ROLES.has(value)
}
