import path from 'node:path'

export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return
  if (process.env.NEXT_PHASE === 'phase-production-build') return
  const { openDb } = await import('@/lib/db')
  const { seedFromDataDir, findSeedDrift } = await import('@/lib/seed/loader')
  const db = openDb(process.env.CARBON_DB)
  const counts = seedFromDataDir(db, path.join(process.cwd(), 'data'))
  console.log('[seed]', counts)
  for (const drift of findSeedDrift(db)) console.warn('[seed] drift:', drift)
}
