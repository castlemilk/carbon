import path from 'node:path'

export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return
  if (process.env.NEXT_PHASE === 'phase-production-build') return
  const { getStore } = await import('@/lib/db/instance')
  const { seedFromDataDir } = await import('@/lib/seed/loader')
  const store = getStore()
  await store.initSchema()
  const dataDir = path.join(process.cwd(), 'data')
  const counts = await seedFromDataDir(store, dataDir)
  if (counts.pathways === 0)
    throw new Error(`no pathways loaded from ${dataDir} — check working directory / data dir`)
  console.log('[seed]', counts)
  for (const drift of await store.seedDrift()) console.warn('[seed] drift:', drift)
}
