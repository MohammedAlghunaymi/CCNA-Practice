import config from '../config/bank.config.json' with { type: 'json' }
import { computeAllocation, examDrawQuota } from './allocation.js'

/**
 * Seeded, blueprint-weighted exam draw.
 *
 * The hard requirement is that `selectQuestions(bank, n, seed)` returns exactly
 * `n` questions — never `n+6` because a coverage floor was applied after the
 * fact, and never fewer because a domain ran short. The previous rule in this
 * repo took per-domain counts from `examDrawQuota` (which sums to `n` by
 * construction) and then raised any sub-2 count to 2, which broke that sum. The
 * fix is structural: the floor is fed INTO the apportionment via
 * `computeAllocation`, which subtracts it from the target before distributing
 * the remainder, and throws rather than returning a short paper.
 */

const MATRIX = config.exam.domainFormatMatrix
const DOMAINS = MATRIX.map((row) => row.domain)
const WEIGHTS = Object.fromEntries(MATRIX.map((row) => [row.domain, row.drawn]))
const DOMAIN_COUNT = DOMAINS.length

/**
 * Only multiple-choice items can be scored automatically today. Drag-drop and
 * hands-on need graders that do not exist yet, so they are excluded here rather
 * than silently drawn and then mis-scored.
 */
export const DRAWABLE_TYPES = ['mcq-single', 'mcq-multi']

/** Raised when a paper cannot be built. Never swallowed: a short exam is worse than none. */
export class DrawError extends Error {
  constructor(message, details = {}) {
    super(message)
    this.name = 'DrawError'
    Object.assign(this, details)
  }
}

/**
 * Single definition of seed validity, used both at mint time and when resolving
 * a stored attempt. A seed that cannot satisfy this predicate is refused before
 * anything is written, so a minted record can never be immediately invalid.
 */
export function isUint32(value) {
  return Number.isInteger(value) && value >= 0 && value <= 0xffffffff
}

/** mulberry32 — small, fast, deterministic. Returns a function yielding [0,1). */
export function mulberry32(seed) {
  let a = seed >>> 0
  return function next() {
    a = (a + 0x6d2b79f5) >>> 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Fisher-Yates. Returns a new array; the input is not mutated. */
function shuffled(list, random) {
  const out = [...list]
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

/** One seeded permutation of the domains, from exactly len(DOMAINS) draws. */
function domainOrder(seed) {
  const random = mulberry32((seed ^ 0x9e3779b9) >>> 0)
  return DOMAINS.map((domain) => ({ domain, key: random() }))
    .sort((a, b) => b.key - a.key || a.domain.localeCompare(b.domain))
    .map((entry) => entry.domain)
}

/**
 * Build a `n`-item paper.
 *
 * @param {Array} bank full question bank
 * @param {number} n items to draw
 * @param {number} seed uint32; the same seed always yields the same paper
 * @returns {Array} exactly `n` questions, interleaved across domains
 * @throws {DrawError} if `n` is not a positive integer, exceeds supply, or
 *   cannot be filled after capping and redistribution
 */
export function selectQuestions(bank, n, seed) {
  if (!Array.isArray(bank)) throw new DrawError('selectQuestions: bank must be an array')
  if (!isUint32(seed)) throw new DrawError(`selectQuestions: seed must be a uint32, got ${seed}`)
  if (!Number.isInteger(n) || n < 1) {
    throw new DrawError(`selectQuestions: n must be a positive integer, got ${n}`)
  }

  const pool = bank.filter((q) => DRAWABLE_TYPES.includes(q.type))

  const byDomain = Object.fromEntries(DOMAINS.map((d) => [d, []]))
  for (const question of pool) {
    if (byDomain[question.domain]) byDomain[question.domain].push(question)
  }
  const supply = Object.fromEntries(DOMAINS.map((d) => [d, byDomain[d].length]))
  const scopeSupply = DOMAINS.reduce((sum, d) => sum + supply[d], 0)

  if (n > scopeSupply) {
    throw new DrawError(`selectQuestions: asked for ${n} but drawable supply is ${scopeSupply}`, {
      requested: n,
      scopeSupply,
    })
  }

  // Coverage floor, scaled so a short exam never demands more than it has room
  // for: 6 domains x floor must fit inside n.
  const floor = Math.min(2, Math.floor(n / DOMAIN_COUNT))

  // Capping each domain at what it can actually supply. The floor is never
  // allowed to exceed supply, so `counts[d] >= min(floor, supply[d])` holds by
  // construction — a short domain is capped to its own supply, not pushed under.
  let counts
  if (floor >= 1 && n >= DOMAIN_COUNT * floor) {
    const leafs = Object.fromEntries(DOMAINS.map((d) => [d, 1]))
    const scope = DOMAINS
    counts = computeAllocation({ scope, weights: WEIGHTS, floor, target: n, leafs }).perDomain
  } else {
    counts = { ...examDrawQuota({ matrix: MATRIX, length: n }) }
  }

  for (const d of DOMAINS) counts[d] = Math.min(counts[d], supply[d])

  // Capping can strand items: a domain's quota may exceed what it can supply,
  // leaving the paper short of n. The fix is to ADD units to domains that still
  // have headroom — not to shuffle units between them, because moving a unit
  // from a donor to a receiver leaves the total unchanged and could never close
  // a deficit that capping created. Adding only ever strengthens the floor
  // invariant, and `scopeSupply >= n` guarantees enough headroom exists; the
  // throw below is a guard against that reasoning being wrong.
  const order = domainOrder(seed)
  let deficit = n - DOMAINS.reduce((sum, d) => sum + counts[d], 0)
  while (deficit > 0) {
    let placed = false
    for (const d of order) {
      while (deficit > 0 && counts[d] < supply[d]) {
        counts[d] += 1
        deficit -= 1
        placed = true
      }
    }
    if (!placed) {
      throw new DrawError(
        `selectQuestions: cannot fill ${n} items; ${deficit} short after capping at supply`,
        { requested: n, shortfall: deficit, counts, supply }
      )
    }
  }

  const random = mulberry32(seed)
  const taken = Object.fromEntries(DOMAINS.map((d) => [d, shuffled(byDomain[d], random).slice(0, counts[d])]))

  // Interleave by walking the seeded domain order and taking one from each
  // domain per pass, so the paper is not blocked by domain.
  const paper = []
  let remaining = DOMAINS.reduce((sum, d) => sum + taken[d].length, 0)
  while (remaining > 0) {
    for (const d of order) {
      const next = taken[d].shift()
      if (next) {
        paper.push(next)
        remaining -= 1
      }
    }
  }

  return paper
}

/** How many questions of each drawable type the bank holds, for setup screens. */
export function drawableSupply(bank) {
  const counts = {}
  for (const question of bank) {
    if (!DRAWABLE_TYPES.includes(question.type)) continue
    counts[question.domain] = (counts[question.domain] ?? 0) + 1
  }
  return { byDomain: counts, total: Object.values(counts).reduce((sum, n) => sum + n, 0) }
}