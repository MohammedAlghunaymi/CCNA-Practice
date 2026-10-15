/**
 * The `expectedState` evaluator: the missing half of a contract that already shipped.
 *
 * `questionSchema.js` has declared nine operators since c32eef5 and validates the
 * shape of every predicate the bank carries. Nothing in `src/` evaluates one.
 * A hands-on question in the bank would be graded by nothing. This file is that
 * evaluator.
 *
 * ## The path grammar, frozen here
 *
 * A path is segments separated by `.`.
 *
 *   - `\\` is a literal backslash, `\.` a literal dot. Nothing else is escapable.
 *   - An empty segment (`a..b`), a trailing dot, and a trailing lone backslash
 *     are malformed.
 *   - An unescaped segment matching /^(0|[1-9][0-9]*)$/ **and** addressing an
 *     array **and** naming a slot that exists, is that array index.
 *   - Every other unescaped segment is the object key equal to it, literally.
 *   - A segment containing an escape is always an object key, taken literally
 *     after unescaping.
 *
 * Two of those rules exist because the obvious version of them was wrong.
 *
 * **The integer predicate rejects a leading zero.** `/^[0-9]+$/` matches `01`,
 * which meant `01` resolved to array index 1 on an array and to the key `"01"`
 * on an object — the same path spelling two different values depending on a
 * container it did not name. `/^(0|[1-9][0-9]*)$/` makes `01` a key everywhere.
 *
 * **A slot must exist, not merely be in range.** `const s = [a]; s[3] = d`
 * gives `s.length === 4`, so `2 < 4` while `s[2]` is a hole. Bounds by length
 * would return `undefined` and let the operator decide what that means.
 * `hasOwnProperty` is the check.
 *
 * ## Failure is loud
 *
 * A malformed path, a missing key and an out-of-range index all raise
 * `ExpectedStateError` naming the path. None of them returns `undefined` and
 * lets an operator paper over it: a predicate on a typo is a broken question,
 * and scoring it false hides that rather than fixing it.
 *
 * `exists` and `notExists` are the two operators whose whole job is to talk
 * about a path that may not resolve, so they go through `tryResolve` instead.
 */

import { EXPECTED_STATE_OPS } from './questionSchema.js'

export { EXPECTED_STATE_OPS }

/** Every way a predicate can fail to evaluate. Named so callers can tell them apart. */
export class ExpectedStateError extends Error {
  constructor(message) {
    super(message)
    this.name = 'ExpectedStateError'
  }
}

/** Matches a bare, canonical, non-negative integer. No leading zeros; `0` itself is allowed. */
const INTEGER_SEGMENT = /^(0|[1-9][0-9]*)$/
const ESCAPABLE = new Set(['\\', '.'])

/**
 * Split a path into segments, recording whether each was escaped.
 * Throws on anything malformed rather than guessing at the author's intent.
 */
export function splitPath(path) {
  if (typeof path !== 'string' || path.trim() === '') {
    throw new ExpectedStateError('path must be a non-empty string')
  }

  const segments = []
  let current = ''
  let sawEscape = false
  let pendingEscape = false

  for (const char of path) {
    if (pendingEscape) {
      if (!ESCAPABLE.has(char)) {
        throw new ExpectedStateError(
          `invalid escape "\\${char}" in path "${path}"; only \\\\ and \\. are escapable`
        )
      }
      current += char
      pendingEscape = false
      continue
    }
    if (char === '\\') {
      pendingEscape = true
      sawEscape = true
      continue
    }
    if (char === '.') {
      if (current === '') throw new ExpectedStateError(`empty segment in path "${path}"`)
      segments.push({ key: current, escaped: sawEscape })
      current = ''
      sawEscape = false
      continue
    }
    current += char
  }

  if (pendingEscape) throw new ExpectedStateError(`trailing backslash in path "${path}"`)
  if (current === '') throw new ExpectedStateError(`trailing dot in path "${path}"`)

  segments.push({ key: current, escaped: sawEscape })
  return segments
}

/**
 * Resolve a path against a state tree, or explain why it cannot.
 *
 * The non-throwing form is deliberate and is what `exists` / `notExists` need:
 * they assert about a path precisely when it might not be there.
 */
export function tryResolve(state, path) {
  try {
    return { ok: true, value: resolvePath(state, path) }
  } catch (error) {
    if (error instanceof ExpectedStateError) return { ok: false, error: error.message }
    throw error
  }
}

/** Resolve a path against a state tree. Raises rather than returning `undefined`. */
export function resolvePath(state, path) {
  const segments = splitPath(path)
  let cursor = state
  let walked = []

  for (const segment of segments) {
    const where = walked.length ? walked.join('.') : '<root>'

    if (cursor === null || typeof cursor !== 'object') {
      throw new ExpectedStateError(
        `path "${path}" descends into ${JSON.stringify(cursor)} at "${where}", which is not a container`
      )
    }

    if (Array.isArray(cursor)) {
      if (segment.escaped) {
        throw new ExpectedStateError(
          `path "${path}" escapes "${segment.key}" but the container at "${where}" is an array, ` +
            'which has no keys to escape into'
        )
      }
      if (!INTEGER_SEGMENT.test(segment.key)) {
        throw new ExpectedStateError(
          `path "${path}" segment "${segment.key}" is not a valid index into the array at "${where}"`
        )
      }
      const index = Number(segment.key)
      if (!Object.prototype.hasOwnProperty.call(cursor, index)) {
        throw new ExpectedStateError(
          `path "${path}" index ${index} does not exist in the array at "${where}" ` +
            `(length ${cursor.length})`
        )
      }
      cursor = cursor[index]
      walked.push(segment.key)
      continue
    }

    if (!Object.prototype.hasOwnProperty.call(cursor, segment.key)) {
      throw new ExpectedStateError(`path "${path}" has no key "${segment.key}" at "${where}"`)
    }
    cursor = cursor[segment.key]
    walked.push(segment.key)
  }

  return cursor
}

