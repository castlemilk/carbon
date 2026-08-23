import { describe, expect, it } from 'vitest'

import { isValidStructureId, parseStructureRequest } from './structure'

const parse = (query: string) => parseStructureRequest(new URLSearchParams(query))

describe('isValidStructureId', () => {
  it('accepts uniprot and pdb style ids', () => {
    expect(isValidStructureId('P00918')).toBe(true)
    expect(isValidStructureId('4hu8')).toBe(true)
    expect(isValidStructureId('A0A1B0CDE2')).toBe(true)
  })

  it('rejects ids with injection or malformed characters', () => {
    expect(isValidStructureId('<script>')).toBe(false)
    expect(isValidStructureId('../../etc')).toBe(false)
    expect(isValidStructureId('P009 18')).toBe(false)
    expect(isValidStructureId('abc')).toBe(false)
    expect(isValidStructureId('WAYTOOLONGID1')).toBe(false)
    expect(isValidStructureId('')).toBe(false)
  })
})

describe('parseStructureRequest', () => {
  it('parses a uniprot id case-insensitively', () => {
    expect(parse('uniprot=p00918')).toEqual({ kind: 'uniprot', id: 'P00918' })
  })

  it('parses a pdb id', () => {
    expect(parse('pdb=4HU8')).toEqual({ kind: 'pdb', id: '4HU8' })
  })

  it('prefers uniprot when both params are present', () => {
    expect(parse('uniprot=P00918&pdb=4HU8')).toEqual({ kind: 'uniprot', id: 'P00918' })
  })

  it('returns null for missing, empty, or malformed params', () => {
    expect(parse('')).toBeNull()
    expect(parse('uniprot=<script>')).toBeNull()
    expect(parse('pdb=ZZZZZZ99!')).toBeNull()
    // malformed uniprot must not silently fall through to an absent pdb
    expect(parse('uniprot=<script>&pdb=4HU8')).toBeNull()
  })

  it('ignores unrelated query params', () => {
    expect(parse('foo=bar&uniprot=P00918')).toEqual({ kind: 'uniprot', id: 'P00918' })
  })
})
