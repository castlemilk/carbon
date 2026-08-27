import type { Citation } from '@/lib/gen/carbon/v1/common_pb'

export interface CitationBadgeProps {
  citation: Pick<Citation, 'id' | 'title' | 'authors' | 'year' | 'venue' | 'url'>
  /** Compact pill used in tables/landscape (truncate aggressively). */
  variant?: 'pill' | 'inline'
  className?: string
}

const truncate = (s: string, max: number): string =>
  s.length > max ? `${s.slice(0, max - 1).trimEnd()}…` : s

const shortAuthor = (authors: string[]): string => {
  if (authors.length === 0) return 'Unknown'
  const first = authors[0] ?? ''
  const lastSpace = first.lastIndexOf(' ')
  return lastSpace > 0 ? first.slice(lastSpace + 1) : first
}

/**
 * Clickable citation chip. Two variants:
 * - pill: rounded badge with author + year (for tables and landscape rows)
 * - inline: compact "Author (year)" link with hover underline (for prose)
 */
export function CitationBadge({ citation, variant = 'pill', className = '' }: CitationBadgeProps) {
  const author = shortAuthor(citation.authors)
  const year = citation.year > 0 ? citation.year : ''
  const baseTitle = [author, year].filter(Boolean).join(' ')
  const fullTitle = [baseTitle, citation.title].filter(Boolean).join(' — ')
  const href = citation.url || '#'

  if (variant === 'inline') {
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        title={fullTitle}
        className={
          'inline-flex items-baseline gap-1 whitespace-nowrap text-[var(--color-fg)] ' +
          'underline-offset-4 hover:underline ' +
          className
        }
      >
        <span>{author || citation.id}</span>
        {year && <span className="text-[var(--color-muted)]">({year})</span>}
      </a>
    )
  }

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      title={fullTitle}
      className={
        'inline-flex max-w-full items-center gap-1.5 rounded-full border border-[var(--color-border)] ' +
        'bg-[var(--color-surface-2)] px-2.5 py-0.5 font-mono text-[11px] text-[var(--color-fg)] ' +
        'transition-colors hover:border-[var(--color-fg)] hover:bg-[var(--color-surface)] ' +
        className
      }
    >
      <span className="truncate">
        {author && <span className="font-medium">{truncate(author, 22)}</span>}
        {author && year && <span className="text-[var(--color-muted)]">, </span>}
        {year && <span className="text-[var(--color-muted)]">{year}</span>}
        {!author && !year && <span>{truncate(citation.title, 30) || citation.id}</span>}
      </span>
    </a>
  )
}

/** Inline citation list — for prose contexts. Renders "[Author (year), Author (year)]". */
export function CitationList({
  citations,
  separator = ', ',
  className = '',
}: {
  citations: CitationBadgeProps['citation'][]
  separator?: string
  className?: string
}) {
  if (citations.length === 0) return null
  return (
    <span className={'inline-flex flex-wrap items-baseline gap-x-1 gap-y-0.5 ' + className}>
      {citations.map((c, i) => (
        <span key={c.id} className="inline-flex items-baseline">
          {i > 0 && <span className="text-[var(--color-muted)]">{separator}</span>}
          <CitationBadge citation={c} variant="inline" />
        </span>
      ))}
    </span>
  )
}
