/**
 * Deterministic question-bank allocation.
 *
 * The method is deliberately boring and exactly reproducible:
 *   allocation_d = (floor x leaves_d) + largestRemainder( target - sum(floor), weight_d )
 *
 * The floor guarantees every in-scope sub-objective gets at least `floor`
 * questions, so blueprint coverage drives breadth. The remainder is then
 * apportioned by blueprint weight, so the bank also reflects exam weighting.
 *
 * All apportionment uses INTEGER arithmetic. With float division, 106 x 0.15
 * lands on 15.899999999999999 and the largest-remainder ordering can invert,
 * which would make a published table unreproducible.
 */

/**
 * Largest-remainder (Hare quota) apportionment of `total` across `weights`.
 * Ties break on key name ascending so the result is stable and reviewable.
 *
 * @param {number} total   units to distribute (must be >= sum of floors)
 * @param {Object<string, number>} weights integer weights; only their ratio matters
 * @returns {Object<string, number>}
 */
export function largestRemainder(total, weights) {
  const entries = Object.entries(weights)
  const divisor = entries.reduce((sum, [, w]) => sum + w, 0)

  if (divisor <= 0) {
    throw new Error('largestRemainder: weights must sum to a positive number')
  }
  if (!Number.isInteger(total) || total < 0) {
    throw new Error(`largestRemainder: total must be a non-negative integer, got ${total}`)
  }

  const base = {}
  const remainder = {}
  let floorSum = 0

  for (const [key, weight] of entries) {
    const numerator = total * weight
    base[key] = Math.floor(numerator / divisor)
    remainder[key] = numerator - base[key] * divisor
    floorSum += base[key]
  }

  const shortfall = total - floorSum
  if (shortfall < 0) {
    throw new Error(`largestRemainder: cannot apportion ${total}, floors already sum to ${floorSum}`)
  }

  const order = entries
    .map(([key]) => key)
    .sort((a, b) => {
      if (remainder[b] !== remainder[a]) return remainder[b] - remainder[a]
      return a.localeCompare(b)
    })

  const result = { ...base }
  for (let i = 0; i < shortfall; i++) {
    result[order[i % order.length]] += 1
  }

  return result
}

/**
 * Per-topic coverage minimums balanced for each domain's weight-to-topic ratio.
 *
 * The blueprint is lopsided: Network Fundamentals holds 35 of the 97 testable
 * topics but only 20% of the exam, while Security Fundamentals holds 10 topics
 * and 15% of the exam. A single global floor therefore over-stocks NF with
 * questions a candidate rarely draws and under-stocks SEC with questions they
 * see repeatedly. Scaling the minimum by weight per topic spreads supply across
 * domains in proportion to how much of the exam they carry.
 *
 * `floorPerObjective` is the minimum for the reference domain — the one with the
 * lowest weight-per-topic ratio, which anchors the scale — and every other
 * domain is derived from it. The result is clamped at 1 so that raising the
 * minimum can never silently round a domain down to zero and quietly disable
 * coverage for it.
 *
 * @param {Object} options
 * @param {Object<string, number>} options.leafs      testable topics per domain id
 * @param {Object<string, number>} options.weights    blueprint weight per domain id
 * @param {number} options.floorPerObjective          minimum for the reference domain
 * @returns {Object<string, number>} minimum questions per topic, per domain
 */
export function balancedFloors({ leafs, weights, floorPerObjective }) {
  const domains = Object.keys(leafs)
  const ratios = {}
  let reference = Infinity

  for (const domain of domains) {
    if (!Number.isInteger(floorPerObjective) || floorPerObjective < 1) {
      throw new Error(
        `balancedFloors: floorPerObjective must be a positive integer, got ${floorPerObjective}`
      )
    }
    if (leafs[domain] < 1) {
      throw new Error(`balancedFloors: ${domain} needs at least one testable topic`)
    }
    const ratio = weights[domain] / leafs[domain]
    ratios[domain] = ratio
    if (ratio < reference) reference = ratio
  }

  const scale = floorPerObjective / reference
  const floors = {}
  for (const domain of domains) {
    floors[domain] = Math.max(1, Math.round(scale * ratios[domain]))
  }
  return floors
}

