import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  evaluate,
  evaluatePredicate,
  resolvePath,
  splitPath,
  tryResolve,
  deepEqual,
  ExpectedStateError,
} from '../src/lib/expectedState.js'
import { reduce, initialState } from '../src/device/state/interfaces.js'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const GOLDEN = join(root, 'tests/fixtures/state/interfaces.min.json')

/**
 * The grammar tests below use small inline literals.
 *
 * That is not the objection it looks like. A device-shaped literal standing in
 * for a device the reducer never produced was the defect — it could not fail
 * against the thing it claimed to model. These literals are not device shapes:
 * they are resolver inputs chosen to hit one rule each, and they claim nothing
 * about what an interface looks like.
 *
 * The device-shaped assertions are at the bottom, and they run the reducer.
 */
const GRAMMAR = {
  interfaces: {
    'GigabitEthernet0/0': {
      ipv4: { address: '10.0.0.1', netmask: '255.255.255.0' },
      adminUp: true,
      spanningTree: { portFast: false },
    },
  },
  security: {
    acls: {
      'corp.prod': { entries: { 10: { action: 'deny' } } },
      101: { entries: { 10: { action: 'permit' } } },
      'back\\slash': { entries: { 10: { action: 'deny' } } },
      'leading.zero': { entries: { '01': { action: 'deny' } } },
    },
    ssh: { enabled: false },
  },
  services: {
    ntp: { peers: { '192.168.1.1': { minimumVersion: 2 } } },
  },
  vlan: {
    10: { name: 'mgmt' },
    '01': { name: 'leading zero is a key, never index one' },
  },
  sparse: [],
}
GRAMMAR.sparse[3] = { ssid: 'D' }

describe('splitPath', () => {
  it('splits on unescaped dots', () => {
    expect(splitPath('a.b.c').map((s) => s.key)).toEqual(['a', 'b', 'c'])
  })

  it('unescapes \\. into a literal dot inside one segment', () => {
    const segments = splitPath('security.acls.corp\\.prod.entries.10.action')
    expect(segments.map((s) => s.key)).toEqual([
      'security',
      'acls',
      'corp.prod',
      'entries',
      '10',
      'action',
    ])
    expect(segments[2].escaped).toBe(true)
    expect(segments[1].escaped).toBe(false)
  })

  it('unescapes \\\\ into a literal backslash', () => {
    expect(splitPath('security.acls.back\\\\slash').map((s) => s.key)).toEqual([
      'security',
      'acls',
      'back\\slash',
    ])
  })

  it('rejects an empty segment', () => {
    expect(() => splitPath('a..b')).toThrow(/empty segment/)
  })

  it('rejects a trailing dot', () => {
    expect(() => splitPath('a.')).toThrow(/trailing dot/)
  })

  it('rejects a trailing backslash', () => {
    expect(() => splitPath('a\\')).toThrow(/trailing backslash/)
  })

  it('rejects an escape of something that is not escapable', () => {
    expect(() => splitPath('a\\-b')).toThrow(/invalid escape/)
  })

  it('rejects a path that is not a non-empty string', () => {
    for (const bad of [undefined, null, '', '   ', 42]) {
      expect(() => splitPath(bad)).toThrow(/non-empty string/)
    }
  })
})

