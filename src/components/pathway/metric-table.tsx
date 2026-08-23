import { axisLabel, formatRange } from '@/lib/format'

export interface MetricRow {
  low: number
  high: number
  unit: string
  yearBasis: number
  sourceRef: string
}

export interface CitationSummary {
  id: string
  title: string
  authors: string[]
  year: number
  venue: string
  url: string
}

interface Props {
  metrics: Record<string, MetricRow>
  citationsById: Record<string, CitationSummary>
  keyLabel?: string
  humanizeKey?: (key: string) => string
  emptyMessage?: string
}

// axisLabel covers the known plot keys; anything else falls back to Title Case
export const titleCaseKey = (key: string): string =>
  key
    .split('_')
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')

const humanizeMetric = (key: string): string => {
  const label = axisLabel(key)
  if (label !== key) return label
  return titleCaseKey(key)
}

const truncateTitle = (title: string, max = 80): string =>
  title.length > max ? `${title.slice(0, max - 1).trimEnd()}…` : title

// generic cited-range table; pathway metrics and material properties share the shape
export default function MetricTable({
  metrics,
  citationsById,
  keyLabel = 'Metric',
  humanizeKey = humanizeMetric,
  emptyMessage = 'No metrics recorded for this pathway.',
}: Props) {
  return (
    <div className="overflow-x-auto rounded-lg border">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b bg-muted/50 text-left text-xs text-muted-foreground">
            <th className="w-[22%] px-3 py-2 font-medium">{keyLabel}</th>
            <th className="w-[22%] px-3 py-2 font-medium">Range</th>
            <th className="w-[12%] px-3 py-2 font-medium">Year basis</th>
            <th className="px-3 py-2 font-medium">Source</th>
          </tr>
        </thead>
        <tbody>
          {Object.entries(metrics).map(([key, m]) => {
            const citation = citationsById[m.sourceRef]
            return (
              <tr key={key} data-testid="metric-row" data-metric={key} className="border-b last:border-b-0 align-top">
                <th scope="row" className="px-3 py-2 text-left font-medium">
                  {humanizeKey(key)}
                </th>
                <td className="px-3 py-2 tabular-nums">{formatRange({ low: m.low, high: m.high, unit: m.unit })}</td>
                <td className="px-3 py-2 tabular-nums">{m.yearBasis > 0 ? m.yearBasis : '—'}</td>
                <td className="px-3 py-2">
                  {citation ? (
                    <>
                      <a
                        href={citation.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        title={citation.title}
                        className="font-medium underline-offset-4 hover:underline"
                      >
                        {truncateTitle(citation.title)}
                      </a>
                      <span className="mt-0.5 block text-xs text-muted-foreground">
                        {[citation.venue, citation.year > 0 ? citation.year : null].filter(Boolean).join(' · ')}
                      </span>
                    </>
                  ) : (
                    <span className="text-xs text-muted-foreground">{m.sourceRef || '—'}</span>
                  )}
                </td>
              </tr>
            )
          })}
          {Object.keys(metrics).length === 0 && (
            <tr>
              <td colSpan={4} className="px-3 py-8 text-center text-muted-foreground">
                {emptyMessage}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  )
}
