import { describe, it, expect } from 'vitest'
import {
  largestRemainder,
  computeAllocation,
  proportionalDrift,
  examDrawQuota,
  balancedFloors,
} from '../src/lib/allocation.js'
import config from '../src/config/bank.config.json' with { type: 'json' }
import objectives from '../src/data/objectives.json' with { type: 'json' }

const WEIGHTS = { NF: 20, NA: 20, IPC: 25, IPS: 10, SEC: 15, AUTO: 10 }
const LEAFS = { NF: 35, NA: 16, IPC: 19, IPS: 9, SEC: 10, AUTO: 8 }

function countLeavesInSubset(subsetIds) {
  const domainOf = {}
  for (const domain of objectives.domains) {
    for (const objective of domain.objectives) {
      if (objective.isLeaf) domainOf[objective.id] = domain.id
    }
  }
  const counts = {}
  for (const id of subsetIds) {
    const domain = domainOf[id]
    counts[domain] = (counts[domain] ?? 0) + 1
  }
  return counts
}

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
      leafs, weights: WEIGHTS, scope: Object.keys(leafs),
      floors: { NF: 1, NA: 2, IPC: 2, IPS: 2, SEC: 3, AUTO: 2 }, target: 300,
    })
    expect(result.perDomain).toEqual({ NF: 61, NA: 58, IPC: 71, IPS: 31, SEC: 50, AUTO: 29 })
    expect(result.total).toBe(300)
  })

  it('reproduces the published 450-question allocation', () => {
    const result = computeAllocation({
      leafs, weights: WEIGHTS, scope: Object.keys(leafs),
      floors: { NF: 2, NA: 4, IPC: 5, IPS: 4, SEC: 5, AUTO: 4 }, target: 450,
    })
    expect(result.perDomain).toEqual({ NF: 91, NA: 85, IPC: 121, IPS: 46, SEC: 65, AUTO: 42 })
    expect(result.total).toBe(450)
  })

  it('reproduces the published 600-question frontier allocation', () => {
    const result = computeAllocation({
      leafs, weights: WEIGHTS, scope: Object.keys(leafs),
      floors: { NF: 3, NA: 7, IPC: 7, IPS: 6, SEC: 8, AUTO: 7 }, target: 600,
    })
    expect(result.perDomain).toEqual({ NF: 117, NA: 124, IPC: 148, IPS: 60, SEC: 89, AUTO: 62 })
    expect(result.total).toBe(600)
  })

  it('gives the bank enough supply to fill the exam draw at every milestone', () => {
    // This is the invariant the shipped pilot config violated: a 60-question
    // exam drawing 15 from IP Connectivity cannot be filled from 14 questions.
    const lengths = { pilot: 60, v1: 100, later: 100, frontier: 100 }
    for (const [name, length] of Object.entries(lengths)) {
      const quota = examDrawQuota({ matrix: config.exam.domainFormatMatrix, length })
      const supply = config.allocation.byMilestone[name].perDomain
      for (const domain of Object.keys(quota)) {
        expect(supply[domain], `${name}/${domain}`).toBeGreaterThanOrEqual(quota[domain])
      }
    }
  })

  it('reproduces the published pilot allocation exactly', () => {
    const pilotScope = countLeavesInSubset(config.pilotSubset)
    const result = computeAllocation({
      leafs: pilotScope, weights: WEIGHTS, scope: Object.keys(pilotScope),
      floor: 1, target: 60,
    })
    expect(result.perDomain).toEqual({ NF: 12, NA: 12, IPC: 15, IPS: 6, SEC: 9, AUTO: 6 })
    expect(result.total).toBe(60)
  })

  it('refuses a target smaller than the coverage floor demands', () => {
    expect(() =>
      computeAllocation({
        leafs, weights: WEIGHTS, scope: Object.keys(leafs),
        floors: { NF: 2, NA: 2, IPC: 2, IPS: 2, SEC: 2, AUTO: 2 }, target: 100,
      })
    ).toThrow(/coverage floor needs 194/)
  })

  it('accepts a uniform scalar floor for milestones that do not need balancing', () => {
    const uniform = { NF: 1, NA: 1, IPC: 1, IPS: 1, SEC: 1, AUTO: 1 }
    const scalar = computeAllocation({
      leafs, weights: WEIGHTS, scope: Object.keys(leafs), floor: 1, target: 300,
    })
    const explicit = computeAllocation({
      leafs, weights: WEIGHTS, scope: Object.keys(leafs), floors: uniform, target: 300,
    })
    expect(explicit.perDomain).toEqual(scalar.perDomain)
  })

  it('honours per-domain floors rather than one global floor', () => {
    // NF holds 35 of the 97 topics but only 20% of the exam weight, so its
    // per-topic minimum is deliberately lower than Security's. A single global
    // floor cannot express this.
    const result = computeAllocation({
      leafs, weights: WEIGHTS, scope: Object.keys(leafs),
      floors: { NF: 1, NA: 2, IPC: 2, IPS: 2, SEC: 3, AUTO: 2 }, target: 300,
    })
    expect(result.perDomain).toEqual({ NF: 61, NA: 58, IPC: 71, IPS: 31, SEC: 50, AUTO: 29 })
    expect(result.total).toBe(300)
  })

  it('keeps the frozen allocation in the config consistent with the formula', () => {
    const frozen = config.allocation.byMilestone.v1.perDomain
    const recomputed = computeAllocation({
      leafs, weights: WEIGHTS, scope: Object.keys(leafs),
      floors: config.floorsByMilestone.v1, target: config.milestones.v1.target,
    }).perDomain
    expect(frozen).toEqual(recomputed)
  })
})

