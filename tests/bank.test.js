import { describe, it, expect } from 'vitest'
import { BANK, BY_ID, byDomain, counts } from '../src/lib/bank.js'
import objectives from '../src/data/objectives.json' with { type: 'json' }

/**
 * The single bank index, and the two contracts other code depends on.
 *
 * `byDomain`'s ORDER is load-bearing, not cosmetic: practice progress persists
 * an integer index into `byDomain(...)`, so a reader that quietly sorted by
 * difficulty or objective would re-point every stored cursor at a different
 * question on resume. The deep-equal below is the only assertion form that
 * catches it — a set comparison passes under any order, so the obvious way to
 * write "the NF list is right" would leave the hazard completely uncovered.
 */
describe('bank', () => {
  it('loads every question exactly once', () => {
    expect(BANK).toHaveLength(169)
    expect(new Set(BANK.map((q) => q.id)).size).toBe(169)
  })

  it('counts per domain from the loaded bank, not the allocation target', () => {
    expect(counts).toEqual({ NF: 33, NA: 37, IPC: 31, IPS: 32, SEC: 24, AUTO: 12 })
    expect(Object.values(counts).reduce((a, b) => a + b, 0)).toBe(169)
  })

  it('covers every blueprint domain and invents none', () => {
    expect(Object.keys(counts).sort()).toEqual(
      objectives.domains.map((d) => d.id).sort()
    )
  })

  it('byDomain returns the bank slice in bank order, unsorted', () => {
    for (const domain of objectives.domains) {
      expect(byDomain(domain.id)).toEqual(BANK.filter((q) => q.domain === domain.id))
    }
    expect(byDomain('NF')).toHaveLength(33)
  })

  it('byDomain returns nothing for an unknown domain rather than throwing', () => {
    expect(byDomain('XX')).toEqual([])
  })

  it('round-trips every id through BY_ID', () => {
    for (const q of BANK) expect(BY_ID.get(q.id)).toBe(q)
    expect(BY_ID.get('no-such-id')).toBeUndefined()
  })
})