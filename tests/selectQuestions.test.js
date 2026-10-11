import { describe, it, expect } from 'vitest'
import { selectQuestions, isUint32, mulberry32, DrawError } from '../src/lib/selectQuestions.js'
import nf from '../src/data/questions/nf.json' with { type: 'json' }
import na from '../src/data/questions/na.json' with { type: 'json' }
import ipc from '../src/data/questions/ipc.json' with { type: 'json' }
import ips from '../src/data/questions/ips.json' with { type: 'json' }
import sec from '../src/data/questions/sec.json' with { type: 'json' }
import auto from '../src/data/questions/auto.json' with { type: 'json' }

const BANK = Object.values({ nf, na, ipc, ips, sec, auto }).flatMap((f) => f.questions)

const LENGTHS = [1, 2, 5, 6, 11, 12, 20, 60]
const DOMAINS = ['NF', 'NA', 'IPC', 'IPS', 'SEC', 'AUTO']

/** The coverage floor the draw is required to hold, mirrored from the library. */
function floorFor(n) {
  return Math.min(2, Math.floor(n / 6))
}

function supplyByDomain(bank) {
  const counts = {}
  for (const q of bank) {
    if (q.type !== 'mcq-single' && q.type !== 'mcq-multi') continue
    counts[q.domain] = (counts[q.domain] ?? 0) + 1
  }
  return counts
}

function paperCounts(paper) {
  const counts = {}
  for (const q of paper) counts[q.domain] = (counts[q.domain] ?? 0) + 1
  return counts
}

describe('isUint32', () => {
  it('accepts the valid range including both bounds', () => {
    expect(isUint32(0)).toBe(true)
    expect(isUint32(42)).toBe(true)
    expect(isUint32(0xffffffff)).toBe(true)
  })

  it('refuses negatives, fractions and out-of-range values', () => {
    for (const bad of [-5, 1.5, 0x100000000, Number.NaN, Infinity, '42', null, undefined]) {
      expect(isUint32(bad), `${String(bad)} should be refused`).toBe(false)
    }
  })
})

describe('mulberry32', () => {
  it('is deterministic for a seed', () => {
    const a = mulberry32(7)
    const b = mulberry32(7)
    expect([a(), a(), a()]).toEqual([b(), b(), b()])
  })

  it('stays within [0,1)', () => {
    const next = mulberry32(3)
    for (let i = 0; i < 200; i += 1) {
      const value = next()
      expect(value).toBeGreaterThanOrEqual(0)
      expect(value).toBeLessThan(1)
    }
  })
})

describe('selectQuestions — length contract', () => {
  it.each(LENGTHS)('returns exactly n questions when n=%i', (n) => {
    expect(selectQuestions(BANK, n, 12345)).toHaveLength(n)
  })

  it.each(LENGTHS)('holds the coverage floor when n=%i', (n) => {
    const floor = floorFor(n)
    const supply = supplyByDomain(BANK)
    const counts = paperCounts(selectQuestions(BANK, n, 999))

    for (const domain of DOMAINS) {
      expect(counts[domain] ?? 0, `${domain} at n=${n}`).toBeGreaterThanOrEqual(
        Math.min(floor, supply[domain] ?? 0)
      )
    }
  })

  it('returns no duplicates', () => {
    const ids = selectQuestions(BANK, 60, 77).map((q) => q.id)
    expect(new Set(ids).size).toBe(60)
  })
})

describe('selectQuestions — determinism', () => {
  it('gives the identical paper for the same seed', () => {
    const a = selectQuestions(BANK, 20, 4242).map((q) => q.id)
    const b = selectQuestions(BANK, 20, 4242).map((q) => q.id)
    expect(a).toEqual(b)
  })

  it('gives a different paper for a different seed', () => {
    const a = selectQuestions(BANK, 20, 1).map((q) => q.id).join()
    const b = selectQuestions(BANK, 20, 2).map((q) => q.id).join()
    expect(a).not.toEqual(b)
  })

  it('varies across many seeds rather than repeating one paper', () => {
    const papers = new Set()
    for (let seed = 0; seed < 25; seed += 1) {
      papers.add(selectQuestions(BANK, 20, seed).map((q) => q.id).join())
    }
    expect(papers.size).toBeGreaterThan(15)
  })
})

