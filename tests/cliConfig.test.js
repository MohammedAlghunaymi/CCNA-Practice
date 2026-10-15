import { describe, it, expect } from 'vitest'
import { parse } from '../src/device/cli/parser.js'
import { reduceConfig, applyCommand } from '../src/device/cli/commands/config.js'
import { reduce as reduceRouting } from '../src/device/state/routing.js'
import { reduce as reduceServices } from '../src/device/state/services.js'
import { reduce as reduceSecurity } from '../src/device/state/security.js'
import { tryResolve } from '../src/lib/expectedState.js'

/**
 * The parser and the dispatcher that binds it to the five reducers.
 *
 * These are the two seams a golden fixture cannot cover. A fixture pins the
 * state a reducer produces from an already-parsed input; it says nothing about
 * whether the text was split correctly on the way in, or whether each reducer
 * was handed the lines it owns. A config that parsed every line into `global`
 * would produce byte-identical goldens for `vlan` and `security` and grade a
 * student's answer wrong.
 */

/**
 * `hostname` is deliberately absent. It is real IOS global configuration and it
 * has no home among the five reducers `PROJECT.md` names, so this round refuses
 * it. A fixture that quietly dropped the line would test a configuration the
 * dispatcher never actually accepted; the refusal is asserted on its own below.
 */
const CONFIG = `!
vlan 10
 name management
!
interface GigabitEthernet0/0
 description uplink
 ip address 10.0.0.1 255.255.255.0
 no shutdown
!
interface GigabitEthernet0/1
 shutdown
!
ip route 0.0.0.0 10.0.0.254
ntp server 192.0.2.1
username alice privilege 15
ip ssh version 2
ip access-list extended 101
 permit ip any any
!
end`

