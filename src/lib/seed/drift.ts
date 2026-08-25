import { makeSqliteStore } from '../db/sqlite-store'
import { seedFromDataDir } from './loader'

// Compare the committed seed corpus against the local working database's
// user tables. Read-only on carbon.db.
const mem = makeSqliteStore(':memory:')
const disk = makeSqliteStore('carbon.db')
try {
  await mem.initSchema()
  await seedFromDataDir(mem, process.argv[2] ?? 'data')
  await disk.initSchema()
  const ids = new Set((await mem.listPathways()).map(p => p.id))
  const drifted: string[] = []
  for (const s of await disk.listShortlist())
    if (!ids.has(s.entry.pathwayId)) drifted.push(`shortlist:${s.entry.pathwayId} (status ${s.entry.status})`)
  for (const j of await disk.listJournal())
    for (const r of j.pathwayRefs) if (!ids.has(r)) drifted.push(`journal:${r}`)
  console.log(drifted.length ? drifted.join('\n') : 'no drift')
} catch (e) {
  console.error((e as Error).message)
  process.exit(1)
} finally {
  await mem.close()
  await disk.close()
}
