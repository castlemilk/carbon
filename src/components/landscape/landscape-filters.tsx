'use client'

import { useRouter } from 'next/navigation'

import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { AXIS_KEYS, axisLabel, type AxisKey } from '@/lib/format'
import { SETTING_LABELS, SETTING_ORDER } from '@/lib/settings'

interface Props {
  search: string
  xKey: string
  yKey: string
  logX: boolean
  settings: string[]
  minTrl: number
  benchmarkOnly: boolean
}

const axisOptions: AxisKey[] = [...AXIS_KEYS, 'trl']

export default function LandscapeFilters(props: Props) {
  const router = useRouter()
  const { search, xKey, yKey, logX, settings, minTrl, benchmarkOnly } = props

  const push = (mutate: (q: URLSearchParams) => void) => {
    const q = new URLSearchParams(search)
    mutate(q)
    router.push(`/?${q.toString()}`, { scroll: false })
  }
  const setOrDelete = (key: string, value: string | null) => (q: URLSearchParams) => {
    if (value === null || (key === 'minTrl' && value === '0')) q.delete(key)
    else q.set(key, value)
  }

  const toggleSetting = (s: string) =>
    push((q) => {
      const next = q.has('settings')
        ? new Set(q.get('settings')!.split(',').filter(Boolean))
        : new Set(SETTING_ORDER)
      if (next.has(s)) next.delete(s)
      else next.add(s)
      if (next.size === 0 || next.size === SETTING_ORDER.length) q.delete('settings')
      else q.set('settings', [...next].join(','))
    })

  return (
    <div className="flex flex-wrap items-end gap-x-6 gap-y-4">
      <div className="flex items-center gap-2">
        <Label htmlFor="axis-x" className="text-muted-foreground">X</Label>
        <Select value={xKey} onValueChange={(v) => push(setOrDelete('x', v === 'cost' ? null : v))}>
          <SelectTrigger id="axis-x" className="w-44" data-testid="axis-x">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {axisOptions.map((k) => (
              <SelectItem key={k} value={k}>{axisLabel(k)}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex items-center gap-2">
        <Label htmlFor="axis-y" className="text-muted-foreground">Y</Label>
        <Select value={yKey} onValueChange={(v) => push(setOrDelete('y', v === 'trl' ? null : v))}>
          <SelectTrigger id="axis-y" className="w-44" data-testid="axis-y">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {axisOptions.map((k) => (
              <SelectItem key={k} value={k}>{axisLabel(k)}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Label className="cursor-pointer font-normal text-sm">
        <Checkbox checked={logX} onCheckedChange={(c) => push(setOrDelete('logX', c ? '1' : null))} data-testid="log-x" />
        Log X
      </Label>

      <div className="flex items-center gap-2">
        <Label htmlFor="min-trl" className="text-muted-foreground">Min TRL</Label>
        <Select value={String(minTrl)} onValueChange={(v) => push(setOrDelete('minTrl', v))}>
          <SelectTrigger id="min-trl" className="w-16" data-testid="min-trl">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => (
              <SelectItem key={n} value={String(n)}>{n}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Label className="cursor-pointer font-normal text-sm">
        <Checkbox checked={benchmarkOnly} onCheckedChange={(c) => push(setOrDelete('benchmark', c ? '1' : null))} data-testid="filter-benchmark" />
        Benchmark only
      </Label>

      <fieldset className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <legend className="sr-only">Settings filter</legend>
        {SETTING_ORDER.map((s) => {
          const active = settings.length === 0 || settings.includes(s)
          return (
            <Label key={s} className="cursor-pointer font-normal text-sm">
              <Checkbox
                checked={active}
                onCheckedChange={() => toggleSetting(s)}
                data-testid={`filter-setting-${s}`}
              />
              {SETTING_LABELS[s]}
            </Label>
          )
        })}
      </fieldset>
    </div>
  )
}
