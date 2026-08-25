import { getStore } from './instance'
import type {
  CachedLiterature, JournalUpsert, SeedPayload, ShortlistRow, ShortlistUpsert,
} from './store'
import type { Pathway } from '@/lib/gen/carbon/v1/pathway_pb'
import type { Material } from '@/lib/gen/carbon/v1/material_pb'
import type { Citation } from '@/lib/gen/carbon/v1/common_pb'
import type { JournalEntry } from '@/lib/gen/carbon/v1/research_pb'

// Thin async wrappers over the active store (Sqlite locally, Turso when
// CARBON_DB_URL is set). Server components and server actions await these.

export const getPathway = (id: string): Promise<Pathway | undefined> => getStore().getPathway(id)
export const listPathways = (): Promise<Pathway[]> => getStore().listPathways()
export const getMaterial = (id: string): Promise<Material | undefined> => getStore().getMaterial(id)
export const listMaterials = (): Promise<Material[]> => getStore().listMaterials()
export const getCitation = (id: string): Promise<Citation | undefined> => getStore().getCitation(id)

export const putShortlist = (e: ShortlistUpsert): Promise<void> => getStore().putShortlist(e)
export const listShortlist = (): Promise<ShortlistRow[]> => getStore().listShortlist()
export const putJournal = (e: JournalUpsert): Promise<void> => getStore().putJournal(e)
export const listJournal = (): Promise<JournalEntry[]> => getStore().listJournal()
export const deleteJournal = (id: string): Promise<void> => getStore().deleteJournal(id)

export const putLitCache = (pathwayId: string, fetchedAt: number, worksJson: string): Promise<void> =>
  getStore().putLitCache(pathwayId, fetchedAt, worksJson)
export const getLitCache = (pathwayId: string): Promise<CachedLiterature | null> =>
  getStore().getLitCache(pathwayId)

/** validate-all-then-replace seeding; runtime tables untouched */
export const replaceSeed = (payload: SeedPayload) => getStore().replaceSeed(payload)