/** Structural equality over the JSON-serialisable values a state tree holds. */
export function deepEqual(a, b) {
  if (a === b) return true
  if (typeof a !== typeof b) return false
  if (a === null || b === null) return false
  if (Array.isArray(a) !== Array.isArray(b)) return false
  if (typeof a !== 'object') return false

  const aKeys = Object.keys(a)
  const bKeys = Object.keys(b)
  if (aKeys.length !== bKeys.length) return false
  return aKeys.every((key) => Object.prototype.hasOwnProperty.call(b, key) && deepEqual(a[key], b[key]))
}

/** `contains` is two operations sharing a name: substring on a string, membership on an array. */
function contains(haystack, needle, path) {
  if (typeof haystack === 'string') {
    if (typeof needle !== 'string') {
      throw new ExpectedStateError(
        `expectedState "${path}": contains against a string needs a string value, ` +
          `got ${JSON.stringify(needle)}`
      )
    }
    return haystack.includes(needle)
  }
  if (Array.isArray(haystack)) return haystack.some((element) => deepEqual(element, needle))
  throw new ExpectedStateError(
    `expectedState "${path}": contains needs a string or an array, got ${JSON.stringify(haystack)}`
  )
}

/** Numeric operators refuse to compare anything else. Comparing to NaN would always be false. */
function compare(actual, expected, path, op, test) {
  if (typeof actual !== 'number' || Number.isNaN(actual)) {
    throw new ExpectedStateError(
      `expectedState "${path}": ${op} needs a number, got ${JSON.stringify(actual)}`
    )
  }
  if (typeof expected !== 'number' || Number.isNaN(expected)) {
    throw new ExpectedStateError(
      `expectedState "${path}": ${op} needs a numeric value, got ${JSON.stringify(expected)}`
    )
  }
  return test(actual, expected)
}

const OPERATORS = {
  equals: (actual, expected) => deepEqual(actual, expected),
  notEquals: (actual, expected) => !deepEqual(actual, expected),
  contains: (actual, expected, path) => contains(actual, expected, path),
  notContains: (actual, expected, path) => !contains(actual, expected, path),
  // `exists` and `notExists` are deliberately absent: they are answered from
  // whether the path resolved, before an operator is ever dispatched, so an
  // entry here would be unreachable.
  truthy: (actual) => Boolean(actual),
  greaterThanOrEqual: (actual, expected, path) =>
    compare(actual, expected, path, 'greaterThanOrEqual', (a, b) => a >= b),
  lessThanOrEqual: (actual, expected, path) =>
    compare(actual, expected, path, 'lessThanOrEqual', (a, b) => a <= b),
}

/**
 * Evaluate one predicate.
 *
 * `exists` and `notExists` consult `tryResolve` rather than `resolvePath`, so a
 * missing key is an answer rather than an exception. Everything else must
 * resolve, and an unresolvable path is a broken question, not a wrong one.
 */
export function evaluatePredicate(state, predicate) {
  if (!predicate || typeof predicate !== 'object') {
    throw new ExpectedStateError('expectedState predicate must be an object')
  }
  const { path, op } = predicate
  if (!EXPECTED_STATE_OPS.includes(op)) {
    throw new ExpectedStateError(
      `expectedState "${path}": op must be one of ${EXPECTED_STATE_OPS.join(', ')}, ` +
        `got ${JSON.stringify(op)}`
    )
  }

  if (op === 'exists' || op === 'notExists') {
    const resolved = tryResolve(state, path)
    const present = resolved.ok
    const pass = op === 'exists' ? present : !present
    return {
      path,
      op,
      pass,
      actual: present ? resolved.value : undefined,
      detail: present
        ? `${op} on "${path}": path resolves`
        : `${op} on "${path}": ${resolved.error}`,
    }
  }

  const actual = resolvePath(state, path)
  const pass = OPERATORS[op](actual, predicate.value, path)
  return {
    path,
    op,
    pass,
    actual,
    expected: predicate.value,
    detail: pass
      ? `${op} on "${path}" holds`
      : `${op} on "${path}" does not hold: got ${JSON.stringify(actual)}, ` +
        `expected ${JSON.stringify(predicate.value)}`,
  }
}

/**
 * Evaluate a whole `expectedState` block against a state tree.
 *
 * Shape: `{ all: [{ path, op, value? }] }` — every predicate must hold. Returns
 * one result per predicate so a failed task can say which condition broke
 * rather than only that something did.
 */
export function evaluate(expectedState, state) {
  if (!expectedState || typeof expectedState !== 'object') {
    throw new ExpectedStateError('expectedState must be an object with an `all` array')
  }
  if (!Array.isArray(expectedState.all) || expectedState.all.length === 0) {
    throw new ExpectedStateError('expectedState.all must be a non-empty array of predicates')
  }

  const results = expectedState.all.map((predicate) => evaluatePredicate(state, predicate))
  return {
    pass: results.every((result) => result.pass),
    results,
    failures: results.filter((result) => !result.pass),
  }
}