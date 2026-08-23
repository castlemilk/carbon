import path from 'node:path'

export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return
  if (process.env.NEXT_PHASE === 'phase-production-build') return
  const { openDb } = await import('@/lib/db')
  const { seedFromDataDir, findSeedDrift } = await import('@/lib/seed/loader')
  const db = openDb(process.env.CARBON_DB)
  const dataDir = path.join(process.cwd(), 'data')
  const counts = seedFromDataDir(db, dataDir)
  if (counts.pathways === 0)
    throw new Error(`no pathways loaded from ${dataDir} — check working directory / data dir`)
  console.log('[seed]', counts)
  for (const drift of findSeedDrift(db)) console.warn('[seed] drift:', drift)
}
