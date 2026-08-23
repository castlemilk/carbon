'use client'

import { useState, useTransition } from 'react'

import { setShortlistStatus } from '@/lib/actions/research-actions'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'

export interface ShortlistEntryProps {
  status: string
  rationale: string
  updatedAt: string
}

const STATUS_LABELS: Record<string, string> = {
  CANDIDATE: 'Candidate',
  UNDER_EVALUATION: 'Under evaluation',
  ELIMINATED: 'Eliminated',
  CHOSEN: 'Chosen',
}

export default function ShortlistActions({
  pathwayId,
  entry,
}: {
  pathwayId: string
  entry: ShortlistEntryProps | null
}) {
  const [current, setCurrent] = useState(entry?.status ?? '')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [rationale, setRationale] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const shortlisted = current !== ''

  const eliminate = () => {
    setError(null)
    startTransition(async () => {
      try {
        await setShortlistStatus(pathwayId, current, 'ELIMINATED', rationale)
        setCurrent('ELIMINATED')
        setRationale('')
        setDialogOpen(false)
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to eliminate pathway')
      }
    })
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {shortlisted && (
        <Badge data-testid="shortlist-status-badge" variant="secondary">
          {STATUS_LABELS[current] ?? current}
        </Badge>
      )}
      <Button
        data-testid="shortlist-button"
        variant="outline"
        size="sm"
        disabled={shortlisted || pending}
        onClick={() => {
          setError(null)
          startTransition(async () => {
            try {
              await setShortlistStatus(pathwayId, '', 'CANDIDATE', '')
              setCurrent('CANDIDATE')
            } catch (e) {
              setError(e instanceof Error ? e.message : 'Failed to shortlist pathway')
            }
          })
        }}
      >
        {pending && !dialogOpen ? 'Saving…' : shortlisted ? 'Shortlisted' : 'Shortlist'}
      </Button>
      <Button
        data-testid="eliminate-button"
        variant="destructive"
        size="sm"
        disabled={pending}
        onClick={() => {
          setError(null)
          setDialogOpen(true)
        }}
      >
        Eliminate…
      </Button>

      <Dialog open={dialogOpen} onOpenChange={(nextOpen) => {
        if (!pending) setDialogOpen(nextOpen)
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Eliminate pathway</DialogTitle>
            <DialogDescription>
              Record why this pathway was eliminated from consideration.
            </DialogDescription>
          </DialogHeader>
          <Textarea
            data-testid="eliminate-rationale"
            value={rationale}
            onChange={(e) => setRationale(e.target.value)}
            placeholder="Why eliminated? e.g. mature baseline, not next-gen; energy penalty too high at scale…"
          />
          {error && (
            <p data-testid="shortlist-error" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <DialogFooter>
            <Button variant="outline" disabled={pending} onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button data-testid="eliminate-confirm" variant="destructive" disabled={pending} onClick={eliminate}>
              {pending ? 'Saving…' : 'Confirm'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {error && !dialogOpen && (
        <p data-testid="shortlist-error" className="w-full text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  )
}
