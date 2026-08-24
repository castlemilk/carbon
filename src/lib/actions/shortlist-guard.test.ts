import { describe, expect, it } from 'vitest'

import { ALLOWED_TRANSITIONS, assertTransition, normalizeRationale } from './shortlist-guard'

describe('assertTransition', () => {
  it('allows every legal transition in the map', () => {
    for (const [from, tos] of Object.entries(ALLOWED_TRANSITIONS)) {
      for (const to of tos) {
        expect(() => assertTransition(from, to), `${from} -> ${to}`).not.toThrow()
      }
    }
  })

  it('rejects illegal transitions', () => {
    const illegal: [string, string][] = [
      ['UNDER_EVALUATION', 'CANDIDATE'],
      ['ELIMINATED', 'CANDIDATE'],
      ['ELIMINATED', 'CHOSEN'],
      ['CHOSEN', 'CANDIDATE'],
      ['CHOSEN', 'UNDER_EVALUATION'],
      ['CHOSEN', 'ELIMINATED'],
    ]
    for (const [from, to] of illegal) {
      expect(() => assertTransition(from, to), `${from} -> ${to}`).toThrow(/illegal transition/)
    }
  })

  it('allows a same-status save (idempotent re-confirm)', () => {
    expect(() => assertTransition('CANDIDATE', 'CANDIDATE')).not.toThrow()
    expect(() => assertTransition('ELIMINATED', 'ELIMINATED')).not.toThrow()
  })

  it('allows any known target from a fresh entry (no prior status)', () => {
    for (const to of ['CANDIDATE', 'UNDER_EVALUATION', 'ELIMINATED', 'CHOSEN']) {
      expect(() => assertTransition('', to), `'' -> ${to}`).not.toThrow()
      expect(() => assertTransition('SHORTLIST_STATUS_UNSPECIFIED', to)).not.toThrow()
    }
  })

  it('rejects unknown target statuses', () => {
    expect(() => assertTransition('', 'SOME_OTHER_STATUS')).toThrow(/unknown status/)
    expect(() => assertTransition('CANDIDATE', '')).toThrow(/unknown status/)
  })

  it('rejects unknown source statuses', () => {
    expect(() => assertTransition('MADE_UP_SOURCE', 'ELIMINATED')).toThrow()
  })

  it('rejects numeric-string statuses (hydrated enum reverse-mapping trap)', () => {
    // '2' satisfies `'2' in ShortlistStatus` via the enum's reverse mapping but is not a name
    expect(() => assertTransition('CANDIDATE', '2')).toThrow(/numeric/)
    expect(() => assertTransition('3', 'CHOSEN')).toThrow(/numeric/)
    expect(() => assertTransition('2', '2')).toThrow(/numeric/)
    expect(() => assertTransition('CANDIDATE', '0')).toThrow(/numeric/)
  })
})

describe('normalizeRationale', () => {
  it('trims surrounding whitespace', () => {
    expect(normalizeRationale('  mature baseline, not next-gen \n')).toBe('mature baseline, not next-gen')
  })

  it('caps at 5000 characters', () => {
    expect(normalizeRationale('x'.repeat(6000))).toHaveLength(5000)
  })

  it('leaves short text untouched apart from trimming', () => {
    expect(normalizeRationale('promising')).toBe('promising')
  })
})
