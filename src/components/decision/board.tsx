'use client'

import Link from 'next/link'
import { useState, useTransition } from 'react'

import { setShortlistStatus } from '@/lib/actions/research-actions'
import { ALLOWED_TRANSITIONS } from '@/lib/actions/shortlist-guard'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { SHORTLIST_STATUSES, STATUS_LABELS } from '@/lib/settings'

export interface ShortlistRow {
  pathwayId: string
  /** ShortlistStatus enum NAME (server converts the hydrated numeric enum) */
  status: string
  rationale: string
  updatedAt: string
  existsInSeed: boolean
}

// moves that deserve a recorded reason get a small optional-rationale dialog first
const RATIONALE_PROMPT_TARGETS = new Set(['UNDER_EVALUATION', 'CHOSEN'])

const moveOptions = (current: string): string[] => [
  ...new Set([current, ...(ALLOWED_TRANSITIONS[current] ?? [])]),
]

export default function Board({
  entries,
  nameMap,
}: {
  entries: ShortlistRow[]
  nameMap: Record<string, string>
}) {
  const [dialog, setDialog] = useState<{ pathwayId: string; target: string } | null>(null)
  const [rationale, setRationale] = useState('')
  const [errorByPathway, setErrorByPathway] = useState<Record<string, string>>({})
  const [pending, startTransition] = useTransition()

  // rows render straight from server props; the action's revalidatePath converges the UI
  const setErrorFor = (pathwayId: string, message: string | null) =>
    setErrorByPathway((prev) => {
      if (message === null) {
        const next = { ...prev }
        delete next[pathwayId]
        return next
      }
      return { ...prev, [pathwayId]: message }
    })

  const applyMove = (row: ShortlistRow, target: string, nextRationale: string) => {
    startTransition(async () => {
      try {
        await setShortlistStatus(row.pathwayId, row.status, target, nextRationale)
        setErrorFor(row.pathwayId, null)
        setDialog(null)
        setRationale('')
      } catch (e) {
        setErrorFor(row.pathwayId, e instanceof Error ? e.message : 'Failed to move pathway')
      }
    })
  }

  const requestMove = (row: ShortlistRow, target: string | null) => {
    if (target === null || target === row.status) return
    setErrorFor(row.pathwayId, null)
    if (RATIONALE_PROMPT_TARGETS.has(target)) {
      setRationale('')
      setDialog({ pathwayId: row.pathwayId, target })
      return
    }
    // no dialog: carry the existing rationale forward so it is never silently lost
    applyMove(row, target, row.rationale)
  }

  const confirmMove = () => {
    if (!dialog || pending) return
    const row = entries.find((r) => r.pathwayId === dialog.pathwayId)
    if (row) applyMove(row, dialog.target, rationale)
  }

  const dialogError = dialog ? errorByPathway[dialog.pathwayId] : undefined

  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-lg font-semibold tracking-tight">Shortlist board</h2>

      {entries.length === 0 && (
        <p data-testid="board-empty" className="text-sm text-muted-foreground">
          Shortlist a pathway from its detail page to begin converging.
        </p>
      )}

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {SHORTLIST_STATUSES.map((status) => {
          const columnRows = entries.filter((r) => r.status === status)
          return (
            <Card
              key={status}
              size="sm"
              data-testid={`column-${status}`}
              className="min-h-32 gap-2 bg-muted/30 px-2 py-2"
            >
              <header className="flex items-center justify-between px-1 pt-0.5">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {STATUS_LABELS[status]}
                </h3>
                <Badge variant="outline">{columnRows.length}</Badge>
              </header>
              {columnRows.map((row) => (
                <EntryCard
                  key={row.pathwayId}
                  row={row}
                  name={nameMap[row.pathwayId] ?? row.pathwayId}
                  pending={pending}
                  error={errorByPathway[row.pathwayId]}
                  onSelect={(target) => requestMove(row, target)}
                />
              ))}
              {columnRows.length === 0 && (
                <p className="px-1 pb-1 text-xs text-muted-foreground">Nothing here yet.</p>
              )}
            </Card>
          )
        })}
      </div>

      <Dialog
        open={dialog !== null}
        onOpenChange={(nextOpen) => {
          if (!pending && !nextOpen) setDialog(null)
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Move to {dialog ? STATUS_LABELS[dialog.target] ?? dialog.target : ''}
            </DialogTitle>
            <DialogDescription>Record an optional rationale for this decision.</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="move-rationale">Rationale</Label>
            <Textarea
              id="move-rationale"
              data-testid="move-rationale"
              value={rationale}
              onChange={(e) => setRationale(e.target.value)}
              placeholder="Why this move? e.g. sorbent lifetime unproven at scale…"
            />
          </div>
          {dialogError && (
            <p data-testid="board-error" className="text-sm text-destructive">
              {dialogError}
            </p>
          )}
          <DialogFooter>
            <Button variant="outline" disabled={pending} onClick={() => setDialog(null)}>
              Cancel
            </Button>
            <Button data-testid="move-confirm" disabled={pending} onClick={confirmMove}>
              {pending ? 'Saving…' : 'Confirm'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  )
}

function EntryCard({
  row,
  name,
  error,
  pending,
  onSelect,
}: {
  row: ShortlistRow
  name: string
  error?: string
  pending: boolean
  onSelect: (target: string | null) => void
}) {
  const tombstone = !row.existsInSeed

  return (
    <Card
      size="sm"
      data-testid={`shortlist-entry-${row.pathwayId}`}
      className={tombstone ? 'gap-2 bg-muted/60 opacity-90' : 'gap-2'}
    >
      <CardContent className="flex flex-col gap-2">
        {tombstone ? (
          <>
            <span data-testid="board-tombstone-name" className="font-mono text-sm text-muted-foreground">
              {row.pathwayId}
            </span>
            <span className="text-xs italic text-muted-foreground">
              removed from seed — rationale preserved
            </span>
          </>
        ) : (
          <Link
            href={`/pathways/${row.pathwayId}`}
            data-testid="board-entry-name"
            className="w-fit font-medium underline-offset-4 hover:underline"
          >
            {name}
          </Link>
        )}

        {row.rationale && (
          <p data-testid="board-rationale" className="line-clamp-2 text-xs text-muted-foreground">
            {row.rationale}
          </p>
        )}

        {!tombstone && (
          <Select value={row.status} onValueChange={(v) => onSelect(v)} disabled={pending}>
            <SelectTrigger
              size="sm"
              aria-label={`Move ${name}`}
              data-testid={`move-select-${row.pathwayId}`}
              className="w-fit max-w-full"
            >
              {/* explicit label: Base UI renders the raw value until items mount */}
              <SelectValue>{STATUS_LABELS[row.status] ?? row.status}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              {moveOptions(row.status).map((s) => (
                <SelectItem key={s} value={s}>
                  {s === row.status ? `${STATUS_LABELS[s] ?? s} (current)` : STATUS_LABELS[s] ?? s}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        <time className="text-[11px] text-muted-foreground" dateTime={row.updatedAt}>
          updated {formatDate(row.updatedAt)}
        </time>

        {error && (
          <p data-testid="board-error" className="text-xs text-destructive">
            {error}
          </p>
        )}
      </CardContent>
    </Card>
  )
}

const formatDate = (iso: string): string => {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString(undefined, { dateStyle: 'medium' })
}