describe('the parser splits text into blocks and globals', () => {
  it('reads one block per interface, keeping the lines in order', () => {
    const { interfaces } = parse('interface Gi0/0\n description a\n no shutdown\n')
    expect(interfaces).toEqual([
      { if: 'Gi0/0', lines: ['description a', 'no shutdown'] },
    ])
  })

  it('strips the vlan header, so the reducer is told which vlan it is reducing', () => {
    expect(parse('vlan 10\n name mgmt').vlan).toEqual([{ id: '10', lines: ['name mgmt'] }])
  })

  it('strips the acl header for the same reason', () => {
    expect(parse('ip access-list extended 101\n permit ip any any').acls).toEqual([
      { name: '101', lines: ['permit ip any any'] },
    ])
  })

  it('collects everything else as global lines', () => {
    expect(parse('hostname R1\nntp server 192.0.2.1').global).toEqual([
      'hostname R1',
      'ntp server 192.0.2.1',
    ])
  })

  it('drops a ! comment and the whitespace around it', () => {
    expect(parse('  hostname R1  ! the name\n').global).toEqual(['hostname R1'])
  })

  it('drops blank lines rather than passing an empty string to a reducer', () => {
    expect(parse('\n\n   \nhostname R1\n\n').global).toEqual(['hostname R1'])
  })

  it('handles CRLF, which is what a config pasted from Windows carries', () => {
    expect(parse('interface Gi0/0\r\n description a\r\n').interfaces).toEqual([
      { if: 'Gi0/0', lines: ['description a'] },
    ])
  })

  it('closes a block on a bare !, because show running-config has no exit', () => {
    // The real format. There is no `exit` line in that output at all.
    const out = parse('interface Gi0/0\n shutdown\n!\nip route 0.0.0.0 10.0.0.1')
    expect(out.interfaces).toEqual([{ if: 'Gi0/0', lines: ['shutdown'] }])
    expect(out.global).toEqual(['ip route 0.0.0.0 10.0.0.1'])
  })

  it('closes a block on a bare ! indented to nothing, since it is trimmed first', () => {
    expect(parse('interface Gi0/0\n shutdown\n   !\nhostname R1').global).toEqual(['hostname R1'])
  })

  it('does not let a trailing comment on a real command close the block', () => {
    // `! note` after a command is a comment, not a terminator, or every
    // annotated configuration would lose the lines after the first note.
    const out = parse('interface Gi0/0\n shutdown ! brought down for work\n no shutdown')
    expect(out.interfaces).toEqual([{ if: 'Gi0/0', lines: ['shutdown', 'no shutdown'] }])
  })

  it('closes a block on exit, putting later lines back in the global list', () => {
    const out = parse('interface Gi0/0\n shutdown\nexit\nntp server 192.0.2.1')
    expect(out.interfaces).toEqual([{ if: 'Gi0/0', lines: ['shutdown'] }])
    expect(out.global).toEqual(['ntp server 192.0.2.1'])
  })

  it('closes a block on end, which is a synonym for exit at the top level', () => {
    const out = parse('vlan 10\n name mgmt\nend\nhostname R1')
    expect(out.vlan).toEqual([{ id: '10', lines: ['name mgmt'] }])
    expect(out.global).toEqual(['hostname R1'])
  })

  it('closes a block when another header opens, because pasted configs omit the exit', () => {
    const out = parse('interface Gi0/0\n shutdown\ninterface Gi0/1\n no shutdown')
    expect(out.interfaces).toEqual([
      { if: 'Gi0/0', lines: ['shutdown'] },
      { if: 'Gi0/1', lines: ['no shutdown'] },
    ])
  })

  it('keeps an unterminated block, because IOS closes it at end of input', () => {
    expect(parse('interface Gi0/0\n shutdown').interfaces).toEqual([
      { if: 'Gi0/0', lines: ['shutdown'] },
    ])
  })

  it('does not scope by indentation, so a global line inside a block stays in the block', () => {
    // Deciding otherwise would need every line classified before any reducer
    // had spoken. The reducer refusing it is the honest answer.
    expect(parse('interface Gi0/0\n ip route 0.0.0.0 10.0.0.1').interfaces).toEqual([
      { if: 'Gi0/0', lines: ['ip route 0.0.0.0 10.0.0.1'] },
    ])
  })

  it('ignores a bare exit, which closes nothing', () => {
    expect(parse('exit\nhostname R1').global).toEqual(['hostname R1'])
  })

  it('refuses text that is not a string, rather than iterating undefined', () => {
    expect(() => parse(undefined)).toThrow(/must be a string/)
  })

  it('refuses a standard ACL, because this reducer models the extended form only', () => {
    // A standard entry has no protocol: `deny any`, not `deny ip any any`.
    // Reading it with the extended shape would store a rule missing the field
    // that says what it matches, and the golden for `security` would then hold
    // an entry that never existed on a device.
    expect(parse('ip access-list standard 99\n deny any').acls).toEqual([])
    expect(() => reduceConfig('ip access-list standard 99\n deny any')).toThrow(/no reducer claims/)
  })

  it('refuses a padded vlan id, so the grammar can never read it as an index', () => {
    // `vlan 010` has the shape of a VLAN id but is not one. Storing it would
    // create a key `vlans.10.name` can never reach, so the answer would differ
    // depending on how the path was spelled.
    expect(parse('vlan 010\n name mgmt').vlan).toEqual([{ id: '010', lines: ['name mgmt'] }])
    expect(() => reduceConfig('vlan 010\n name mgmt')).toThrow(/not canonical/)
    expect(tryResolve(reduceConfig('vlan 10\n name mgmt'), 'vlans.10.name').value).toBe('mgmt')
  })

  it('accepts a vlan id the grammar can address, including the largest', () => {
    const s = reduceConfig('vlan 4094\n name last')
    expect(tryResolve(s, 'vlans.4094.name').value).toBe('last')
  })

  it('reads the whole of a real configuration without losing a line', () => {
    const out = parse(CONFIG)
    expect(out.interfaces.map((b) => b.if)).toEqual(['GigabitEthernet0/0', 'GigabitEthernet0/1'])
    expect(out.vlan).toEqual([{ id: '10', lines: ['name management'] }])
    expect(out.acls).toEqual([{ name: '101', lines: ['permit ip any any'] }])
    expect(out.global).toEqual([
      'ip route 0.0.0.0 10.0.0.254',
      'ntp server 192.0.2.1',
      'username alice privilege 15',
      'ip ssh version 2',
    ])
  })
})

