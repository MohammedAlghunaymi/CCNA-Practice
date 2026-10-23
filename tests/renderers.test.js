/**
 * The show-command renderers.
 *
 * Every expected screen below is **hand-written**, never captured from the
 * implementation. A fixture generated from the module under test would make a
 * wrong column order or a wrong sort self-consistent and green, which is the one
 * failure mode this file exists to catch.
 */

import { describe, expect, it } from 'vitest'

import notEmulated from '../src/data/not-emulated.json'
import { parseInterfaceName } from '../src/device/state/interfaces.js'
import { reduceConfig } from '../src/device/cli/commands/config.js'
import {
  RENDERED_COMMANDS,
  compareInterfaces,
  render,
} from '../src/device/cli/commands/render.js'

/** Sorted here so both directions of the comparison are visible. */
const order = (names) => [...names].sort(compareInterfaces)

describe('parseInterfaceName', () => {
  it('reads a subinterface suffix as its own field', () => {
    // The old regex folded the dot into the type, yielding
    // `{ type: 'GigabitEthernet0/0.', slots: [100] }` — no suffix to sort on.
    expect(parseInterfaceName('GigabitEthernet0/0.100')).toEqual({
      type: 'GigabitEthernet',
      slots: [0, 0],
      suffix: 100,
    })
  })

  it('reports an absent suffix as null, not as zero', () => {
    expect(parseInterfaceName('GigabitEthernet0/0')).toEqual({
      type: 'GigabitEthernet',
      slots: [0, 0],
      suffix: null,
    })
  })

  it('round-trips the shapes the fixtures use', () => {
    expect(parseInterfaceName('Loopback0')).toEqual({ type: 'Loopback', slots: [0], suffix: null })
    expect(parseInterfaceName('Serial0/0/0')).toEqual({
      type: 'Serial',
      slots: [0, 0, 0],
      suffix: null,
    })
    expect(parseInterfaceName('Port-channel1.5')).toEqual({
      type: 'Port-channel',
      slots: [1],
      suffix: 5,
    })
    expect(parseInterfaceName('Vlan100')).toEqual({ type: 'Vlan', slots: [100], suffix: null })
    expect(parseInterfaceName('BVI1')).toEqual({ type: 'BVI', slots: [1], suffix: null })
    expect(parseInterfaceName('mgmt0')).toEqual({ type: 'mgmt', slots: [0], suffix: null })
  })

  it('normalises a zero-padded slot rather than rejecting it', () => {
    expect(parseInterfaceName('Gi0/00')).toEqual(parseInterfaceName('Gi0/0'))
  })
})

describe('compareInterfaces', () => {
  it('sorts a subinterface by its suffix, not by its full name', () => {
    // A full-name sort reverses this pair: "Gi0/0.100" < "Gi0/0.2" as text.
    expect(order(['Gi0/0.100', 'Gi0/0.2'])).toEqual(['Gi0/0.2', 'Gi0/0.100'])
  })

  it('sorts by slot depth before slot content', () => {
    // Element-wise over the shorter length would put Serial0/0 first (0 < 1).
    expect(order(['Serial0/0', 'Serial1'])).toEqual(['Serial1', 'Serial0/0'])
  })

  it('puts a subinterface ahead of the next slot on the same parent', () => {
    expect(order(['Gi0/1', 'Gi0/0.1'])).toEqual(['Gi0/0.1', 'Gi0/1'])
  })

  it('breaks a parse tie on the state key, so insertion order cannot decide', () => {
    // Both parse identically. Array#sort is stable, so without the terminal
    // tiebreak this would stay in insertion order.
    expect(order(['Gi0/00', 'Gi0/0'])).toEqual(['Gi0/0', 'Gi0/00'])
  })

  it('ranks the four named prefixes, then every other prefix alphabetically', () => {
    expect(
      order([
        'Vlan10',
        'Loopback0',
        'Ethernet0/0',
        'Serial0/0',
        'FastEthernet0/0',
        'GigabitEthernet0/0',
      ])
    ).toEqual([
      'GigabitEthernet0/0',
      'FastEthernet0/0',
      'Ethernet0/0',
      'Loopback0',
      'Serial0/0',
      'Vlan10',
    ])
  })

  it('is a total order over every name shape the fixtures use', () => {
    const names = [
      'Gi0/0',
      'Gi0/0.1',
      'Gi0/0.100',
      'Gi0/1',
      'Gi0/00',
      'Serial0/0',
      'Serial1',
      'Loopback0',
      'Vlan10',
      'mgmt0',
      'Port-channel1.5',
      'BVI1',
      'GigabitEthernet0/0.2',
    ]

    const sign = (n) => Math.sign(n)

    for (const a of names) {
      expect(compareInterfaces(a, a)).toBe(0)
      for (const b of names) {
        // Antisymmetry: a comparator that reports both directions as negative
        // makes the sort result depend on the engine's own comparisons. Stated
        // as a sum so a tie is `0 + 0`, not the signed-zero trap of `-sign(0)`.
        expect(sign(compareInterfaces(a, b)) + sign(compareInterfaces(b, a))).toBe(0)
        for (const c of names) {
          if (compareInterfaces(a, b) <= 0 && compareInterfaces(b, c) <= 0) {
            expect(compareInterfaces(a, c)).toBeLessThanOrEqual(0)
          }
        }
      }
    }

    // Sorting is idempotent, which a non-total comparator cannot guarantee.
    const once = order(names)
    expect(order(once)).toEqual(once)
  })
})

