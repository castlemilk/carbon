import { ShortlistStatus } from '@/lib/gen/carbon/v1/research_pb'

export const ALLOWED_TRANSITIONS: Record<string, string[]> = {
  CANDIDATE: ['UNDER_EVALUATION', 'ELIMINATED', 'CHOSEN'],
  UNDER_EVALUATION: ['ELIMINATED', 'CHOSEN'],
  ELIMINATED: ['UNDER_EVALUATION'],   // reconsidering is allowed
  CHOSEN: [],
}
// hydrated proto enums are numeric; a numeric string ('2') would otherwise satisfy the
// `in` check via the enum's reverse mapping and silently alias a different status name
const NUMERIC_STRING = /^\d+$/

export function assertTransition(from: string, to: string): void {
  for (const [label, value] of [['from', from], ['to', to]] as const)
    if (NUMERIC_STRING.test(value))
      throw new Error(`status ${label} must be a status name like 'CANDIDATE', got numeric '${value}'`)
  if (!(to in ShortlistStatus) || to === 'SHORTLIST_STATUS_UNSPECIFIED')
    throw new Error(`unknown status: ${to}`)
  if (from === '' || from === 'SHORTLIST_STATUS_UNSPECIFIED') return   // fresh entry
  if (!(from in ShortlistStatus) || from === 'SHORTLIST_STATUS_UNSPECIFIED')
    throw new Error(`unknown status: ${from}`)
  if (from !== to && !ALLOWED_TRANSITIONS[from]?.includes(to))
    throw new Error(`illegal transition ${from} -> ${to}`)
}
export function normalizeRationale(text: string): string {
  return text.trim().slice(0, 5000)
}
