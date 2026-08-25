import { makeSqliteStore } from './sqlite-store'
import { createTursoStore } from './turso-store'
import type { CarbonStore } from './store'

let instance: CarbonStore | undefined

/**
 * Process-wide store singleton. Selection contract:
 * - CARBON_DB_URL starting with libsql:// or https:// → TursoStore (hosted, e.g. Vercel)
 * - otherwise → SqliteStore on CARBON_DB (default ./carbon.db) for local dev/tests
 */
export function getStore(): CarbonStore {
  if (!instance) {
    const url = process.env.CARBON_DB_URL
    if (url && (url.startsWith('libsql://') || url.startsWith('https://'))) {
      instance = createTursoStore({ url, authToken: process.env.CARBON_DB_TOKEN })
    } else {
      instance = makeSqliteStore(process.env.CARBON_DB)
    }
  }
  return instance
}

/** test seam — forget the cached singleton so a new env picks up */
export function resetStoreForTests(): void {
  instance = undefined
}
