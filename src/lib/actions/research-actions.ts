'use server'

import { revalidatePath } from 'next/cache'

import { openDb } from '@/lib/db/instance'
import { deleteJournal, upsertJournal, upsertShortlist } from '@/lib/db/repos'
import { EntryKind, ShortlistStatus } from '@/lib/gen/carbon/v1/research_pb'

import { assertTransition, normalizeRationale } from './shortlist-guard'

export async function setShortlistStatus(
  pathwayId: string,
  from: string,
  to: keyof typeof ShortlistStatus,
  rationale: string,
) {
  assertTransition(from, to)
  const db = openDb()
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
  kind: keyof typeof EntryKind,
  title: string,
  body: string,
  refs: string[],
) {
  const db = openDb()
  upsertJournal(db, {
    id: crypto.randomUUID(),
    kind,
    title,
    bodyMarkdown: body,
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
