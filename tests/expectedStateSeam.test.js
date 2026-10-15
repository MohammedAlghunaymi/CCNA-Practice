import { describe, it, expect } from 'vitest'
import { validateQuestionShape, EXPECTED_STATE_OPS } from '../src/lib/questionSchema.js'
import { evaluate, evaluatePredicate, splitPath, tryResolve, ExpectedStateError } from '../src/lib/expectedState.js'

/**
 * `validateExpectedState` is private to questionSchema.js, so the seam is
 * exercised the way a real question reaches it: through validateQuestionShape
 * on a hands-on item. Widening the module's API to make a test easier is the
 * wrong trade when the public path already exists.
 */
function handsOn(predicates) {
  return validateQuestionShape({
    id: 'seam-1',
    objectiveId: '1.6',
    domain: 'NF',
    type: 'hands-on',
    prompt: 'Bring the uplink up.',
    explanation: 'Configure the interface.',
    difficulty: 'medium',
    batch: 'seam',
    expectedState: { all: predicates },
  })
}

/**
 * The seam between the two halves of the `expectedState` contract.
 *
 * `questionSchema.js` has validated the *shape* of every predicate since
 * c32eef5. `expectedState.js` evaluates one against a state tree. Nothing
 * asserted that a predicate the schema accepts can actually be evaluated, so
 * "schema passes" read as "this will work" when it does not.
 *
 * They can disagree, and that is correct. The schema cannot know what lives at
 * a path, so `contains` is legal against any path and only the evaluator knows
 * that `contains` against a boolean has no meaning. These tests name each
 * disagreement rather than leaving it to be discovered by a learner.
 *
 * The resolver gets a property pass underneath, because a hand-picked case
 * list cannot cover a parser's input space.
 */