describe('selectQuestions — refusals', () => {
  it('refuses n = 0 and negative n', () => {
    expect(() => selectQuestions(BANK, 0, 1)).toThrow(DrawError)
    expect(() => selectQuestions(BANK, -3, 1)).toThrow(DrawError)
    expect(() => selectQuestions(BANK, 2.5, 1)).toThrow(DrawError)
  })

  it('refuses n beyond the drawable supply', () => {
    expect(() => selectQuestions(BANK, 200, 1)).toThrow(/supply/)
  })

  it('refuses a non-uint32 seed', () => {
    for (const bad of [-5, 1.5, 0x100000000, 'seed', null, undefined]) {
      expect(() => selectQuestions(BANK, 20, bad), `${String(bad)}`).toThrow(DrawError)
    }
  })
})

describe('selectQuestions — drawable types only', () => {
  it('never returns drag-drop or hands-on items', () => {
    const polluted = [
      ...BANK,
      { id: 'dd-1', domain: 'NF', type: 'drag-drop', pairs: [{ left: 'a', right: 'b' }] },
      { id: 'dd-2', domain: 'NA', type: 'drag-drop', pairs: [{ left: 'a', right: 'b' }] },
      { id: 'ho-1', domain: 'SEC', type: 'hands-on', expectedState: { all: [] } },
    ]
    const paper = selectQuestions(polluted, 40, 8)
    expect(paper).toHaveLength(40)
    expect(paper.every((q) => q.type === 'mcq-single' || q.type === 'mcq-multi')).toBe(true)
  })
})

describe('selectQuestions — starved supply', () => {
  /** Two questions per domain, so a domain can go short without emptying the bank. */
  function tinyBank() {
    return DOMAINS.flatMap((domain) => [
      { id: `${domain}-a`, domain, type: 'mcq-single', answer: ['A'] },
      { id: `${domain}-b`, domain, type: 'mcq-single', answer: ['A'] },
    ])
  }

  it('still returns exactly n when one domain has no supply at all', () => {
    const bank = tinyBank().filter((q) => q.domain !== 'SEC')
    const paper = selectQuestions(bank, 6, 1)
    expect(paper).toHaveLength(6)
    expect(paper.filter((q) => q.domain === 'SEC')).toHaveLength(0)
  })

  it('gives the stranded units to domains that still have headroom', () => {
    const bank = tinyBank().filter((q) => q.domain !== 'SEC')
    const counts = paperCounts(selectQuestions(bank, 6, 1))
    // SEC is capped at 0; the six units land on the five remaining domains, so
    // at least one of them must exceed the 1 it would otherwise have drawn.
    const total = Object.values(counts).reduce((sum, v) => sum + v, 0)
    expect(total).toBe(6)
    expect(Math.max(...Object.values(counts))).toBeGreaterThan(1)
  })

  it('throws rather than returning a short paper when n exceeds total supply', () => {
    const bank = tinyBank().filter((q) => q.domain !== 'SEC')
    // 10 drawable items remain, so 11 cannot be built at all.
    expect(() => selectQuestions(bank, 11, 1)).toThrow(DrawError)
    expect(() => selectQuestions(bank, 11, 1)).toThrow(/supply/)
  })

  it('caps a domain at its own supply rather than under-delivering', () => {
    const bank = tinyBank().filter((q) => q.domain !== 'SEC')
    expect(() => selectQuestions(bank, 5, 1)).not.toThrow()
    expect(selectQuestions(bank, 5, 1)).toHaveLength(5)
  })
})