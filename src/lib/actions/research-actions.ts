'use server'

import { revalidatePath } from 'next/cache'

import { openDb } from '@/lib/db/instance'
import { deleteJournal, getPathway, listPathways, upsertJournal, upsertShortlist } from '@/lib/db/repos'

import { assertEntryKind, assertPathwayRefs, normalizeBody, normalizeTitle } from './journal-guard'
import { assertTransition, normalizeRationale } from './shortlist-guard'

export async function setShortlistStatus(
  pathwayId: string,
  from: string,
  to: string,
  rationale: string,
) {
  assertTransition(from, to)
  const db = openDb()
  if (!getPathway(db, pathwayId)) throw new Error(`unknown pathway: ${pathwayId}`)
  upsertShortlist(db, {
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
  const db = openDb()
  assertPathwayRefs(refs, new Set(listPathways(db).map((p) => p.id)))
  upsertJournal(db, {
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
  const db = openDb()
  deleteJournal(db, id)
  revalidatePath('/decision')
}
