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
 * Build a per-domain allocation for one milestone.
 *
 * @param {Object} options
 * @param {Object<string, number>} options.leafs       leaves per domain id
 * @param {Object<string, number>} options.weights     blueprint weight per domain id
 * @param {string[]} options.scope                    domain ids in scope for this milestone
 * @param {number} options.floor                      questions per in-scope sub-objective
 * @param {number} options.target                     total questions in the bank at this milestone
 * @returns {{perDomain: Object<string, number>, total: number, detail: Object}}
 */
export function computeAllocation({ leafs, weights, scope, floor, target }) {
  const floorPerDomain = {}
  let floorTotal = 0

  for (const domain of scope) {
    floorPerDomain[domain] = floor * leafs[domain]
    floorTotal += floorPerDomain[domain]
  }

  if (floorTotal > target) {
    throw new Error(
      `computeAllocation: coverage floor needs ${floorTotal} questions ` +
        `(${floor} x ${floorTotal / floor} leaves) but the target is only ${target}`
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