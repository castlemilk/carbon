'use client'

import { useCallback, useEffect, useState } from 'react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

interface CitationCard {
  id: string
  title: string
  authors: string[]
  year: number
  venue: string
  url: string
}

type Freshness = 'fresh' | 'stale' | 'error'

interface LiteraturePayload {
  freshness: Freshness
  fetchedAt: number
  works: CitationCard[]
}

const truncateTitle = (title: string, max = 90): string =>
  title.length > max ? `${title.slice(0, max - 1).trimEnd()}…` : title

const requestLiterature = async (pathwayId: string): Promise<LiteraturePayload> => {
  const res = await fetch(`/api/literature/${encodeURIComponent(pathwayId)}`)
  if (!res.ok) throw new Error(`literature request failed (${res.status})`)
  return (await res.json()) as LiteraturePayload
}

export default function LiteraturePanel({ pathwayId }: { pathwayId: string }) {
  const [loading, setLoading] = useState(true)
  const [data, setData] = useState<LiteraturePayload | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    requestLiterature(pathwayId)
      .then((payload) => setData(payload))
      .catch(() => {
        // never throw to the page — surface as unavailable
        if (!controller.signal.aborted) setData({ freshness: 'error', fetchedAt: 0, works: [] })
      })
    return () => controller.abort()
  }, [pathwayId])

  const retry = useCallback(() => {
    setLoading(true)
    requestLiterature(pathwayId)
      .then((payload) => setData(payload))
      .catch(() => setData({ freshness: 'error', fetchedAt: 0, works: [] }))
  }, [pathwayId])

  const freshness = data?.freshness ?? null

  return (
    <Card data-testid="literature-panel">
      <CardHeader className="flex-row items-center justify-between gap-2">
        <CardTitle>Literature</CardTitle>
        {freshness === 'fresh' && data && data.fetchedAt > 0 && (
          <Badge data-testid="literature-fresh-badge" variant="secondary">
            {`as of ${new Date(data.fetchedAt).toLocaleDateString(undefined, { dateStyle: 'medium' })}`}
          </Badge>
        )}
        {freshness === 'stale' && (
          <Badge data-testid="literature-stale-badge" variant="outline" className="border-amber-500/50 text-amber-600 dark:text-amber-400">
            Cached · refreshing
          </Badge>
        )}
        {freshness === 'error' && (
          <Badge data-testid="literature-error-badge" variant="outline" className="border-amber-500/50 text-amber-600 dark:text-amber-400">
            Literature unavailable
          </Badge>
        )}
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {loading && (
          <div aria-hidden className="flex flex-col gap-2">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-12 animate-pulse rounded-md bg-muted" />
            ))}
          </div>
        )}
        {!loading && freshness === 'error' && (
          <div className="flex items-center gap-3 text-sm text-muted-foreground">
            Could not reach OpenAlex. Try again later.
            <Button size="sm" variant="outline" data-testid="literature-retry" onClick={retry}>
              Retry
            </Button>
          </div>
        )}
        {!loading && freshness === 'stale' && data && (
          <div className="flex items-center gap-3">
            <span className="text-xs text-muted-foreground">Showing cached results while we refresh.</span>
            <Button size="sm" variant="outline" data-testid="literature-retry" onClick={retry}>
              Retry
            </Button>
          </div>
        )}
        {!loading && data && (freshness === 'fresh' || freshness === 'stale') && (
          <>
            {data.works.map((work) => (
              <div key={work.id} data-testid="literature-card" className="flex flex-col gap-0.5 border-b pb-3 last:border-b-0 last:pb-0">
                <a
                  href={work.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  title={work.title}
                  className="w-fit font-medium underline-offset-4 hover:underline"
                >
                  {truncateTitle(work.title || work.id)}
                </a>
                <span className="text-xs text-muted-foreground">
                  {work.authors.length > 0 ? `${work.authors.join(', ')} et al.` : 'Unknown authors'}
                  {' · '}
                  {[work.venue, work.year > 0 ? work.year : null].filter(Boolean).join(' ')}
                </span>
              </div>
            ))}
            {data.works.length === 0 && (
              <p data-testid="literature-empty" className="py-4 text-center text-sm text-muted-foreground">
                No literature found.
              </p>
            )}
          </>
        )}
      </CardContent>
    </Card>
  )
}
