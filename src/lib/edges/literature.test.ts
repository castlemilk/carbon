import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Database } from 'better-sqlite3'

const { afterMock, fetchWorksMock } = vi.hoisted(() => ({
  afterMock: vi.fn<(callback: () => unknown) => void>(),
  fetchWorksMock: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
}))
vi.mock('next/server', () => ({ after: afterMock }))
vi.mock('./openalex', () => ({ fetchWorks: fetchWorksMock }))

import { openDb } from '@/lib/db/index'
import { getLitCache, putLitCache } from '@/lib/db/repos'
import { CitationSchema } from '@/lib/gen/carbon/v1/common_pb'
import { PathwaySchema } from '@/lib/gen/carbon/v1/pathway_pb'
import { create, fromJson } from '@bufbuild/protobuf'
import { getLiterature } from './literature'

const TTL_MS = 7 * 24 * 3600 * 1000

const mkPathway = () =>
  fromJson(PathwaySchema, { id: 'mof-dac', name: 'MOF DAC', setting: 'DAC', trl: 5, searchTerms: ['mof dac'] })

const mkWork = (id: string) =>
  create(CitationSchema, { id, title: `Work ${id}`, authors: ['Author'], year: 2024, venue: 'Journal', url: 'https://doi.org/x' })

describe('getLiterature', () => {
  let dir: string
  let db: Database
  let nowMs: number
  let dateSpy: ReturnType<typeof vi.spyOn>

  const tickTo = (ms: number) => {
    nowMs = ms
    dateSpy.mockReturnValue(nowMs)
  }

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'carbon-lit-'))
    db = openDb(join(dir, 'lit.db'))
    nowMs = 1_700_000_000_000
    dateSpy = vi.spyOn(Date, 'now').mockReturnValue(nowMs)
    afterMock.mockClear()
    fetchWorksMock.mockClear()
  })
  afterEach(() => {
    db.close()
    rmSync(dir, { recursive: true, force: true })
    dateSpy.mockRestore()
  })

  it('serves a row younger than TTL as fresh without calling fetchWorks', async () => {
    putLitCache(db, 'mof-dac', nowMs - 1000, JSON.stringify([mkWork('openalex:w1')]))
    const result = await getLiterature(db, mkPathway())
    expect(result.freshness).toBe('fresh')
    expect(result.fetchedAt).toBe(nowMs - 1000)
    expect(result.works[0]).toMatchObject({ id: 'openalex:w1', title: 'Work openalex:w1' })
    expect(fetchWorksMock).not.toHaveBeenCalled()
    expect(afterMock).not.toHaveBeenCalled()
  })

  it('treats age exactly equal to TTL_MS as stale (fresh window is strict age < TTL)', async () => {
    putLitCache(db, 'mof-dac', nowMs, JSON.stringify([mkWork('openalex:w1')]))
    tickTo(nowMs + TTL_MS)
    fetchWorksMock.mockResolvedValue([mkWork('openalex:w2')])
    const result = await getLiterature(db, mkPathway())
    expect(result.freshness).toBe('stale')
    expect(result.works[0]).toMatchObject({ id: 'openalex:w1' }) // cached works served
    expect(afterMock).toHaveBeenCalledTimes(1)
  })

  it('serves an old row as stale with cached works and schedules a refresh that rewrites the cache', async () => {
    putLitCache(db, 'mof-dac', nowMs - TTL_MS - 5000, JSON.stringify([mkWork('openalex:w-old')]))
    fetchWorksMock.mockResolvedValue([mkWork('openalex:w-new')])

    const result = await getLiterature(db, mkPathway())
    expect(result.freshness).toBe('stale')
    expect(result.works[0]).toMatchObject({ id: 'openalex:w-old' }) // stale payload, not refetched one
    expect(fetchWorksMock).not.toHaveBeenCalled()

    // refresh was scheduled for after response flush — run it now to verify the wiring
    expect(afterMock).toHaveBeenCalledTimes(1)
    await afterMock.mock.calls[0][0]()
    expect(fetchWorksMock).toHaveBeenCalledOnce()
    expect(fetchWorksMock.mock.calls[0]).toEqual(['MOF DAC', ['mof dac']])
    expect(getLitCache(db, 'mof-dac')?.fetchedAt).toBe(nowMs) // row rewritten with fresh timestamp
  })

  it('blocks on cold cache success: returns fresh works and writes the row', async () => {
    fetchWorksMock.mockResolvedValue([mkWork('openalex:w1')])
    const result = await getLiterature(db, mkPathway())
    expect(result.freshness).toBe('fresh')
    expect(result.fetchedAt).toBe(nowMs)
    expect(result.works[0]).toMatchObject({ id: 'openalex:w1' })
    expect(fetchWorksMock).toHaveBeenCalledOnce()

    const stored = getLitCache(db, 'mof-dac')
    expect(stored?.fetchedAt).toBe(result.fetchedAt) // stored timestamp == response timestamp
    expect(JSON.parse(stored!.worksJson)[0]).toMatchObject({ id: 'openalex:w1' })
  })

  it('returns error on cold-cache failure without writing a row', async () => {
    fetchWorksMock.mockRejectedValue(new Error('simulated outage'))
    const result = await getLiterature(db, mkPathway())
    expect(result.freshness).toBe('error')
    expect(result.works).toEqual([])
    expect(result.fetchedAt).toBe(nowMs)
    expect(getLitCache(db, 'mof-dac')).toBeNull()
    expect(afterMock).not.toHaveBeenCalled()
  })
})
