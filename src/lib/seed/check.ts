import { makeSqliteStore } from '../db/sqlite-store'
import { seedFromDataDir } from './loader'

const usage = 'usage: tsx src/lib/seed/check.ts [dataDir] [--allow-partial-graphs]'

const args = process.argv.slice(2)
const unknownFlags = args.filter((a) => a.startsWith('--') && a !== '--allow-partial-graphs')
if (unknownFlags.length) {
  console.error(`unknown flag${unknownFlags.length > 1 ? 's' : ''}: ${unknownFlags.join(', ')}\n${usage}`)
  process.exit(2)
}
const allowPartialGraphs = args.includes('--allow-partial-graphs')
const dataDir = args.find((a) => !a.startsWith('--')) ?? 'data'
const EXPECTED_PATHWAY_COUNT = 24
const store = makeSqliteStore(':memory:')
try {
  await store.initSchema()
   const counts = await seedFromDataDir(store, dataDir, { requireCompleteGraphs: !allowPartialGraphs })
   if (!allowPartialGraphs && counts.pathways !== EXPECTED_PATHWAY_COUNT) {
     throw new Error(`expected ${EXPECTED_PATHWAY_COUNT} pathways in strict mode, found ${counts.pathways}`)
   }
  const { landscapeGraph, landscapeNodeCount, ...rest } = counts
  console.log('OK', {
    ...rest,
    landscapeGraph: landscapeGraph ? `${landscapeNodeCount} nodes/${landscapeGraph.edges.length} edges` : 'absent',
  })
  if (!counts.citations && !counts.materials && !counts.pathways)
    console.error('WARNING: no seed documents found — nothing was loaded (is the data dir correct?)')
} catch (e) {
  console.error((e as Error).message)
  process.exit(1)
} finally {
  await store.close()
}
