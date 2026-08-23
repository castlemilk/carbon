'use client'

import { useRouter } from 'next/navigation'
import { useMemo, useState } from 'react'

import { axisLabel, formatRange, type Range } from '@/lib/format'
import { SETTING_COLORS, SETTING_LABELS } from '@/lib/settings'
import { makeScales, projectPoint } from '@/lib/scatter'

export interface PlotPoint {
  id: string
  name: string
  setting: string
  isBenchmark: boolean
  x: number
  y: number
  xRange?: Range | undefined
  yRange?: Range | undefined
}

interface Props {
  points: PlotPoint[]
  xKey: string
  yKey: string
  logX: boolean
  search: string
}

const W = 800
const H = 420
const M = { top: 12, right: 16, bottom: 40, left: 64 }
const PW = W - M.left - M.right
const PH = H - M.top - M.bottom

const fmtTick = (v: number) =>
  new Intl.NumberFormat('en', { notation: 'compact', maximumSignificantDigits: 3 }).format(v)

const ticks = (d: readonly [number, number], n = 5): number[] =>
  Array.from({ length: n }, (_, i) => d[0] + ((d[1] - d[0]) * i) / (n - 1))

export default function ScatterPlot({ points, xKey, yKey, logX, search }: Props) {
  const router = useRouter()
  const [hovered, setHovered] = useState<string | null>(null)

  const scales = useMemo(
    () => makeScales(points.map((p) => ({ id: p.id, x: p.x, y: p.y })), { w: PW, h: PH, logX }),
    [points, logX],
  )
  const projected = points.map((p) => ({ p, ...projectPoint({ id: p.id, x: p.x, y: p.y }, scales) }))
  const legendSettings = [...new Set(points.map((p) => p.setting))]
  const hover = projected.find((e) => e.p.id === hovered)

  const valueLabel = (key: string, v: number, range?: Range) =>
    range ? formatRange(range) : key === 'trl' ? `${v}` : fmtTick(v)

  if (points.length === 0)
    return (
      <div className="flex h-56 items-center justify-center rounded-lg border border-dashed text-sm text-muted-foreground">
        No pathways match — adjust filters or axes.
      </div>
    )

  return (
    <div>
      <div className="relative w-full">
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={`${axisLabel(yKey)} vs ${axisLabel(xKey)} scatter plot`}>
          <g transform={`translate(${M.left},${M.top})`}>
            {ticks(scales.xDomain).map((t, i) => {
              const x = scales.sx(t)
              return (
                <g key={`xt-${i}`}>
                  <line x1={x} y1={0} x2={x} y2={PH} stroke="currentColor" className="text-border" strokeWidth={1} />
                  <text x={x} y={PH + 18} textAnchor="middle" fontSize={11} fill="currentColor" className="text-muted-foreground">
                    {fmtTick(t)}
                  </text>
                </g>
              )
            })}
            {ticks(scales.yDomain).map((t, i) => {
              const y = scales.sy(t)
              return (
                <g key={`yt-${i}`}>
                  <line x1={0} y1={y} x2={PW} y2={y} stroke="currentColor" className="text-border" strokeWidth={1} />
                  <text x={-10} y={y + 4} textAnchor="end" fontSize={11} fill="currentColor" className="text-muted-foreground">
                    {fmtTick(t)}
                  </text>
                </g>
              )
            })}
            <line x1={0} y1={PH} x2={PW} y2={PH} stroke="currentColor" className="text-foreground/30" />
            <line x1={0} y1={0} x2={0} y2={PH} stroke="currentColor" className="text-foreground/30" />
            <text x={PW / 2} y={H - 6} textAnchor="middle" fontSize={12} fill="currentColor" className="text-muted-foreground">
              {axisLabel(xKey)}{logX ? ' (log)' : ''}
            </text>
            <text x={-PH / 2} y={-M.left + 14} textAnchor="middle" fontSize={12} fill="currentColor" className="text-muted-foreground" transform="rotate(-90)">
              {axisLabel(yKey)}
            </text>

            {projected.map(({ p, cx, cy }) => (
              <g key={p.id} transform={`translate(${cx},${cy})`} className="cursor-pointer"
                onClick={() => router.push(`/pathways/${p.id}?back=${encodeURIComponent(search)}`, { scroll: false })}
                onMouseEnter={() => setHovered(p.id)} onMouseLeave={() => setHovered(null)}>
                <title>{p.name}</title>
                {p.isBenchmark && <circle r={11} fill="none" stroke="currentColor" className="text-foreground/50" strokeWidth={1.5} />}
                <circle data-testid="dot" data-id={p.id} r={7} fill={SETTING_COLORS[p.setting] ?? '#a1a1aa'}>
                  <title>{p.name}</title>
                </circle>
              </g>
            ))}
          </g>
        </svg>

        {hover && (
          <div
            data-testid="hover-card"
            className="pointer-events-none absolute z-10 max-w-56 rounded-md border bg-popover px-3 py-2 text-xs shadow-md"
            style={{
              left: `${((M.left + hover.cx) / W) * 100}%`,
              top: `${((M.top + hover.cy) / H) * 100}%`,
              transform: 'translate(-50%, calc(-100% - 14px))',
            }}
          >
            <p className="font-medium">{hover.p.name}</p>
            <p className="mt-1 text-muted-foreground">{axisLabel(xKey)}: {valueLabel(xKey, hover.p.x, hover.p.xRange)}</p>
            <p className="text-muted-foreground">{axisLabel(yKey)}: {valueLabel(yKey, hover.p.y, hover.p.yRange)}</p>
          </div>
        )}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-muted-foreground">
        {legendSettings.map((s) => (
          <span key={s} className="flex items-center gap-1.5">
            <span className="size-2.5 rounded-full" style={{ backgroundColor: SETTING_COLORS[s] ?? '#a1a1aa' }} />
            {SETTING_LABELS[s] ?? s}
          </span>
        ))}
        <span className="flex items-center gap-1.5">
          <span className="inline-block size-3 rounded-full border-[1.5px] border-foreground/50" />
          Benchmark
        </span>
      </div>
    </div>
  )
}
