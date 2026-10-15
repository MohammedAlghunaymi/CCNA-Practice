import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { tryResolve } from '../src/lib/expectedState.js'
import { reduce as reduceInterfaces, initialState as initialInterfaces } from '../src/device/state/interfaces.js'
import { reduce as reduceVlan, vlanKey, initialState as initialVlan } from '../src/device/state/vlan.js'
import { reduce as reduceRouting, initialState as initialRouting } from '../src/device/state/routing.js'
import { reduce as reduceServices, initialState as initialServices } from '../src/device/state/services.js'
import { reduce as reduceSecurity, initialState as initialSecurity } from '../src/device/state/security.js'

/**
 * Every reducer's declared empty state, checked against `reduce([])`.
 *
 * Without this, `initialState` is never executed: `reduce` spreads its `previous`
 * argument, so a reducer whose `initialState` returned a list instead of an
 * object would still pass every golden, because the spread rebuilt the shape.
 * That mutation was run and it passed. It does not now.
 */
const INITIAL_STATES = {
  interfaces: [reduceInterfaces, initialInterfaces],
  vlan: [reduceVlan, initialVlan],
  routing: [reduceRouting, initialRouting],
  services: [reduceServices, initialServices],
  security: [reduceSecurity, initialSecurity],
}

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const STATE_DIR = join(root, 'src/device/state')

/** The five reducers `PROJECT.md:138` names. Adding a sixth is a plan change. */
const EXPECTED_REDUCERS = ['interfaces', 'routing', 'security', 'services', 'vlan']

const golden = (name) => JSON.parse(readFileSync(join(root, 'tests/fixtures/state', `${name}.json`), 'utf8'))

/**
 * Two fixtures per reducer, and the adversarial one is named per reducer
 * rather than being one blanket "the escape case". A single shared adversarial
 * case was unsatisfiable for reducers whose namespace holds no dotted key —
 * they would have ended up with the minimal fixture and a different value,
 * which detects nothing.
 */
const CASES = {
  interfaces: {
    reduce: reduceInterfaces,
    minimal: () => [
      {
        if: 'GigabitEthernet0/0',
        lines: ['description uplink to core', 'ip address 10.0.0.1 255.255.255.0', 'no shutdown'],
      },
    ],
    adversarial: () => [
      { if: 'GigabitEthernet0/0', lines: ['ip address 1.0.0.1 255.255.255.0', 'no shutdown'] },
      { if: 'GigabitEthernet0/1', lines: ['ip address 1.0.0.10 255.255.255.0', 'no shutdown'] },
    ],
    // 1.0.0.1 and 1.0.0.10 share a lexical prefix and differ by slot.
    adversarialPaths: ['interfaces.GigabitEthernet0/0.ipv4.address', 'interfaces.GigabitEthernet0/1.ipv4.address'],
    adversarialValues: ['1.0.0.1', '1.0.0.10'],
  },
  vlan: {
    reduce: reduceVlan,
    minimal: () => ['vlan 10', 'name mgmt'],
    adversarial: () => ['vlan 1', 'name default', 'vlan 10', 'name mgmt'],
    // A list would make vlan.10 the eleventh entry; here it is the key "10".
    adversarialPaths: ['vlans.1.name', 'vlans.10.name'],
    adversarialValues: ['default', 'mgmt'],
  },
  routing: {
    reduce: reduceRouting,
    minimal: () => ['ip route 0.0.0.0 10.0.0.254'],
    adversarial: () => [
      'ip route 2001:db8::/32 2001:db8::1',
      'ip route 192.168.1.0/24 192.168.1.254',
      'ip route 10.0.0.0/8 10.0.0.254 200',
    ],
    // The IPv6 prefix has no dot and needs no escape; the two IPv4 keys do.
    adversarialPaths: [
      'static.2001:db8::/32.nextHop',
      'static.192\\.168\\.1\\.0/24.nextHop',
      'static.10\\.0\\.0\\.0/8.distance',
    ],
    adversarialValues: ['2001:db8::1', '192.168.1.254', 200],
  },
  services: {
    reduce: reduceServices,
    minimal: () => ['ntp server 192.0.2.1'],
    adversarial: () => [
      'ntp server 192.168.1.1',
      'ntp server 192.168.1.10',
      'ip nat pool MGMT netmask 255.255.255.0',
      'ip nat inside global 1',
    ],
    // Both peers need their dots escaped; dropping one splits into four keys.
    adversarialPaths: ['ntp.peers.192\\.168\\.1\\.1.address', 'ntp.peers.192\\.168\\.1\\.10.address'],
    adversarialValues: ['192.168.1.1', '192.168.1.10'],
  },
  security: {
    reduce: reduceSecurity,
    minimal: () => ['ip access-list extended 101', 'access-list 101 permit ip any any'],
    adversarial: () => [
      'ip access-list extended 15',
      'access-list 15 deny tcp any any eq 23',
      'ip access-list extended 101',
      'access-list 101 permit ip any any',
    ],
    // ACL 15 is a lexical prefix of ACL 101; a sloppy matcher crosses them.
    adversarialPaths: ['acls.15.entries.10.action', 'acls.101.entries.10.action'],
    adversarialValues: ['deny', 'permit'],
  },
}

