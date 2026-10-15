/**
 * CLI text to the structure the reducers consume.
 *
 * Parsing is separated from state for one reason: it is the only reason a golden
 * fixture is worth having. A reducer can be tested against the real shape of a
 * configuration without a parser standing in the way, and the parser can be
 * tested against real configuration text without a reducer inventing state.
 *
 * ## What comes out
 *
 *     {
 *       interfaces: [{ if, lines }],   // one per "interface X" block
 *       vlan:       [{ id, lines }],   // one per "vlan N" block, header stripped
 *       acls:       [{ name, lines }], // one per "ip access-list extended N"
 *       global:     [line, ...],       // every line that belongs to no block
 *     }
 *
 * Block headers are stripped because the owning reducer is told which VLAN or
 * which ACL it is reducing. Re-parsing `vlan 10` inside the block that was
 * split out by `10` would mean the same fact carried in two places.
 *
 * ## Block scoping
 *
 * A block runs until `exit`, until another block header opens, or until a line
 * containing nothing but `!`.
 *
 * That last one is the important one, and it is a fact about the format rather
 * than a convenience. `show running-config` output has **no `exit` in it at
 * all**:
 *
 *     interface GigabitEthernet0/0
 *      description uplink
 *     !
 *     ip route 0.0.0.0 10.0.0.254
 *
 * The `!` on its own line is what ends the block. A parser that treats `!` as
 * comment-and-nothing-else reads the `ip route` as interface configuration and
 * refuses a configuration the device is actually running.
 *
 * A pasted configuration also often omits the `exit`, and refusing a
 * valid-looking config because someone deleted one would be pedantry in the
 * wrong place.
 *
 * A block is **not** scoped by indentation. So a global command typed inside a
 * block with no terminator stays in that block, and the owning reducer refuses
 * it with a message naming what it expected. Deciding otherwise would need each
 * line classified as interface-scoped or global before any reducer had spoken,
 * and that classification is exactly the thing the reducers own.
 *
 * ## Comments
 *
 * `!` runs to end of line, as on IOS. A line that is *only* `!` is checked
 * before the comment is stripped, because that line is a block terminator and
 * stripping it first would lose the fact.
 */

const INTERFACE = /^interface (\S+)$/
const VLAN = /^vlan (\d{1,4})$/
const ACL = /^ip access-list extended (\S+)$/
const EXIT = /^(exit|end)$/

const BLOCK_OPENERS = [
  { pattern: INTERFACE, key: 'interfaces', name: (m) => ({ if: m[1] }) },
  { pattern: VLAN, key: 'vlan', name: (m) => ({ id: m[1] }) },
  { pattern: ACL, key: 'acls', name: (m) => ({ name: m[1] }) },
]

/**
 * Parse configuration text.
 *
 * @param {string} text
 * @returns {{interfaces: Array, vlan: Array, acls: Array, global: string[]}}
 */
export function parse(text) {
  if (typeof text !== 'string') throw new Error('configuration text must be a string')

  const out = { interfaces: [], vlan: [], acls: [], global: [] }
  let current = null

  for (const raw of text.split(/\r?\n/)) {
    const trimmed = raw.trim()

    // Checked before the comment is stripped: in `show running-config` output a
    // bare `!` is the line that ends a block, and there is no `exit` to do it.
    if (trimmed === '!') {
      current = null
      continue
    }

    const line = trimmed.split('!')[0].trim()
    if (!line) continue

    if (EXIT.test(line)) {
      current = null
      continue
    }

    const opener = BLOCK_OPENERS.find((candidate) => candidate.pattern.test(line))
    if (opener) {
      const block = { ...opener.name(opener.pattern.exec(line)), lines: [] }
      out[opener.key].push(block)
      current = block
      continue
    }

    if (current) current.lines.push(line)
    else out.global.push(line)
  }

  // An unterminated block is still a block: `current` is simply dropped here,
  // and whatever it had collected stays with it, which is what IOS does at end
  // of input.
  return out
}