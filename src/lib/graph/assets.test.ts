import { describe, expect, it } from 'vitest'
import checkedInManifest from '../../../public/graph-assets/manifest.json'

import {
  ASSET_BASE_PATH,
  assetForRole,
  parseAssetManifest,
  resolveAssetFile,
  roleForNode,
  SEMANTIC_ROLES,
} from '@/lib/graph/assets'
const baseManifest = {
  provider: 'brandbrain',
  session_id: 'flow_session_e6db42e6ab3b',
  plan_node_id: 'plan',
  flow_revision: 3,
  manifest_revision: 2,
  manifest_hash: 'sha256:207aa51deaf2ad0a77a8b80d9d2456d6a2ecf9ebb5078a780f685c8a52b51159',
  approved: true,
  generated: false,
  run_ids: ['8ce3b34765696cce911100a8ab1883b3'],
  attempt_ids: [],
  items: [
    { role: 'emission-source', file: 'emission-source.png', status: 'not_generated' },
    { role: 'capture-column', file: 'capture-column.png', status: 'not_generated' },
  ],
  semantic_role_to_file: {
    'emission-source': 'emission-source.png',
    'capture-column': 'capture-column.png',
  },
}

describe('resolveAssetFile', () => {
  it('accepts a safe single-segment png stem', () => {
    expect(resolveAssetFile('capture-column.png')).toEqual({
      ok: true,
      url: `${ASSET_BASE_PATH}/capture-column.png`,
      file: 'capture-column.png',
    })
  })

  it('rejects absolute paths and parent traversal', () => {
    expect(resolveAssetFile('../secret.png').ok).toBe(false)
    expect(resolveAssetFile('/etc/passwd.png').ok).toBe(false)
    expect(resolveAssetFile('http://evil.example/x.png').ok).toBe(false)
  })

  it('rejects path separators and backslashes', () => {
    expect(resolveAssetFile('a/b.png').ok).toBe(false)
    expect(resolveAssetFile('a\\b.png').ok).toBe(false)
    expect(resolveAssetFile('..\\b.png').ok).toBe(false)
  })

  it('rejects unexpected extensions and dotfiles', () => {
    expect(resolveAssetFile('capture-column.svg').ok).toBe(false)
    expect(resolveAssetFile('capture-column.txt').ok).toBe(false)
    expect(resolveAssetFile('.hidden.png').ok).toBe(false)
    expect(resolveAssetFile('capture-column').ok).toBe(false)
  })

  it('rejects empty and non-string file values', () => {
    expect(resolveAssetFile('').ok).toBe(false)
    expect(resolveAssetFile(undefined).ok).toBe(false)
    expect(resolveAssetFile(null).ok).toBe(false)
  })
})

describe('parseAssetManifest', () => {
  it('parses a valid manifest', () => {
    const manifest = parseAssetManifest(baseManifest)
    expect(manifest.items).toHaveLength(2)
    expect(manifest.approved).toBe(true)
    expect(manifest.generated).toBe(false)
  })

  it('parses the checked-in deferred-generation scaffold', () => {
    const manifest = parseAssetManifest(checkedInManifest)
    expect(manifest.items).toHaveLength(SEMANTIC_ROLES.length)
    expect(manifest.semantic_role_to_file['capture-column']).toBe('capture-column.png')
    expect(manifest.run_ids).toContain('8ce3b34765696cce911100a8ab1883b3')
  })

  it('rejects unknown roles', () => {
    const bad = { ...baseManifest, items: [{ role: 'mystery-role', file: 'a.png', status: 'not_generated' }] }
    expect(() => parseAssetManifest(bad)).toThrow(/unknown role/)
  })

  it('rejects duplicate roles', () => {
    const bad = {
      ...baseManifest,
      items: [
        { role: 'capture-column', file: 'a.png', status: 'not_generated' },
        { role: 'capture-column', file: 'b.png', status: 'not_generated' },
      ],
    }
    expect(() => parseAssetManifest(bad)).toThrow(/duplicate role/)
  })

  it('rejects unsafe files inside the manifest', () => {
    const bad = { ...baseManifest, items: [{ role: 'capture-column', file: '../x.png', status: 'not_generated' }] }
    expect(() => parseAssetManifest(bad)).toThrow(/unsafe path/)
  })

  it('rejects invalid item status', () => {
    const bad = { ...baseManifest, items: [{ role: 'capture-column', file: 'a.png', status: 'pending' }] }
    expect(() => parseAssetManifest(bad)).toThrow(/invalid status/)
  })

  it('rejects non-brandbrain providers', () => {
    expect(() => parseAssetManifest({ ...baseManifest, provider: 'midjourney' })).toThrow(/unsupported/)
  })
})

describe('assetForRole', () => {
  it('resolves an existing role to its asset url', () => {
    const manifest = parseAssetManifest(baseManifest)
    const resolved = assetForRole(manifest, 'capture-column')
    expect(resolved.ok && resolved.url).toBe(`${ASSET_BASE_PATH}/capture-column.png`)
  })

  it('reports a missing role as a non-ok resolution so a fallback renders', () => {
    const manifest = parseAssetManifest(baseManifest)
    const resolved = assetForRole(manifest, 'biological-ocean')
    expect(resolved.ok).toBe(false)
    expect('reason' in resolved && resolved.reason).toMatch(/no manifest entry/)
  })
})

describe('SEMANTIC_ROLES', () => {
  it('matches the approved BrandBrain manifest item count', () => {
    expect(SEMANTIC_ROLES).toHaveLength(11)
  })
})

describe('roleForNode', () => {
  it('maps node kinds to semantic roles', () => {
    expect(roleForNode('n1', 'CAPTURE')).toBe('capture-column')
    expect(roleForNode('n2', 'SEPARATION')).toBe('separation')
    expect(roleForNode('n3', 'UNSPECIFIED')).toBeUndefined()
  })

  it('prefers an explicit asset id', () => {
    expect(roleForNode('n1', 'CAPTURE', 'custom-emblem')).toBe('custom-emblem')
  })
})