describe('the renderer registry', () => {
  it('can only render commands the data file already claims', () => {
    for (const command of RENDERED_COMMANDS) {
      expect(notEmulated.renderedShowCommands).toContain(command)
    }
  })

  it('implements exactly the commands this step claims, both directions', () => {
    // Checked against a hardcoded list as well as the JSON, because a registry
    // compared only against the JSON is self-referential.
    expect([...RENDERED_COMMANDS].sort()).toEqual(
      ['show ip interface brief', 'show vlan brief'].sort()
    )
  })

  it('throws on a command it cannot render', () => {
    // A renderer that returned an empty screen here would be indistinguishable
    // from a device with nothing to show.
    expect(() => render('show ipv6 route', {})).toThrow(/no renderer/)
    expect(() => render('', {})).toThrow(/no renderer/)
  })

  it('treats runs of whitespace as the same command', () => {
    expect(render('  show   vlan   brief  ', { vlans: {} })).toBe('VLAN ID  Name')
  })
})

describe('show vlan brief', () => {
  const state = reduceConfig(
    [
      'vlan 10',
      ' name mgmt',
      'vlan 1',
      ' name default',
      'vlan 20',
    ].join('\n')
  )

  it('prints ids in numeric order, so 10 never precedes 2', () => {
    expect(render('show vlan brief', state)).toBe(
      [
        'VLAN ID  Name',
        '1        default',
        '10       mgmt',
        '20       VLAN NAME NOT SET',
      ].join('\n')
    )
  })
})

describe('show ip interface brief', () => {
  const state = reduceConfig(
    [
      'interface GigabitEthernet0/0',
      ' description uplink to core',
      ' ip address 10.0.0.1 255.255.255.0',
      ' no shutdown',
      'interface GigabitEthernet0/1',
      ' shutdown',
    ].join('\n')
  )

  it('reports the address and the administrative state, and nothing invented', () => {
    expect(render('show ip interface brief', state)).toBe(
      [
        'Interface           IP-Address  Admin',
        'GigabitEthernet0/0  10.0.0.1    up',
        'GigabitEthernet0/1  unassigned  administratively down',
      ].join('\n')
    )
  })

  it('distinguishes an interface that was never touched from one that was shut', () => {
    const untouched = reduceConfig(['interface GigabitEthernet0/2'].join('\n'))
    // Both read administratively down — the column is administrative state, and
    // that is the honest answer for both. `show running-config` is what tells
    // them apart, from `shutdownCommand`.
    expect(render('show ip interface brief', untouched)).toBe(
      ['Interface           IP-Address  Admin', 'GigabitEthernet0/2  unassigned  administratively down'].join(
        '\n'
      )
    )
  })
})
