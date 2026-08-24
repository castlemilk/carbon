import { EntryKind } from '@/lib/gen/carbon/v1/research_pb'

export const TITLE_MAX_LENGTH = 200
export const BODY_MAX_LENGTH = 20000

// hydrated proto enums are numeric; a numeric string ('3') would otherwise satisfy the
// `in` check via the enum's reverse mapping and silently alias a different kind name
const NUMERIC_STRING = /^\d+$/

export function assertEntryKind(kind: string): void {
  if (!kind || NUMERIC_STRING.test(kind) || !(kind in EntryKind) || kind === 'ENTRY_KIND_UNSPECIFIED')
    throw new Error(`unknown entry kind: ${kind || '(empty)'}`)
}

export function normalizeTitle(title: string): string {
  const trimmed = title.trim()
  if (!trimmed) throw new Error('title must not be empty')
  return trimmed.slice(0, TITLE_MAX_LENGTH)
}

export function normalizeBody(body: string): string {
  return body.slice(0, BODY_MAX_LENGTH)
}

export function assertPathwayRefs(refs: readonly string[], knownPathwayIds: ReadonlySet<string>): void {
  for (const ref of refs)
    if (!knownPathwayIds.has(ref)) throw new Error(`unknown pathway ref: ${ref}`)
}