describe('the reducer set matches the plan, in both directions', () => {
  const present = () =>
    readdirSync(STATE_DIR)
      .filter((f) => f.endsWith('.js'))
      .map((f) => f.replace(/\.js$/, ''))
      .sort()

  it('every reducer on disk is one the plan names', () => {
    // Direction A. A hardcoded list alone would miss an added module, which is
    // how "a reducer added without a fixture fails" was false in an earlier draft.
    for (const name of present()) expect(EXPECTED_REDUCERS).toContain(name)
  })

  it('every reducer the plan names exists on disk', () => {
    // Direction B. A hardcoded list alone would miss a deleted one.
    for (const name of EXPECTED_REDUCERS) expect(present()).toContain(name)
  })
})

describe('each reducer declares an empty state that is actually reachable', () => {
  for (const [name, [reduce, initialState]] of Object.entries(INITIAL_STATES)) {
    it(`${name} reduces an empty config to its own initial state`, () => {
      expect(reduce([])).toEqual(initialState())
    })

    it(`${name} initial state is an object, never a list`, () => {
      // Every namespace in these five reducers is keyed by an identifier IOS
      // shows, so none of them is positional. A list here is the mistake this
      // asserts against.
      expect(Array.isArray(initialState())).toBe(false)
    })
  }
})

describe('each reducer matches its goldens byte for byte', () => {
  for (const [name, spec] of Object.entries(CASES)) {
    it(`${name} minimal`, () => {
      expect(JSON.stringify(spec.reduce(spec.minimal()), null, 2)).toBe(
        JSON.stringify(golden(`${name}.min`), null, 2)
      )
    })

    it(`${name} adversarial`, () => {
      expect(JSON.stringify(spec.reduce(spec.adversarial()), null, 2)).toBe(
        JSON.stringify(golden(`${name}.adv`), null, 2)
      )
    })

    it(`${name} adversarial paths resolve to their own values, not a neighbour's`, () => {
      const state = spec.reduce(spec.adversarial())
      spec.adversarialPaths.forEach((path, i) => {
        const resolved = tryResolve(state, path)
        expect(`${path} -> ${resolved.ok}`).toBe(`${path} -> true`)
        expect(resolved.value).toEqual(spec.adversarialValues[i])
      })
    })
  }
})

