import { describe, it, expect } from 'vitest'
import { largestRemainder, computeAllocation, proportionalDrift } from '../src/lib/allocation.js'
import config from '../src/config/bank.config.json' with { type: 'json' }

const WEIGHTS = { NF: 20, NA: 20, IPC: 25, IPS: 10, SEC: 15, AUTO: 10 }

describe('largestRemainder', () => {
  it('reproduces the published v1 remainder exactly', () => {
    // The plan publishes {21,21,26,11,16,11} for 106 units. If float division
    // were used, 106 * 0.15 would land on 15.899999999999999 and the ordering
    // of the largest fractional parts could invert.
    expect(largestRemainder(106, WEIGHTS)).toEqual({
      NF: 21, NA: 21, IPC: 26, IPS: 11, SEC: 16, AUTO: 11,
    })
  })

  it('always sums to the requested total', () => {
    for (let total = 0; total <= 200; total++) {
      const out = largestRemainder(total, WEIGHTS)
      const sum = Object.values(out).reduce((a, b) => a + b, 0)
      expect(sum).toBe(total)
    }
  })

  it('is deterministic on ties, breaking by key name ascending', () => {
    // 30 units across 6 even weights leaves a 1-unit shortfall with IPC and SEC
    // tied on the fractional part; the tie must resolve the same way every run.
    expect(largestRemainder(30, WEIGHTS)).toEqual({
      NF: 6, NA: 6, IPC: 8, IPS: 3, SEC: 4, AUTO: 3,
    })
    expect(largestRemainder(30, WEIGHTS)).toEqual(largestRemainder(30, WEIGHTS))
  })

  it('rejects invalid input', () => {
    expect(() => largestRemainder(10, { A: 0 })).toThrow(/positive/)
    expect(() => largestRemainder(-1, WEIGHTS)).toThrow(/non-negative/)
    expect(() => largestRemainder(1.5, WEIGHTS)).toThrow(/integer/)
  })
})

describe('computeAllocation', () => {
  const leafs = { NF: 35, NA: 16, IPC: 19, IPS: 9, SEC: 10, AUTO: 8 }

  it('reproduces the published v1 bank allocation', () => {
    const result = computeAllocation({
      leafs, weights: WEIGHTS, scope: Object.keys(leafs), floor: 2, target: 300,
    })
    expect(result.perDomain).toEqual({ NF: 91, NA: 53, IPC: 64, IPS: 29, SEC: 36, AUTO: 27 })
    expect(result.total).toBe(300)
  })

  it('reproduces the published 450-question allocation', () => {
    const result = computeAllocation({
      leafs, weights: WEIGHTS, scope: Object.keys(leafs), floor: 2, target: 450,
    })
    expect(result.perDomain).toEqual({ NF: 121, NA: 83, IPC: 102, IPS: 44, SEC: 58, AUTO: 42 })
    expect(result.total).toBe(450)
  })

  it('refuses a target smaller than the coverage floor demands', () => {
    expect(() =>
      computeAllocation({ leafs, weights: WEIGHTS, scope: Object.keys(leafs), floor: 2, target: 100 })
    ).toThrow(/coverage floor needs 194/)
  })

  it('keeps the frozen allocation in the config consistent with the formula', () => {
    const frozen = config.allocation.byMilestone.v1.perDomain
    const recomputed = computeAllocation({
      leafs, weights: WEIGHTS, scope: Object.keys(leafs), floor: 2, target: 300,
    }).perDomain
    expect(frozen).toEqual(recomputed)
  })
})

describe('proportionalDrift', () => {
  it('is zero when a domain is exactly on its proportional share', () => {
    // Halfway through a 300-question milestone, NF should hold about 45.5.
    expect(proportionalDrift(46, 91, 150, 300)).toBeLessThanOrEqual(2)
  })

  it('reports zero drift at zero progress, so empty batches merge cleanly', () => {
    expect(proportionalDrift(0, 91, 0, 300)).toBe(0)
  })

  it('grows as a domain lags its share', () => {
    expect(proportionalDrift(10, 91, 150, 300)).toBeGreaterThan(2)
  })
})