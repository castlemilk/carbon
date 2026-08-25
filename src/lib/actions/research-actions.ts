'use server'

import { revalidatePath } from 'next/cache'

import { deleteJournal, getPathway, listPathways, putJournal, putShortlist } from '@/lib/db/repos'

import { assertEntryKind, assertPathwayRefs, normalizeBody, normalizeTitle } from './journal-guard'
import { assertTransition, normalizeRationale } from './shortlist-guard'

export async function setShortlistStatus(
  pathwayId: string,
  from: string,
  to: string,
  rationale: string,
) {
  assertTransition(from, to)
  if (!(await getPathway(pathwayId))) throw new Error(`unknown pathway: ${pathwayId}`)
  await putShortlist({
    pathwayId,
    status: to,
    rationale: normalizeRationale(rationale),
    updatedAt: new Date().toISOString(),
  })
  revalidatePath('/decision')
  revalidatePath(`/pathways/${pathwayId}`)
}

export async function addJournalEntry(
  kind: string,
  title: string,
  body: string,
  refs: string[],
) {
  assertEntryKind(kind)
  const cleanTitle = normalizeTitle(title)
  const cleanBody = normalizeBody(body)
  assertPathwayRefs(refs, new Set((await listPathways()).map((p) => p.id)))
  await putJournal({
    id: crypto.randomUUID(),
    kind,
    title: cleanTitle,
    bodyMarkdown: cleanBody,
    pathwayRefs: refs,
    createdAt: new Date().toISOString(),
  })
  revalidatePath('/decision')
}

export async function deleteJournalEntry(id: string) {
  await deleteJournal(id)
  revalidatePath('/decision')
}