describe('reducer behaviour, beyond the fixtures', () => {
  it('vlan refuses a name with no vlan block', () => {
    expect(() => reduceVlan(['name mgmt'])).toThrow(/preceding "vlan <id>"/)
  })

  it('vlanKey refuses a padded id, so the grammar can never read it as an index', () => {
    expect(vlanKey(10)).toBe('10')
    expect(vlanKey(0)).toBe('0')
    expect(() => vlanKey('01')).toThrow(/not canonical/)
  })

  it('routing normalises a default route written without a length', () => {
    const state = reduceRouting(['ip route 0.0.0.0 10.0.0.254'])
    expect(Object.keys(state.static)).toEqual(['0.0.0.0/0'])
  })

  it('routing defaults an omitted distance to 1 and keeps an explicit one', () => {
    const state = reduceRouting([
      'ip route 10.0.0.0/8 10.0.0.1',
      'ip route 172.16.0.0/12 10.0.0.2 200',
    ])
    expect(state.static['10.0.0.0/8'].distance).toBe(1)
    expect(state.static['172.16.0.0/12'].distance).toBe(200)
  })

  it('routing keeps two routes whose prefixes share a lexical prefix', () => {
    const state = reduceRouting(['ip route 192.168.1.0/24 10.0.0.1', 'ip route 192.168.1.128/25 10.0.0.2'])
    expect(Object.keys(state.static).sort()).toEqual(['192.168.1.0/24', '192.168.1.128/25'])
  })

  it('routing refuses a malformed prefix and a prefix length past the family', () => {
    expect(() => reduceRouting(['ip route nonsense 10.0.0.1'])).toThrow(/prefix/)
    expect(() => reduceRouting(['ip route 10.0.0.0/33 10.0.0.1'])).toThrow(/exceeds \/32/)
    expect(() => reduceRouting(['ip route 2001:db8::/129 2001:db8::1'])).toThrow(/exceeds \/128/)
  })

  it('services applies ntp min-version to every peer, and does not duplicate a peer', () => {
    const state = reduceServices([
      'ntp server 10.0.0.1',
      'ntp server 10.0.0.1',
      'ntp min-version 3',
    ])
    expect(Object.keys(state.ntp.peers)).toEqual(['10.0.0.1'])
    expect(state.ntp.peers['10.0.0.1'].minimumVersion).toBe(3)
  })

  it('services refuses the interface-scoped NAT designation and says where it goes', () => {
    expect(() => reduceServices(['ip nat inside source static 10.0.0.5 10.0.0.1'])).toThrow(
      /interfaces reducer/
    )
  })

  it('security refuses a plaintext secret rather than storing one', () => {
    expect(() => reduceSecurity(['username alice privilege 15 secret hunter2'])).toThrow(
      /plaintext secret is refused/
    )
  })

  it('security stores a user with no secret, which is not a credential', () => {
    const state = reduceSecurity(['username alice privilege 15'])
    expect(state.localPasswords.alice).toEqual({ name: 'alice', privilege: 15, secret: null })
  })

  it('security gives numbered ACL entries an implicit 10, 20, 30 sequence', () => {
    const state = reduceSecurity([
      'ip access-list extended 101',
      'access-list 101 permit ip any any',
      'access-list 101 deny tcp any any eq 23',
    ])
    expect(Object.keys(state.acls['101'].entries)).toEqual(['10', '20'])
    expect(state.acls['101'].entries['20'].options).toBe('eq 23')
  })

  it('security keeps the ACL entry options, because they change what a rule matches', () => {
    const withOptions = reduceSecurity(['ip access-list extended 101', 'access-list 101 permit tcp any any eq 443'])
    const without = reduceSecurity(['ip access-list extended 101', 'access-list 101 permit tcp any any'])
    expect(withOptions.acls['101'].entries['10'].options).toBe('eq 443')
    expect(without.acls['101'].entries['10'].options).toBe(null)
  })

  it('security refuses a named-list entry with no list open', () => {
    expect(() => reduceSecurity(['10 permit ip any any'])).toThrow(/preceding "ip access-list extended/)
  })
})

describe('the device axis, decided by the code rather than by argument', () => {
  // These four are the cases where a plan-level mapping put a command in the
  // wrong tree. Each one is now refused by the reducer that should not own it,
  // which is the cheapest way to keep the boundary from drifting.

  it('port security is refused by security, because it configures an interface', () => {
    expect(() => reduceSecurity(['switchport port-security maximum 3'])).toThrow(
      /interface configuration and belongs at interfaces/
    )
  })

  it('switchport is refused by interfaces, because it arrives with 2b batch 1', () => {
    expect(() => reduceInterfaces([{ if: 'Gi0/0', lines: ['switchport mode access'] }])).toThrow(
      /2b batch 1/
    )
  })

  it('the NAT designation is refused by services, because it configures an interface', () => {
    expect(() => reduceServices(['ip nat inside source static 10.0.0.5 10.0.0.1'])).toThrow(
      /interfaces reducer/
    )
  })

  it('ip nat inside global, the entity half, is accepted by services', () => {
    const state = reduceServices(['ip nat pool MGMT netmask 255.255.255.0', 'ip nat inside global 1'])
    expect(state.nat.inside).toEqual(['1'])
    expect(state.nat.pools.MGMT.netmask).toBe('255.255.255.0')
  })

  it('no reducer silently accepts a command belonging to another', () => {
    // Each of these is owned by some other reducer or round; none may be a no-op.
    const owned = [
      [reduceSecurity, ['switchport port-security maximum 3']],
      [reduceSecurity, ['username bob privilege 15 secret x']],
      [reduceServices, ['ip nat inside source static 10.0.0.5 10.0.0.1']],
      [reduceServices, ['ip dhcp pool LAN']],
      [reduceInterfaces, [{ if: 'Gi0/0', lines: ['spanning-tree portfast'] }]],
      [reduceInterfaces, [{ if: 'Gi0/0', lines: ['switchport mode trunk'] }]],
      [reduceRouting, ['router ospf 1 area 0']],
      [reduceVlan, ['vlan 10', 'name', 'x', 'y']],
    ]
    for (const [fn, input] of owned) {
      let threw = false
      try {
        fn(input)
      } catch {
        threw = true
      }
      expect(`${threw}`).toBe('true')
    }
  })
})