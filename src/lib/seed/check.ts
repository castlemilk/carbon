import { openDb } from '../db'
import { seedFromDataDir } from './loader'

const db = openDb(':memory:')
try {
  const counts = seedFromDataDir(db, process.argv[2] ?? 'data')
  console.log('OK', counts)
  if (!counts.citations && !counts.materials && !counts.pathways)
    console.error('WARNING: no seed documents found — nothing was loaded (is the data dir correct?)')
} catch (e) {
  console.error((e as Error).message)
  process.exit(1)
}
