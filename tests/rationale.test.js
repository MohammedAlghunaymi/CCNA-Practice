import { describe, it, expect } from 'vitest'
import { PLACEHOLDER_RATIONALE, isPlaceholderRationale, rationaleToShow } from '../src/lib/rationale.js'
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

/**
 * The selector the practice pager and the exam's review screen both call.
 *
 * Every fixture here is SYNTHETIC, and that is not stylistic. The bank holds 507
 * placeholder rationales and zero real ones, so a selector that returned null for
 * absolutely every input would satisfy any assertion built from bank data —
 * including the informative one. The case below where a real rationale comes
 * back is the only row of the reveal table that carries any information, and it
 * is unreachable from the bank, so it has to be constructed.
 */
describe('rationaleToShow', () => {
  const REAL = 'Port security is a sticky-learn address limit, not a static one.'

  it('returns a real rationale on a wrong option', () => {
    expect(rationaleToShow({ correct: false, rationale: REAL })).toBe(REAL)
  })

  it('suppresses the placeholder', () => {
    expect(rationaleToShow({ correct: false, rationale: PLACEHOLDER_RATIONALE })).toBeNull()
  })

  it('suppresses an all-whitespace rationale', () => {
    // `tests/exam.test.jsx:160-169` already carries this against the exam
    // screen; the selector has to keep the same guard.
    expect(rationaleToShow({ correct: false, rationale: '   ' })).toBeNull()
  })

  it('suppresses a missing rationale', () => {
    expect(rationaleToShow({ text: 'x' })).toBeNull()
    expect(rationaleToShow({ correct: false, rationale: null })).toBeNull()
  })

  it('suppresses a correct option even when it carries a real rationale', () => {
    // The one case that pins the conjunct: dropping `option.correct` from the
    // selector would still pass every other test here.
    expect(rationaleToShow({ correct: true, rationale: REAL })).toBeNull()
  })

  it('tolerates being called with nothing', () => {
    expect(rationaleToShow(undefined)).toBeNull()
    expect(rationaleToShow(null)).toBeNull()
  })

  it('suppresses every option in the bank, and says so', () => {
    // The bank's current state, stated as a fact rather than left implicit: the
    // pager shows no per-option rationale today, and that is correct behaviour,
    // not a silent failure.
    const shown = BANK.filter((q) => q.options)
      .flatMap((q) => Object.values(q.options))
      .filter((o) => rationaleToShow(o) !== null)
    expect(shown).toHaveLength(0)
  })
})