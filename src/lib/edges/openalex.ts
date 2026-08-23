import { create } from '@bufbuild/protobuf'
import { CitationSchema, type Citation } from '@/lib/gen/carbon/v1/common_pb'

const OPENALEX_WORKS_URL = 'https://api.openalex.org/works'

export interface OpenAlexAuthorship {
  author?: { display_name?: string }
}

export interface OpenAlexWork {
  id?: string
  display_name?: string
  authorships?: OpenAlexAuthorship[]
  publication_year?: number
  doi?: string | null
  primary_location?: { source?: { display_name?: string } | null } | null
}

// search = first non-empty of (terms[0], name)
export const buildQuery = (name: string, terms: string[]): string => {
  const search = [terms[0], name].find((candidate) => candidate && candidate.trim().length > 0) ?? name
  const params = [
    `search=${encodeURIComponent(search)}`,
    'per-page=8',
    'select=id,display_name,authorships,publication_year,doi,primary_location',
    'mailto=research@local',
  ]
  return `${OPENALEX_WORKS_URL}?${params.join('&')}`
}

export const normalizeWork = (work: OpenAlexWork): Citation => ({
  ...create(CitationSchema),
  id: `openalex:${(work.id ?? '').replace(/^https:\/\/openalex\.org\//, '')}`,
  title: work.display_name ?? '',
  authors: (work.authorships ?? [])
    .map((a) => a.author?.display_name ?? '')
    .filter((name) => name.length > 0)
    .slice(0, 5),
  year: work.publication_year ?? 0,
  venue: work.primary_location?.source?.display_name ?? '',
  url: work.doi ?? work.id ?? '',
})

export async function fetchWorks(name: string, terms: string[] = []): Promise<Citation[]> {
  if (process.env.CARBON_SIMULATE_OUTAGE) throw new Error('simulated outage')
  const response = await fetch(buildQuery(name, terms), { signal: AbortSignal.timeout(8000) })
  if (!response.ok) throw new Error(`openalex responded ${response.status}`)
  const body = (await response.json()) as { results?: OpenAlexWork[] }
  return (body.results ?? []).map(normalizeWork)
}