describe('reduceConfig builds a device from text, and every key resolves', () => {
  const state = reduceConfig(CONFIG)

  it('has exactly the six top-level keys the path grammar names', () => {
    expect(Object.keys(state).sort()).toEqual([
      'interfaces',
      'kind',
      'routing',
      'security',
      'services',
      'vlans',
    ])
  })

  it('resolves an interface path to the value the configuration gave', () => {
    expect(tryResolve(state, 'interfaces.GigabitEthernet0/0.ipv4.address').value).toBe('10.0.0.1')
    expect(tryResolve(state, 'interfaces.GigabitEthernet0/0.adminUp').value).toBe(true)
    expect(tryResolve(state, 'interfaces.GigabitEthernet0/1.adminUp').value).toBe(false)
  })

  it('resolves each reducer under its own namespace, not a flat pile of keys', () => {
    expect(tryResolve(state, 'vlans.10.name').value).toBe('management')
    expect(tryResolve(state, 'routing.static.0\\.0\\.0\\.0/0.nextHop').value).toBe('10.0.0.254')
    expect(tryResolve(state, 'services.ntp.peers.192\\.0\\.2\\.1.address').value).toBe('192.0.2.1')
    expect(tryResolve(state, 'security.ssh.version').value).toBe(2)
    expect(tryResolve(state, 'security.acls.101.entries.10.action').value).toBe('permit')
    expect(tryResolve(state, 'security.localPasswords.alice.privilege').value).toBe(15)
  })

  it('defaults to a router, and takes a switch when told', () => {
    expect(reduceConfig('').kind).toBe('router')
    expect(reduceConfig('', { kind: 'switch' }).kind).toBe('switch')
  })

  it('gives each reducer only the lines it owns', () => {
    // Every global-line reducer sees every global line and keeps only its own.
    // If routing kept the NTP peer, this is the assertion that fails.
    const s = reduceConfig('ntp server 192.0.2.1\nip route 0.0.0.0 10.0.0.1')
    expect(Object.keys(s.services.ntp.peers)).toEqual(['192.0.2.1'])
    expect(Object.keys(s.routing.static)).toEqual(['0.0.0.0/0'])
  })

  it('leaves a reducer untouched by a line it does not own', () => {
    // Skip, not throw. Without this a reducer handed the whole global block
    // would refuse every command belonging to a different one, and dispatch
    // could not exist at all.
    expect(reduceRouting(['ntp server 192.0.2.1', 'username alice privilege 15'])).toEqual(
      reduceRouting([])
    )
    expect(reduceServices(['ip route 0.0.0.0 10.0.0.1'])).toEqual(reduceServices([]))
    expect(reduceSecurity(['ip route 0.0.0.0 10.0.0.1'])).toEqual(reduceSecurity([]))
  })

  it('still throws on a line it owns and cannot parse', () => {
    // The other half of the split. A typo in routing's own vocabulary is a
    // broken configuration and must not pass as "someone else's line".
    expect(() => reduceRouting(['ip route nonsense 10.0.0.1'])).toThrow(/prefix/)
    expect(() => reduceServices(['ntp server'])).toThrow(/unrecognised/)
    expect(() => reduceSecurity(['username alice'])).toThrow(/unrecognised/)
  })

  it('still throws on an owned line that has no valid form at all', () => {
    // Distinct from the malformed-prefix case above: `ip route` is claimed by
    // routing and matches no rule, so it must reach the final refusal rather
    // than being skipped as though it belonged elsewhere.
    expect(() => reduceRouting(['ip route'])).toThrow(/not a route this reducer recognises/)
    expect(() => reduceRouting(['ip route 10.0.0.0/8'])).toThrow(/not a route this reducer/)
    expect(() => reduceServices(['ntp server'])).toThrow(/unrecognised command "ntp server"/)
  })

  it('refuses an owned line with no valid form through the dispatcher too', () => {
    // `ip route` is claimed, so it never reaches the "no reducer claims" branch.
    // The refusal has to come from the reducer that owns the vocabulary.
    expect(() => reduceConfig('ip route')).toThrow(/routing: "ip route" is not a route/)
  })

  it('defers a command from a later round, naming the round', () => {
    expect(() => reduceConfig('router ospf 1 area 0')).toThrow(/2b batch 2/)
  })

  it('reduces an empty configuration to a device with nothing configured', () => {
    const s = reduceConfig('')
    expect(s.interfaces).toEqual({})
    expect(s.vlans).toEqual({})
    expect(s.routing.static).toEqual({})
    expect(s.services.ntp.peers).toEqual({})
    expect(s.security.acls).toEqual({})
  })
})

