import { ShortlistStatus } from '@/lib/gen/carbon/v1/research_pb'

export const ALLOWED_TRANSITIONS: Record<string, string[]> = {
  CANDIDATE: ['UNDER_EVALUATION', 'ELIMINATED', 'CHOSEN'],
  UNDER_EVALUATION: ['ELIMINATED', 'CHOSEN'],
  ELIMINATED: ['UNDER_EVALUATION'],   // reconsidering is allowed
  CHOSEN: [],
}
export function assertTransition(from: string, to: string): void {
  if (!(to in ShortlistStatus) || to === 'SHORTLIST_STATUS_UNSPECIFIED')
    throw new Error(`unknown status: ${to}`)
  if (from === '' || from === 'SHORTLIST_STATUS_UNSPECIFIED') return   // fresh entry
  if (from !== to && !ALLOWED_TRANSITIONS[from]?.includes(to))
    throw new Error(`illegal transition ${from} -> ${to}`)
}
export function normalizeRationale(text: string): string {
  return text.trim().slice(0, 5000)
}
