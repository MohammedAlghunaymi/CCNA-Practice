import { describe, it, expect } from 'vitest'
import { PLACEHOLDER_RATIONALE, isPlaceholderRationale } from '../src/lib/rationale.js'
import { BANK } from '../src/lib/bank.js'

describe('isPlaceholderRationale', () => {
  it('matches the exact placeholder', () => {
    expect(isPlaceholderRationale(PLACEHOLDER_RATIONALE)).toBe(true)
  })

  it('matches the placeholder with surrounding whitespace', () => {
    expect(isPlaceholderRationale(`  ${PLACEHOLDER_RATIONALE}  `)).toBe(true)
    expect(isPlaceholderRationale(`\n${PLACEHOLDER_RATIONALE}\n`)).toBe(true)
  })

  /**
   * These negatives all CONTAIN "TODO". An earlier table used negatives with
   * no "TODO" in them at all, which meant a matcher as crude as /TODO/ passed
   * the whole suite. Every case below defeats a prefix or substring matcher.
   */
  it('rejects TODO variants that are not the exact placeholder', () => {
    const variants = [
      'todo: explain why this is wrong', // different case
      'TODO:  explain why this is wrong', // doubled internal space
      'TODO: explain why this is wrong.', // trailing period
      'TODO: explain why this is wrong - see RFC 1918', // extra content
      'TODO', // bare marker
      'TODO:',
      'TODOLAB needs a /30', // a real name, not a marker
    ]
    for (const value of variants) {
      expect(isPlaceholderRationale(value), `"${value}" should not be a placeholder`).toBe(false)
    }
  })

  /** Cisco text that a keyword-family matcher would wrongly suppress. */
  it('never suppresses legitimate Cisco rationale text', () => {
    const real = [
      'XXX',
      'Fixme: none - confirmed with TAC',
      'TBD',
      'The /24 mask leaves 8 host bits, so 254 usable addresses.',
      'Flooding happens because the switch has no entry for that destination MAC.',
      'A /27 leaves 5 host bits: 2^5 = 32 addresses, minus network and broadcast, gives 30 hosts.',
      '',
    ]
    for (const value of real) {
      expect(isPlaceholderRationale(value), `"${value}" must never be suppressed`).toBe(false)
    }
  })

  it('rejects non-strings without throwing', () => {
    for (const value of [undefined, null, 0, {}, [], true]) {
      expect(isPlaceholderRationale(value)).toBe(false)
    }
  })

  it('identifies every placeholder in the bank, and nothing else', () => {
    const rationales = BANK.filter((q) => q.options)
      .flatMap((q) => Object.values(q.options))
      .map((o) => o.rationale)
      .filter((r) => typeof r === 'string')
    const placeholders = rationales.filter(isPlaceholderRationale)
    const others = rationales.filter((r) => !isPlaceholderRationale(r))

    expect(placeholders).toHaveLength(507)
    expect(others.every((r) => r.trim() !== '')).toBe(true)
    // Every placeholder in the bank is byte-identical to the constant, which is
    // what makes matching one string sufficient rather than a family.
    expect(new Set(placeholders)).toEqual(new Set([PLACEHOLDER_RATIONALE]))
  })
})