describe('reduceConfig refuses what it cannot place', () => {
  it('refuses a global line no reducer owns, and names what is owned', () => {
    expect(() => reduceConfig('snmp-server community public RO')).toThrow(/no reducer claims 1/)
    expect(() => reduceConfig('snmp-server community public RO')).toThrow(/routing \(ip route/)
  })

  it('refuses hostname, which is real IOS configuration this round has no home for', () => {
    // Recorded as a boundary rather than left as a surprise. Adding it is a
    // plan change - a sixth namespace - not something to smuggle into a
    // dispatcher.
    expect(() => reduceConfig('hostname R1')).toThrow(/no reducer claims 1 configuration line/)
    expect(parse('hostname R1').global).toEqual(['hostname R1'])
  })

  it('names every unowned line rather than only the first', () => {
    expect(() => reduceConfig('snmp-server community public RO\nlogging trap debugging')).toThrow(
      /snmp-server community public RO.*logging trap debugging/s
    )
  })

  it('refuses a global command typed inside an interface block', () => {
    // The block rule is the parser's; the refusal is the reducer's. Whichever
    // file owns it, the configuration does not silently lose the command - and
    // the message names the block that swallowed it, not a bare "unknown".
    expect(() => reduceConfig('interface Gi0/0\n ip route 0.0.0.0 10.0.0.1')).toThrow(
      /interface Gi0\/0: unrecognised command "ip route 0\.0\.0\.0 10\.0\.0\.1"/
    )
  })

  it('refuses a plaintext secret rather than storing one', () => {
    expect(() => reduceConfig('username alice privilege 15 secret hunter2')).toThrow(
      /plaintext secret is refused/
    )
  })

  it('refuses a block line the owning reducer cannot parse, naming the block', () => {
    expect(() => reduceConfig('vlan 10\n shutdown')).toThrow(/vlan 10: unrecognised command "shutdown"/)
  })
})

describe('applyCommand is a transaction on a copied state', () => {
  const base = reduceConfig('ip route 10.0.0.0/8 10.0.0.1\nntp server 192.0.2.1')

  it('returns a new object, and leaves the one it was given alone', () => {
    const before = JSON.stringify(base)
    const next = applyCommand(base, 'ip route 192.168.0.0/16 10.0.0.2')
    expect(next).not.toBe(base)
    expect(JSON.stringify(base)).toBe(before)
  })

  it('adds to the reducer that owns the command, and to no other', () => {
    const next = applyCommand(base, 'ip route 192.168.0.0/16 10.0.0.2')
    expect(Object.keys(next.routing.static).sort()).toEqual(['10.0.0.0/8', '192.168.0.0/16'])
    expect(Object.keys(next.services.ntp.peers)).toEqual(['192.0.2.1'])
    expect(next.interfaces).toBe(base.interfaces)
  })

  it('routes a services command to services', () => {
    const next = applyCommand(base, 'ntp server 198.51.100.1')
    expect(Object.keys(next.services.ntp.peers).sort()).toEqual(['192.0.2.1', '198.51.100.1'])
  })

  it('routes a security command to security', () => {
    const next = applyCommand(base, 'ip ssh version 2')
    expect(next.security.ssh.version).toBe(2)
    expect(Object.keys(next.routing.static)).toEqual(['10.0.0.0/8'])
  })

  it('refuses a command that opens a block, naming the path that does take it', () => {
    expect(() => applyCommand(base, 'interface Gi0/0')).toThrow(/opens a block/)
    expect(() => applyCommand(base, 'interface Gi0/0')).toThrow(/reduceConfig/)
  })

  it('refuses a command no reducer owns', () => {
    expect(() => applyCommand(base, 'snmp-server community public RO')).toThrow(/no reducer claims/)
  })

  it('refuses an empty command rather than silently doing nothing', () => {
    expect(() => applyCommand(base, '   ')).toThrow(/empty command/)
  })

  it('refuses a paste of more than one command, since only one is a transaction', () => {
    expect(() => applyCommand(base, 'ntp server 198.51.100.1\nntp server 198.51.100.2')).toThrow(
      /expected one command, got 2/
    )
  })

  it('leaves the state untouched when the command is refused', () => {
    const before = JSON.stringify(base)
    expect(() => applyCommand(base, 'username bob privilege 15 secret x')).toThrow()
    expect(JSON.stringify(base)).toBe(before)
  })
})
