import { after } from 'next/server'

import type { Citation } from '@/lib/gen/carbon/v1/common_pb'
import type { Pathway } from '@/lib/gen/carbon/v1/pathway_pb'

import { getLitCache, putLitCache } from '@/lib/db/repos'

import { fetchWorks } from './openalex'

const TTL_MS = 7 * 24 * 3600 * 1000

export interface LiteratureResult {
  freshness: 'fresh' | 'stale' | 'error'
  fetchedAt: number
  works: Citation[]
}

export async function getLiterature(pathway: Pathway): Promise<LiteratureResult> {
  const cached = await getLitCache(pathway.id)
  if (cached && Date.now() - cached.fetchedAt < TTL_MS) {
    return { freshness: 'fresh', fetchedAt: cached.fetchedAt, works: JSON.parse(cached.worksJson) }
  }
  if (cached) {
    // stale-while-revalidate: return cache now, refresh after response flushes
    after(() => { void refresh(pathway) })
    return { freshness: 'stale', fetchedAt: cached.fetchedAt, works: JSON.parse(cached.worksJson) }
  }
  const refreshed = await refresh(pathway) // cold: block once so panel fills
  return refreshed
    ? refreshed
    : { freshness: 'error', fetchedAt: Date.now(), works: [] }
}

async function refresh(pathway: Pathway): Promise<LiteratureResult | null> {
  try {
    const works = await fetchWorks(pathway.name, pathway.searchTerms)
    // single timestamp shared by the stored row and the cold-path response
    const now = Date.now()
    await putLitCache(pathway.id, now, JSON.stringify(works))
    return { freshness: 'fresh', fetchedAt: now, works }
  } catch {
    return null
  }
}