describe('resolvePath', () => {
  it('walks nested objects', () => {
    expect(resolvePath(GRAMMAR, 'interfaces.GigabitEthernet0/0.ipv4.address')).toBe('10.0.0.1')
  })

  it('keeps the slash in an interface name unescaped, because the separator is a dot', () => {
    expect(resolvePath(GRAMMAR, 'interfaces.GigabitEthernet0/0.adminUp')).toBe(true)
  })

  it('resolves an escaped dot to a key that contains a dot', () => {
    expect(resolvePath(GRAMMAR, 'security.acls.corp\\.prod.entries.10.action')).toBe('deny')
  })

  it('resolves an escaped backslash', () => {
    expect(resolvePath(GRAMMAR, 'security.acls.back\\\\slash.entries.10.action')).toBe('deny')
  })

  it('resolves a dotted address through its escape', () => {
    expect(resolvePath(GRAMMAR, 'services.ntp.peers.192\\.168\\.1\\.1.minimumVersion')).toBe(2)
  })

  it('distinguishes a numeric object key from an array index', () => {
    expect(resolvePath(GRAMMAR, 'security.acls.101.entries.10.action')).toBe('permit')
  })

  // The two rules below are the reason this file exists rather than a naive split.
  it('treats a leading zero as a key, never as index 1', () => {
    expect(resolvePath(GRAMMAR, 'security.acls.leading\\.zero.entries.01.action')).toBe('deny')
    expect(resolvePath(GRAMMAR, 'vlan.01.name')).toBe('leading zero is a key, never index one')
  })

  it('rejects a leading zero as an array index, so 01 cannot silently mean 1', () => {
    // 01 is not a canonical integer at all, so it is refused as a spelling
    // before any question of whether index 1 exists comes up.
    expect(() => resolvePath(GRAMMAR, 'sparse.01')).toThrow(/not a valid index/)
    // 1 IS canonical, so it gets as far as the bounds check and fails there.
    expect(() => resolvePath(GRAMMAR, 'sparse.1')).toThrow(/does not exist/)
  })

  it('rejects an index past the end of an array', () => {
    expect(() => resolvePath(GRAMMAR, 'sparse.9')).toThrow(/does not exist/)
  })

  it('rejects a hole inside an array, which bounds-by-length would have read as undefined', () => {
    // sparse[3] is written, so length is 4 and 2 < 4. Index 2 is a hole.
    expect(() => resolvePath(GRAMMAR, 'sparse.2')).toThrow(/does not exist/)
    expect(() => resolvePath(GRAMMAR, 'sparse.2')).toThrow(/length 4/)
    expect(resolvePath(GRAMMAR, 'sparse.3.ssid')).toBe('D')
  })

  it('rejects an escaped segment against an array, which has no keys to escape into', () => {
    expect(() => resolvePath(GRAMMAR, 'sparse.1\\.5')).toThrow(/is an array/)
  })

  it('rejects a missing key rather than returning undefined', () => {
    expect(() => resolvePath(GRAMMAR, 'interfaces.GigabitEthernet0/0.nope')).toThrow(
      /has no key "nope"/
    )
  })

  it('rejects descending into a non-container', () => {
    expect(() => resolvePath(GRAMMAR, 'interfaces.GigabitEthernet0/0.adminUp.deeper')).toThrow(
      /not a container/
    )
  })

  it('names the failing segment in the message', () => {
    expect(() => resolvePath(GRAMMAR, 'security.acls.absent')).toThrow(/at "security\.acls"/)
  })
})

describe('tryResolve', () => {
  it('reports a resolvable path', () => {
    expect(tryResolve(GRAMMAR, 'vlan.10.name')).toEqual({ ok: true, value: 'mgmt' })
  })

  it('reports an unresolvable path as ok:false with a message rather than throwing', () => {
    const result = tryResolve(GRAMMAR, 'vlan.99.name')
    expect(result.ok).toBe(false)
    expect(result.error).toMatch(/has no key "99"/)
  })
})

describe('deepEqual', () => {
  it('compares structurally', () => {
    expect(deepEqual({ a: [1, { b: 2 }] }, { a: [1, { b: 2 }] })).toBe(true)
    expect(deepEqual({ a: [1, { b: 2 }] }, { a: [1, { b: 3 }] })).toBe(false)
    expect(deepEqual({ a: 1 }, { a: 1, b: undefined })).toBe(false)
    expect(deepEqual([1, 2], { 0: 1, 1: 2 })).toBe(false)
  })
})

