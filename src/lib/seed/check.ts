import { openDb } from '../db'
import { seedFromDataDir } from './loader'

const db = openDb(':memory:')
try {
  const counts = seedFromDataDir(db, process.argv[2] ?? 'data')
  console.log('OK', counts)
} catch (e) {
  console.error((e as Error).message)
  process.exit(1)
}