describe('examDrawQuota', () => {
  const matrix = config.exam.domainFormatMatrix
  const fullLength = config.exam.defaultLength

  it('returns the published N=100 drawn totals for a full-length exam', () => {
    expect(examDrawQuota({ matrix, length: fullLength })).toEqual({
      NF: 20, NA: 20, IPC: 25, IPS: 10, SEC: 15, AUTO: 10,
    })
  })

  it('scales a reduced-length exam by blueprint weight', () => {
    // 60 questions over the same weights: NF 12, NA 12, IPC 15, IPS 6, SEC 9, AUTO 6.
    expect(examDrawQuota({ matrix, length: 60 })).toEqual({
      NF: 12, NA: 12, IPC: 15, IPS: 6, SEC: 9, AUTO: 6,
    })
  })

  it('always sums to the requested exam length', () => {
    for (const length of [10, 30, 45, 60, 75, 100, 120]) {
      const quota = examDrawQuota({ matrix, length })
      expect(Object.values(quota).reduce((a, b) => a + b, 0)).toBe(length)
    }
  })

  it('rejects a length the matrix cannot fill', () => {
    expect(() => examDrawQuota({ matrix, length: 0 })).toThrow(/positive/)
  })
})

describe('balancedFloors', () => {
  const leafs = LEAFS

  it('keeps the reference domain on the requested per-topic minimum', () => {
    // Network Fundamentals carries 35 of 97 topics against 20% of the exam
    // weight, the worst ratio in the blueprint, so it anchors the scale.
    expect(balancedFloors({ leafs, weights: WEIGHTS, floorPerObjective: 1 }).NF).toBe(1)
  })

  it('gives under-weighted domains the higher per-topic minimum', () => {
    const floors = balancedFloors({ leafs, weights: WEIGHTS, floorPerObjective: 1 })
    expect(floors).toEqual({ NF: 1, NA: 2, IPC: 2, IPS: 2, SEC: 3, AUTO: 2 })
  })

  it('scales every domain as the per-topic minimum rises', () => {
    expect(balancedFloors({ leafs, weights: WEIGHTS, floorPerObjective: 2 }))
      .toEqual({ NF: 2, NA: 4, IPC: 5, IPS: 4, SEC: 5, AUTO: 4 })
    expect(balancedFloors({ leafs, weights: WEIGHTS, floorPerObjective: 3 }))
      .toEqual({ NF: 3, NA: 7, IPC: 7, IPS: 6, SEC: 8, AUTO: 7 })
  })

  it('never produces a zero minimum, which would silently disable coverage', () => {
    for (let floor = 1; floor <= 4; floor++) {
      const floors = balancedFloors({ leafs, weights: WEIGHTS, floorPerObjective: floor })
      for (const value of Object.values(floors)) {
        expect(value).toBeGreaterThanOrEqual(1)
      }
    }
  })

  it('matches the stored floors for every milestone that uses the balanced rule', () => {
    const balanced = ['v1', 'later', 'frontier']
    for (const name of balanced) {
      const { floorPerObjective } = config.milestones[name]
      expect(balancedFloors({ leafs, weights: WEIGHTS, floorPerObjective }))
        .toEqual(config.floorsByMilestone[name])
    }
  })

  it('is uniform for the pilot, which is the one documented exception', () => {
    const derived = balancedFloors({ leafs, weights: WEIGHTS, floorPerObjective: 1 })
    expect(derived).not.toEqual(config.floorsByMilestone.pilot)
    expect(config.milestones.pilot.uniformFloors).toBe(true)
    const values = new Set(Object.values(config.floorsByMilestone.pilot))
    expect(values).toEqual(new Set([1]))
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