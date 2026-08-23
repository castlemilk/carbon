import { after } from 'next/server'

import type { Database } from 'better-sqlite3'

import { getLitCache, putLitCache } from '@/lib/db/repos'
import type { Citation } from '@/lib/gen/carbon/v1/common_pb'
import type { Pathway } from '@/lib/gen/carbon/v1/pathway_pb'

import { fetchWorks } from './openalex'

const TTL_MS = 7 * 24 * 3600 * 1000

export interface LiteratureResult {
  freshness: 'fresh' | 'stale' | 'error'
  fetchedAt: number
  works: Citation[]
}

export async function getLiterature(db: Database, pathway: Pathway): Promise<LiteratureResult> {
  const cached = getLitCache(db, pathway.id)
  if (cached && Date.now() - cached.fetchedAt < TTL_MS) {
    return { freshness: 'fresh', fetchedAt: cached.fetchedAt, works: JSON.parse(cached.worksJson) }
  }
  if (cached) {
    // stale-while-revalidate: return cache now, refresh after response flushes
    after(() => refresh(db, pathway))
    return { freshness: 'stale', fetchedAt: cached.fetchedAt, works: JSON.parse(cached.worksJson) }
  }
  const works = await refresh(db, pathway) // cold: block once so panel fills
  return { freshness: works ? 'fresh' : 'error', fetchedAt: Date.now(), works: works ?? [] }
}

async function refresh(db: Database, pathway: Pathway): Promise<Citation[] | null> {
  try {
    const works = await fetchWorks(pathway.name, pathway.searchTerms)
    putLitCache(db, pathway.id, Date.now(), JSON.stringify(works))
    return works
  } catch {
    return null
  }
}
