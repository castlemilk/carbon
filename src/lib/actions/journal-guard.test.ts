import { describe, expect, it } from 'vitest'

import { assertEntryKind, assertPathwayRefs, normalizeBody, normalizeTitle, TITLE_MAX_LENGTH, BODY_MAX_LENGTH } from './journal-guard'

describe('assertEntryKind', () => {
  it('accepts every real EntryKind name', () => {
    for (const kind of ['OBSERVATION', 'COMPARISON_NOTE', 'DECISION', 'ELIMINATION']) {
      expect(() => assertEntryKind(kind), kind).not.toThrow()
    }
  })

  it('rejects unspecified and made-up kinds', () => {
    expect(() => assertEntryKind('ENTRY_KIND_UNSPECIFIED')).toThrow(/unknown entry kind/)
    expect(() => assertEntryKind('MADE_UP_KIND')).toThrow(/unknown entry kind/)
    expect(() => assertEntryKind('')).toThrow(/unknown entry kind/)
  })

  it('rejects numeric strings (hydrated enum reverse-mapping trap)', () => {
    // '3' satisfies `'3' in EntryKind` via the enum's reverse mapping but is not a name
    expect(() => assertEntryKind('3')).toThrow(/unknown entry kind/)
    expect(() => assertEntryKind('0')).toThrow(/unknown entry kind/)
  })
})

describe('normalizeTitle', () => {
  it('trims surrounding whitespace', () => {
    expect(normalizeTitle('  chose mof-dac  ')).toBe('chose mof-dac')
  })

  it('throws on empty after trimming', () => {
    expect(() => normalizeTitle('   ')).toThrow(/title must not be empty/)
    expect(() => normalizeTitle('')).toThrow(/title must not be empty/)
  })

  it(`caps at ${TITLE_MAX_LENGTH} characters`, () => {
    expect(normalizeTitle('x'.repeat(300))).toHaveLength(TITLE_MAX_LENGTH)
  })
})

describe('normalizeBody', () => {
  it(`caps at ${BODY_MAX_LENGTH} characters without trimming (markdown whitespace matters)`, () => {
    const body = 'line one\n\n  indented  '
    expect(normalizeBody(body)).toBe(body)
    expect(normalizeBody('x'.repeat(BODY_MAX_LENGTH + 5))).toHaveLength(BODY_MAX_LENGTH)
  })

  it('leaves normal bodies untouched', () => {
    expect(normalizeBody('**bold** claim')).toBe('**bold** claim')
  })
})

describe('assertPathwayRefs', () => {
  const known = new Set(['mof-dac', 'mea-scrubbing'])

  it('accepts refs that all exist in seed', () => {
    expect(() => assertPathwayRefs(['mof-dac', 'mea-scrubbing'], known)).not.toThrow()
    expect(() => assertPathwayRefs([], known)).not.toThrow()
  })

  it('throws naming the first unknown ref', () => {
    expect(() => assertPathwayRefs(['mof-dac', 'ghost'], known)).toThrow(/unknown pathway ref: ghost/)
  })
})
