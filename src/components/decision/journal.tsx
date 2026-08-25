'use client'

import Link from 'next/link'
import { PlusIcon, Trash2Icon } from 'lucide-react'
import { useState, useTransition } from 'react'

import ReactMarkdown from 'react-markdown'

import { addJournalEntry, deleteJournalEntry } from '@/lib/actions/research-actions'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { ENTRY_KIND_LABELS } from '@/lib/settings'

export interface JournalRow {
  id: string
  /** EntryKind enum NAME (server converts the hydrated numeric enum) */
  kind: string
  title: string
  bodyMarkdown: string
  pathwayRefs: string[]
  createdAt: string
}

export default function Journal({
  entries,
  pathwayNames,
}: {
  entries: JournalRow[]
  pathwayNames: Record<string, string>
}) {
  const [dialogOpen, setDialogOpen] = useState(false)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const [kind, setKind] = useState('')
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [refs, setRefs] = useState<ReadonlySet<string>>(new Set())
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const toggleRef = (id: string) =>
    setRefs((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  const create = () => {
    setError(null)
    startTransition(async () => {
      try {
        await addJournalEntry(kind, title, body, [...refs])
        setDialogOpen(false)
        setKind('')
        setTitle('')
        setBody('')
        setRefs(new Set())
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to create entry')
      }
    })
  }

  // two-click confirm: first click arms, second click (on the same entry) deletes
  const remove = (id: string) => {
    if (confirmDeleteId !== id) {
      setConfirmDeleteId(id)
      return
    }
    setConfirmDeleteId(null)
    setError(null)
    startTransition(async () => {
      try {
        await deleteJournalEntry(id)
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to delete entry')
      }
    })
  }

  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold tracking-tight">Decision journal</h2>
        <Button size="sm" data-testid="new-entry" onClick={() => setDialogOpen(true)}>
          <PlusIcon data-icon="inline-start" />
          New entry
        </Button>
      </div>

      {error && !dialogOpen && (
        <p data-testid="journal-error" className="text-sm text-destructive">
          {error}
        </p>
      )}

      {entries.length === 0 ? (
        <p data-testid="journal-empty" className="text-sm text-muted-foreground">
          No entries yet — record observations, comparisons, and decisions as you evaluate.
        </p>
      ) : (
        <ol data-testid="journal-timeline" className="flex max-w-3xl flex-col gap-6 border-l pl-6">
          {entries.map((entry) => (
            <li key={entry.id} data-testid={`journal-entry-${entry.id}`} className="relative">
              <span
                aria-hidden
                className="absolute top-1.5 -left-[28px] size-2 rounded-full bg-border"
              />
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <Badge variant="secondary" data-testid="journal-kind">
                  {ENTRY_KIND_LABELS[entry.kind] ?? entry.kind}
                </Badge>
                <h3 className="font-medium">{entry.title}</h3>
                <time className="ml-auto text-xs text-muted-foreground" dateTime={entry.createdAt}>
                  {formatDate(entry.createdAt)}
                </time>
                <Button
                  variant={confirmDeleteId === entry.id ? 'destructive' : 'ghost'}
                  size={confirmDeleteId === entry.id ? 'sm' : 'icon-sm'}
                  aria-label={
                    confirmDeleteId === entry.id
                      ? `Confirm delete ${entry.title}`
                      : `Delete ${entry.title}`
                  }
                  title={confirmDeleteId === entry.id ? 'Click again to confirm' : 'Delete entry'}
                  data-testid="journal-delete"
                  data-armed={confirmDeleteId === entry.id || undefined}
                  disabled={pending}
                  onClick={() => remove(entry.id)}
                >
                  {confirmDeleteId === entry.id ? 'Confirm delete' : <Trash2Icon />}
                </Button>
              </div>

              {entry.bodyMarkdown && (
                <div className="mt-1 text-sm leading-relaxed text-muted-foreground [&_code]:rounded [&_code]:bg-muted [&_code]:px-1 [&_li]:mt-0.5 [&_p+p]:mt-2 [&_strong]:text-foreground [&_ul]:list-disc [&_ul]:pl-5">
                  <ReactMarkdown>{entry.bodyMarkdown}</ReactMarkdown>
                </div>
              )}

              {entry.pathwayRefs.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {entry.pathwayRefs.map((ref) =>
                    pathwayNames[ref] ? (
                      <Badge key={ref} variant="outline" render={<Link href={`/pathways/${ref}`} />}>
                        {pathwayNames[ref]}
                      </Badge>
                    ) : (
                      <Badge
                        key={ref}
                        variant="outline"
                        className="italic text-muted-foreground"
                        title={ref}
                      >
                        removed from seed
                      </Badge>
                    ),
                  )}
                </div>
              )}
            </li>
          ))}
        </ol>
      )}

      <Dialog
        open={dialogOpen}
        onOpenChange={(nextOpen) => {
          if (!pending) setDialogOpen(nextOpen)
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>New journal entry</DialogTitle>
            <DialogDescription>
              Capture the reasoning behind your evaluation — markdown is supported.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="journal-kind">Kind</Label>
              <Select value={kind} onValueChange={(v) => setKind(v ?? '')}>
                <SelectTrigger id="journal-kind" data-testid="journal-kind" className="w-full">
                  <SelectValue placeholder="Choose a kind…" />
                </SelectTrigger>
                <SelectContent>
                  {Object.keys(ENTRY_KIND_LABELS).map((k) => (
                    <SelectItem key={k} value={k}>
                      {ENTRY_KIND_LABELS[k]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="journal-title">Title</Label>
              <Input
                id="journal-title"
                data-testid="journal-title"
                value={title}
                maxLength={200}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Eliminating amine scrubbing at point source"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="journal-body">Notes</Label>
              <Textarea
                id="journal-body"
                data-testid="journal-body"
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder="What did you learn? What did you decide?"
                className="min-h-24"
              />
            </div>

            <fieldset className="flex flex-col gap-1.5">
              <legend className="text-sm font-medium">Linked pathways</legend>
              <div className="max-h-40 overflow-y-auto rounded-lg border p-2">
                <div className="flex flex-col gap-1">
                  {Object.entries(pathwayNames)
                    .sort(([, a], [, b]) => a.localeCompare(b))
                    .map(([id, name]) => (
                      <Label key={id} className="flex cursor-pointer items-center gap-2 py-0.5 font-normal text-sm">
                        <Checkbox
                          checked={refs.has(id)}
                          onCheckedChange={() => toggleRef(id)}
                          data-testid={`journal-ref-${id}`}
                        />
                        {name}
                      </Label>
                    ))}
                </div>
              </div>
            </fieldset>

            {error && (
              <p data-testid="journal-error" className="text-sm text-destructive">
                {error}
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" disabled={pending} onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              data-testid="journal-create"
              disabled={pending || !kind || !title.trim()}
              onClick={create}
            >
              {pending ? 'Saving…' : 'Create entry'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  )
}

const formatDate = (iso: string): string => {
  const d = new Date(iso)
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
}
