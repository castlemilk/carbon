import Board, { type ShortlistRow } from '@/components/decision/board'
import Journal, { type JournalRow } from '@/components/decision/journal'
import { openDb } from '@/lib/db/instance'
import { listJournal, listPathways, listShortlist } from '@/lib/db/repos'
import { EntryKind, ShortlistStatus } from '@/lib/gen/carbon/v1/research_pb'

export default async function DecisionPage() {
  const db = openDb()
  const nameMap: Record<string, string> = Object.fromEntries(
    listPathways(db).map((p) => [p.id, p.name]),
  )

  // hydrated enums are numeric — convert to names before handing plain rows to clients
  const shortlistRows: ShortlistRow[] = listShortlist(db).map((s) => ({
    pathwayId: s.entry.pathwayId,
    status: ShortlistStatus[s.entry.status] ?? 'SHORTLIST_STATUS_UNSPECIFIED',
    rationale: s.entry.rationale,
    updatedAt: s.entry.updatedAt,
    existsInSeed: s.existsInSeed,
  }))
  const journalRows: JournalRow[] = listJournal(db).map((j) => ({
    id: j.id,
    kind: EntryKind[j.kind] ?? 'ENTRY_KIND_UNSPECIFIED',
    title: j.title,
    bodyMarkdown: j.bodyMarkdown,
    pathwayRefs: [...j.pathwayRefs],
    createdAt: j.createdAt,
  }))

  return (
    <div className="flex min-h-screen flex-col gap-10 p-8">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Decision Space</h1>
        <p className="max-w-2xl text-sm text-muted-foreground">
          Converge on a pathway: shortlist candidates from their detail pages, weigh
          them here, and record the reasoning behind every move.
        </p>
      </header>
      <Board entries={shortlistRows} nameMap={nameMap} />
      <Journal entries={journalRows} pathwayNames={nameMap} />
    </div>
  )
}