/** mulberry32: small, seeded, and deterministic so a failure is reproducible. */
function seeded(seed) {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const STATE = {
  router: {
    hostname: 'R1',
    'dotted.key': { 'has.dots': 'yes' },
    'back\\slash': 'escaped',
    count: 3,
    ratio: 0.5,
    enabled: false,
    labels: ['edge', 'core'],
    interfaces: { 'GigabitEthernet0/0': { adminUp: true, ipv4: { address: '10.0.0.1' } } },
    vlans: { 10: { name: 'mgmt' }, '01': { name: 'padded key' } },
    acl: { 101: { entries: { 10: { action: 'permit' } } } },
    neighbours: [{ id: 'a' }, { id: 'b' }, { id: 'c' }],
  },
}

/**
 * A tree of every key shape the resolver has to survive, so generated paths
 * are drawn from real structure rather than from string soup.
 */
const TREE = {
  hostname: { value: 'R1' },
  'dotted.key': { value: { 'has.dots': 'yes' } },
  'back\\slash': { value: 'escaped' },
  count: { value: 3 },
  ratio: { value: 0.5 },
  enabled: { value: false },
  labels: { value: ['edge', 'core'] },
  interfaces: { value: { 'GigabitEthernet0/0': { adminUp: true, ipv4: { address: '10.0.0.1' } } } },
  vlans: { value: { 10: { name: 'mgmt' }, '01': { name: 'padded key' } } },
  acl: { value: { 101: { entries: { 10: { action: 'permit' } } } } },
  neighbours: { value: [{ id: 'a' }, { id: 'b' }, { id: 'c' }] },
}

/** Walk TREE randomly, emitting a path and the value it must resolve to. */
function generatePath(rand, depth = 0) {
  const keys = Object.keys(TREE)
  const key = keys[Math.floor(rand() * keys.length)]
  const node = TREE[key]

  // Descend while the value is a plain object whose keys all appear in TREE
  // shape, up to three levels, so paths vary in length without going infinite.
  if (depth < 3 && node.value && typeof node.value === 'object' && !Array.isArray(node.value)) {
    const childKeys = Object.keys(node.value)
    if (childKeys.length && rand() < 0.6) {
      const child = childKeys[Math.floor(rand() * childKeys.length)]
      const [path, expected] = generateInto(key, child, node.value[child])
      return [path, expected]
    }
  }
  const [path, expected] = generateInto(key, null, node.value)
  return [path, expected]
}

function generateInto(parentKey, childKey, value) {
  const segment =
    childKey === null
      ? parentKey.replace(/[.\\]/g, '\\$&')
      : childKey.includes('.') || childKey.includes('\\')
        ? childKey.replace(/[.\\]/g, '\\$&')
        : childKey
  return [`router.${segment}`, value]
}

describe('the schema/evaluator seam', () => {
  const conformant = [
    { path: 'router.hostname', op: 'equals', value: 'R1' },
    { path: 'router.hostname', op: 'notEquals', value: 'R2' },
    { path: 'router.hostname', op: 'contains', value: 'R' },
    { path: 'router.hostname', op: 'notContains', value: 'Z' },
    { path: 'router.labels', op: 'contains', value: 'core' },
    { path: 'router.interfaces.GigabitEthernet0/0.adminUp', op: 'exists' },
    { path: 'router.absent', op: 'notExists' },
    { path: 'router.count', op: 'greaterThanOrEqual', value: 3 },
    { path: 'router.count', op: 'lessThanOrEqual', value: 3 },
    { path: 'router.dotted\\.key.has\\.dots', op: 'equals', value: 'yes' },
    { path: 'router.vlans.10.name', op: 'truthy' },
    { path: 'router.neighbours.1.id', op: 'equals', value: 'b' },
  ]

  it('every conformant predicate passes the schema and evaluates', () => {
    for (const predicate of conformant) {
      expect(handsOn([predicate])).toEqual([])
      const result = evaluatePredicate(STATE, predicate)
      expect(`${predicate.op}@${predicate.path}=${result.pass}`).toBe(
        `${predicate.op}@${predicate.path}=true`
      )
    }
  })

  it('names the divergence: the schema cannot know a path holds a boolean', () => {
    const predicate = { path: 'router.enabled', op: 'contains', value: 'true' }
    // The schema is right to accept this. It validates shape, not state.
    expect(handsOn([predicate])).toEqual([])
    // The evaluator is right to refuse it, and says why.
    expect(() => evaluatePredicate(STATE, predicate)).toThrow(/needs a string or an array/)
  })

  it('names the divergence: the schema cannot know a path holds a string', () => {
    const predicate = { path: 'router.hostname', op: 'greaterThanOrEqual', value: 1 }
    expect(handsOn([predicate])).toEqual([])
    expect(() => evaluatePredicate(STATE, predicate)).toThrow(/needs a number/)
  })

  it('names the divergence: the schema cannot know a path resolves', () => {
    const predicate = { path: 'router.absent', op: 'equals', value: 'x' }
    expect(handsOn([predicate])).toEqual([])
    expect(() => evaluatePredicate(STATE, predicate)).toThrow(ExpectedStateError)
  })

  it('agrees on what is structurally wrong, so a bad predicate never reaches the evaluator', () => {
    // The schema rejects these outright, which is the useful behaviour: the
    // evaluator's raises are for things the schema could not see.
    for (const predicate of [
      { path: 'router.count', op: 'greaterThanOrEqual' },
      { path: '', op: 'equals', value: 1 },
      { path: 'router.count', op: 'startsWith', value: 1 },
    ]) {
      expect(handsOn([predicate]).length).toBeGreaterThan(0)
    }
  })

  it('accepts every operator the schema declares', () => {
    const seen = new Set(
      conformant.map((p) => p.op).concat(['truthy'])
    )
    for (const op of EXPECTED_STATE_OPS) expect(seen).toContain(op)
  })
})

describe('the resolver, as a property rather than a case list', () => {
  it('generated paths resolve to exactly the value the tree says they should', () => {
    const rand = seeded(20261015)
    const results = []
    for (let i = 0; i < 400; i++) {
      const [path, expected] = generatePath(rand)
      let resolved
      try {
        resolved = evaluatePredicate(STATE, { path, op: 'exists' })
      } catch (error) {
        results.push(`threw ${error.message}`)
        continue
      }
      results.push(resolved.pass ? 'ok' : 'notfound')
      if (resolved.pass) {
        expect(`${path}=${JSON.stringify(resolved.actual)}`).toBe(
          `${path}=${JSON.stringify(expected)}`
        )
      }
    }
    // A property pass is worthless if the generator never produces a path, so
    // assert the walk actually reached leaves.
    expect(results.filter((r) => r === 'ok').length).toBeGreaterThan(50)
    expect(results.filter((r) => r !== 'ok' && r !== 'notfound')).toEqual([])
  })

  it('a path that resolves never yields undefined', () => {
    const rand = seeded(7)
    let resolvedCount = 0
    for (let i = 0; i < 300; i++) {
      const [path] = generatePath(rand)
      const { ok, value } = tryResolve(STATE, path)
      if (ok) {
        resolvedCount++
        expect(value).not.toBeUndefined()
      }
    }
    // Otherwise the loop proves nothing: no path ever resolved.
    expect(resolvedCount).toBeGreaterThan(25)
  })

  it('splitPath round-trips: rejoining the segments and re-splitting is stable', () => {
    const rand = seeded(99)
    for (let i = 0; i < 200; i++) {
      const [path] = generatePath(rand)
      const segments = splitPath(path)
      const rejoined = segments
        .map((s) => (s.escaped ? s.key.replace(/[.\\]/g, '\\$&') : s.key))
        .join('.')
      const again = splitPath(rejoined)
      expect(again.map((s) => s.key)).toEqual(segments.map((s) => s.key))
      expect(again.map((s) => s.escaped)).toEqual(segments.map((s) => s.escaped))
    }
  })

  it('an escaped segment always resolves to a key containing that literal character', () => {
    expect(evaluatePredicate(STATE, { path: 'router.dotted\\.key.has\\.dots', op: 'equals', value: 'yes' }).pass).toBe(true)
    // Unescaped, the same spelling is three segments and cannot resolve.
    expect(tryResolve(STATE, 'router.dotted.key').ok).toBe(false)
  })

  it('never resolves a padded integer segment as an index', () => {
    expect(tryResolve(STATE, 'router.vlans.01.name')).toEqual({
      ok: true,
      value: 'padded key',
    })
    // And 0-based array indexing is untouched by that.
    expect(tryResolve(STATE, 'router.neighbours.0.id')).toEqual({ ok: true, value: 'a' })
  })
})

describe('evaluate over a whole block', () => {
  it('reports each predicate separately so a failed task says which condition broke', () => {
    const out = evaluate(
      {
        all: [
          { path: 'router.interfaces.GigabitEthernet0/0.ipv4.address', op: 'equals', value: '10.0.0.1' },
          { path: 'router.interfaces.GigabitEthernet0/0.adminUp', op: 'truthy' },
          { path: 'router.count', op: 'lessThanOrEqual', value: 5 },
        ],
      },
      STATE
    )
    expect(out.pass).toBe(true)
    expect(out.results).toHaveLength(3)
  })

  it('fails loudly on an unresolvable predicate rather than scoring it false', () => {
    expect(() =>
      evaluate({ all: [{ path: 'router.interfaces.GigabitEthernet0/1.adminUp', op: 'truthy' }] }, STATE)
    ).toThrow(/has no key "GigabitEthernet0\/1"/)
  })
})