/**
 * How many questions a domain contributes to one exam of `length` items.
 *
 * This is the demand side of the allocation contract: the bank must be able to
 * supply at least this many questions per domain, or the exam cannot be drawn.
 * Derived from the published N=100 matrix by blueprint weight, which is exact at
 * every length that divides 100.
 *
 * @param {Object} options
 * @param {Array<{domain: string, drawn: number}>} options.matrix domainFormatMatrix
 * @param {number} options.length  items in the exam being drawn
 * @returns {Object<string, number>}
 */
export function examDrawQuota({ matrix, length }) {
  if (!Number.isInteger(length) || length < 1) {
    throw new Error(`examDrawQuota: length must be a positive integer, got ${length}`)
  }

  const weights = {}
  let fullLength = 0
  for (const row of matrix) {
    weights[row.domain] = row.drawn
    fullLength += row.drawn
  }

  if (length === fullLength) {
    return { ...weights }
  }
  return largestRemainder(length, weights)
}

/**
 * Build a per-domain allocation for one milestone.
 *
 * `floors` carries the per-domain coverage minimums for this milestone; `floor`
 * is accepted as a shorthand that applies one uniform minimum everywhere, for
 * the milestones that genuinely want the same minimum in every domain.
 *
 * @param {Object} options
 * @param {Object<string, number>} options.leafs       leaves per domain id
 * @param {Object<string, number>} options.weights     blueprint weight per domain id
 * @param {string[]} options.scope                    domain ids in scope for this milestone
 * @param {Object<string, number>} [options.floors]   per-domain minimums per topic
 * @param {number} [options.floor]                    uniform minimum per topic
 * @param {number} options.target                     total questions in the bank at this milestone
 * @returns {{perDomain: Object<string, number>, total: number, detail: Object}}
 */
export function computeAllocation({ leafs, weights, scope, floors, floor, target }) {
  const perTopic = floors ?? Object.fromEntries(scope.map((domain) => [domain, floor]))

  const floorPerDomain = {}
  let floorTotal = 0

  for (const domain of scope) {
    const minimum = perTopic[domain]
    if (!Number.isInteger(minimum) || minimum < 1) {
      throw new Error(
        `computeAllocation: ${domain} needs a positive integer per-topic floor, got ${minimum}`
      )
    }
    floorPerDomain[domain] = minimum * leafs[domain]
    floorTotal += floorPerDomain[domain]
  }

  if (floorTotal > target) {
    throw new Error(
      `computeAllocation: coverage floor needs ${floorTotal} questions ` +
        `but the target is only ${target}`
    )
  }

  const remainder = target - floorTotal
  const scopedWeights = {}
  for (const domain of scope) scopedWeights[domain] = weights[domain]

  const apportioned = largestRemainder(remainder, scopedWeights)

  const perDomain = {}
  const detail = {}
  let total = 0

  for (const domain of scope) {
    perDomain[domain] = floorPerDomain[domain] + apportioned[domain]
    total += perDomain[domain]
    detail[domain] = {
      leaves: leafs[domain],
      floorPerTopic: perTopic[domain],
      floorContribution: floorPerDomain[domain],
      weightContribution: apportioned[domain],
      allocation: perDomain[domain],
    }
  }

  if (total !== target) {
    throw new Error(`computeAllocation: allocation sums to ${total}, expected ${target}`)
  }

  return { perDomain, total, detail }
}

/**
 * Proportional drift, so a partially merged batch does not fail against a
 * target that only applies at milestone close.
 *
 * Returns the absolute deviation in questions; callers compare it against
 * whatever tolerance their own stage requires.
 *
 * @param {number} actual    questions currently in this domain
 * @param {number} target    questions this domain should hold at milestone close
 * @param {number} current   total questions currently in the bank
 * @param {number} milestone total questions at milestone close
 */
export function proportionalDrift(actual, target, current, milestone) {
  if (milestone <= 0) return actual === 0 ? 0 : Infinity
  const expected = (target * current) / milestone
  return Math.abs(actual - expected)
}