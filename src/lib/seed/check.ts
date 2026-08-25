import { makeSqliteStore } from '../db/sqlite-store'
import { seedFromDataDir } from './loader'

const store = makeSqliteStore(':memory:')
try {
  await store.initSchema()
  const counts = await seedFromDataDir(store, process.argv[2] ?? 'data')
  console.log('OK', counts)
  if (!counts.citations && !counts.materials && !counts.pathways)
    console.error('WARNING: no seed documents found — nothing was loaded (is the data dir correct?)')
} catch (e) {
  console.error((e as Error).message)
  process.exit(1)
} finally {
  await store.close()
}
