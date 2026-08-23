import { describe, it, expect, vi, afterEach } from 'vitest'
import { buildQuery, fetchWorks, normalizeWork } from './openalex'

afterEach(() => {
  vi.unstubAllGlobals()
  delete process.env.CARBON_SIMULATE_OUTAGE
})

describe('openalex', () => {
  it('builds search url with terms and field selection', () => {
    const url = buildQuery('MOF DAC', ['MOF DAC', 'Mg2(dobpdc) CO2'])
    expect(url).toContain('https://api.openalex.org/works?')
    expect(decodeURIComponent(url)).toContain('search=MOF DAC')
    expect(url).toContain('per-page=8')
  })
  it('falls back to the pathway name when terms are empty', () => {
    const url = buildQuery('Basalt injection', ['', '  '])
    expect(decodeURIComponent(url)).toContain('search=Basalt injection')
  })
  it('normalizes a work into a Citation', () => {
    expect(
      normalizeWork({
        id: 'https://openalex.org/W1',
        display_name: 'A study',
        authorships: [
          { author: { display_name: 'A' } },
          { author: { display_name: 'B' } },
          { author: { display_name: 'C' } },
          { author: { display_name: 'D' } },
          { author: { display_name: 'E' } },
          { author: { display_name: 'F' } },
        ],
        publication_year: 2022,
        doi: 'https://doi.org/10.1/x',
        primary_location: { source: { display_name: 'Journal' } },
      }),
    ).toMatchObject({
      id: 'openalex:W1',
      title: 'A study',
      year: 2022,
      authors: ['A', 'B', 'C', 'D', 'E'],
      venue: 'Journal',
      url: 'https://doi.org/10.1/x',
    })
  })
})

describe('fetchWorks', () => {
  it('fetches and normalizes the results array', async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      expect(String(input)).toContain('https://api.openalex.org/works?')
      return Response.json({
        results: [
          {
            id: 'https://openalex.org/W42',
            display_name: 'CO2 capture in MOFs',
            authorships: [{ author: { display_name: 'Doe' } }],
            publication_year: 2021,
            doi: null,
            primary_location: { source: { display_name: 'Nature' } },
          },
        ],
      })
    })
    vi.stubGlobal('fetch', fetchMock)
    const works = await fetchWorks('MOF DAC', ['mof dac'])
    expect(fetchMock).toHaveBeenCalledOnce()
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(decodeURIComponent(url)).toContain('search=mof dac')
    expect(init.signal).toBeDefined()
    expect(works).toHaveLength(1)
    expect(works[0]).toMatchObject({ id: 'openalex:W42', title: 'CO2 capture in MOFs', authors: ['Doe'], url: 'https://openalex.org/W42' })
  })
  it('throws when the upstream response is not ok', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({}, { status: 503 })))
    await expect(fetchWorks('MOF DAC', [])).rejects.toThrow('503')
  })
  it('throws before fetching when CARBON_SIMULATE_OUTAGE is set', async () => {
    process.env.CARBON_SIMULATE_OUTAGE = '1'
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    await expect(fetchWorks('MOF DAC', [])).rejects.toThrow('simulated outage')
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