describe('evaluatePredicate: the nine operators', () => {
  const state = {
    flag: false,
    count: 7,
    text: 'show ip route',
    list: ['a', 'b', 'c'],
    nested: { inner: { value: 'x' } },
  }

  const cases = [
    ['equals', 'text', 'show ip route', true],
    ['equals', 'text', 'show ip int', false],
    ['equals', 'nested.inner', { value: 'x' }, true],
    ['notEquals', 'text', 'show ip int', true],
    ['notEquals', 'text', 'show ip route', false],
    ['exists', 'text', undefined, true],
    ['exists', 'absent', undefined, false],
    ['notExists', 'absent', undefined, true],
    ['notExists', 'text', undefined, false],
    ['truthy', 'text', undefined, true],
    ['truthy', 'flag', undefined, false],
    ['greaterThanOrEqual', 'count', 7, true],
    ['greaterThanOrEqual', 'count', 8, false],
    ['lessThanOrEqual', 'count', 7, true],
    ['lessThanOrEqual', 'count', 6, false],
  ]

  for (const [op, path, value, expected] of cases) {
    it(`${op} on ${path} is ${expected}`, () => {
      const result = evaluatePredicate(state, { path, op, value })
      expect(result.pass).toBe(expected)
      expect(result.detail).toMatch(/\w+ on "/)
    })
  }

  it('contains is a substring on a string', () => {
    expect(evaluatePredicate(state, { path: 'text', op: 'contains', value: 'ip' }).pass).toBe(true)
    expect(evaluatePredicate(state, { path: 'text', op: 'contains', value: 'bgp' }).pass).toBe(false)
  })

  it('contains is membership on an array, the other operation under the same name', () => {
    expect(evaluatePredicate(state, { path: 'list', op: 'contains', value: 'b' }).pass).toBe(true)
    expect(evaluatePredicate(state, { path: 'list', op: 'contains', value: 'z' }).pass).toBe(false)
  })

  it('notContains is the negation of the same two operations', () => {
    expect(evaluatePredicate(state, { path: 'text', op: 'notContains', value: 'bgp' }).pass).toBe(true)
    expect(evaluatePredicate(state, { path: 'list', op: 'notContains', value: 'z' }).pass).toBe(true)
    expect(evaluatePredicate(state, { path: 'list', op: 'notContains', value: 'b' }).pass).toBe(false)
  })

  it('exists on a falsy value passes where truthy does not, which is the pair worth testing apart', () => {
    expect(evaluatePredicate(state, { path: 'flag', op: 'exists', value: false }).pass).toBe(true)
    expect(evaluatePredicate(state, { path: 'flag', op: 'truthy', value: false }).pass).toBe(false)
  })

  it('refuses to compare a number against something that is not one', () => {
    expect(() => evaluatePredicate(state, { path: 'text', op: 'greaterThanOrEqual', value: 1 })).toThrow(
      /greaterThanOrEqual needs a number/
    )
    expect(() => evaluatePredicate(state, { path: 'count', op: 'lessThanOrEqual', value: 'x' })).toThrow(
      /needs a numeric value/
    )
  })

  it('refuses contains on a value that is neither string nor array', () => {
    expect(() => evaluatePredicate(state, { path: 'count', op: 'contains', value: 7 })).toThrow(
      /needs a string or an array/
    )
  })

  it('refuses an operator it does not know', () => {
    expect(() => evaluatePredicate(state, { path: 'text', op: 'startsWith', value: 'show' })).toThrow(
      /op must be one of/
    )
  })

  it('raises on an unresolvable path for a value operator, because a typo is a broken question', () => {
    expect(() => evaluatePredicate(state, { path: 'nope', op: 'equals', value: 1 })).toThrow(
      /has no key "nope"/
    )
  })
})

describe('evaluate', () => {
  const state = { interfaces: { 'Gi0/0': { adminUp: true } } }

  it('passes when every predicate holds and reports one result per predicate', () => {
    const out = evaluate(
      {
        all: [
          { path: 'interfaces.Gi0/0.adminUp', op: 'truthy' },
          { path: 'interfaces.Gi0/0.adminUp', op: 'exists' },
        ],
      },
      state
    )
    expect(out.pass).toBe(true)
    expect(out.results).toHaveLength(2)
    expect(out.failures).toHaveLength(0)
  })

  it('fails and names the failing predicate', () => {
    const out = evaluate(
      {
        all: [
          { path: 'interfaces.Gi0/0.adminUp', op: 'truthy' },
          { path: 'interfaces.Gi0/0.adminUp', op: 'equals', value: false },
        ],
      },
      state
    )
    expect(out.pass).toBe(false)
    expect(out.failures).toHaveLength(1)
    expect(out.failures[0].detail).toMatch(/does not hold/)
  })

  it('refuses a block that is not a non-empty all array', () => {
    expect(() => evaluate({}, state)).toThrow(/non-empty array/)
    expect(() => evaluate({ all: [] }, state)).toThrow(/non-empty array/)
    expect(() => evaluate(null, state)).toThrow(/must be an object/)
  })
})

describe('the interfaces reducer, against its own golden fixture', () => {
  const golden = JSON.parse(readFileSync(GOLDEN, 'utf8'))

  it('produces the checked-in golden byte for byte', () => {
    const state = reduce([
      {
        if: 'GigabitEthernet0/0',
        lines: ['description uplink to core', 'ip address 10.0.0.1 255.255.255.0', 'no shutdown'],
      },
    ])
    // Stable key order matters: this is a byte comparison, so it has to be one.
    expect(JSON.stringify(state, null, 2)).toBe(JSON.stringify(golden, null, 2))
  })

  it('starts empty, so a golden that grew would fail the comparison above', () => {
    expect(reduce([])).toEqual(initialState())
  })

  it('keeps prior interfaces when reducing a later context', () => {
    const once = reduce([{ if: 'GigabitEthernet0/0', lines: ['no shutdown'] }])
    const twice = reduce([{ if: 'GigabitEthernet1/0', lines: ['description second'] }], once)
    expect(Object.keys(twice.interfaces).sort()).toEqual([
      'GigabitEthernet0/0',
      'GigabitEthernet1/0',
    ])
    expect(twice.interfaces['GigabitEthernet0/0'].adminUp).toBe(true)
  })

  it('defaults an interface to administratively down until told otherwise', () => {
    const state = reduce([{ if: 'GigabitEthernet0/1', lines: [] }])
    expect(state.interfaces['GigabitEthernet0/1'].adminUp).toBe(false)
    expect(state.interfaces['GigabitEthernet0/1'].ipv4.address).toBe(null)
  })

  it('refuses switchport and spanning-tree rather than silently ignoring them', () => {
    for (const line of ['switchport mode access', 'spanning-tree portfast']) {
      expect(() => reduce([{ if: 'Gi0/0', lines: [line] }])).toThrow(/2b batch 1/)
    }
  })

  it('refuses a command it does not implement', () => {
    expect(() => reduce([{ if: 'Gi0/0', lines: ['ip ospf 1 area 0'] }])).toThrow(
      /unrecognised command/
    )
  })

  it('feeds the evaluator: the golden satisfies the predicate family 1 would write', () => {
    const out = evaluate(
      {
        all: [
          { path: 'interfaces.GigabitEthernet0/0.ipv4.address', op: 'equals', value: '10.0.0.1' },
          { path: 'interfaces.GigabitEthernet0/0.adminUp', op: 'truthy' },
          { path: 'interfaces.GigabitEthernet0/0.description', op: 'contains', value: 'uplink' },
          { path: 'interfaces.GigabitEthernet0/0.ipv4.netmask', op: 'equals', value: '255.255.255.0' },
        ],
      },
      golden
    )
    expect(out.pass).toBe(true)
  })

  it('fails the same predicate against a device that was never brought up', () => {
    const state = reduce([{ if: 'GigabitEthernet0/0', lines: ['ip address 10.0.0.1 255.255.255.0'] }])
    const out = evaluate(
      { all: [{ path: 'interfaces.GigabitEthernet0/0.adminUp', op: 'truthy' }] },
      state
    )
    expect(out.pass).toBe(false)
  })
})