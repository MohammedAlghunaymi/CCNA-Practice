/**
 * Show-command renderers: device state to the text a student would read.
 *
 * This is the only module in the repository that turns state back into CLI
 * text, and it exists so the state machine can be *seen* rather than only
 * asserted against. `docs/PROJECT.md:126` is explicit that no grading path
 * parses this output: a question is graded against `expectedState`, never
 * against a string a renderer produced. So a renderer being wrong teaches a
 * student a wrong screen, which matters, but it cannot corrupt a score.
 *
 * ## Ordering is this module's whole responsibility
 *
 * Key enumeration order is not a usable ordering rule here: the engine hoists
 * ordinal keys, so `vlans` keyed `'10'`, `'1'`, `'100'` enumerates
 * `['1','10','100']` and the order would come from the engine rather than from
 * this code. Every renderer below therefore carries an explicit sort key, and
 * `compareInterfaces` is exported because `show running-config` sorts its
 * interface blocks with the same key — one rule, two call sites.
 *
 * ## What these renderers deliberately do not reproduce
 *
 * A fidelity delta is not an objective gap, so none of this belongs in
 * `src/data/not-emulated.json` (whose `gaps` are keyed by objective and whose
 * `objectiveId` is interpolated unvalidated into a published table). It is
 * recorded here instead.
 *
 * - `show vlan brief` has no `Status` and no `Ports` column: port membership is
 *   unmodelled until 2b batch 1.
 * - `show ip interface brief` has no `OK?`, `Method`, `Status` or `Protocol`
 *   columns, and no line-protocol state exists to put in them. `Admin` is
 *   administrative state alone.
 * - Column widths are this simulator's, chosen so the output is stable and
 *   readable. They are not measured against IOS.
 */

import { parseInterfaceName } from '../../state/interfaces.js'

/** Ranked interface prefixes, in the order a router lists them. */
const TYPE_RANK = ['GigabitEthernet', 'FastEthernet', 'Ethernet', 'Loopback']

/** What a VLAN with no `name` line reads as, rather than an empty cell. */
const VLAN_NAME_UNSET = 'VLAN NAME NOT SET'

/** Two columns of the table helper, so every renderer pads identically. */
const COLUMN_GAP = '  '

function typeRank(type) {
  const index = TYPE_RANK.indexOf(type)
  return index === -1 ? TYPE_RANK.length : index
}

/**
 * The total order over interface names, in five levels.
 *
 * 1. ranked prefix first, then every unranked prefix alphabetically
 * 2. **slot-array length ascending** — not a tie-break. `Serial1` sorts before
 *    `Serial0/0` because it sits one level up, which is what a router prints.
 * 3. slots element-wise ascending
 * 4. subinterface suffix numerically, absent (`null`) as `-1`
 * 5. the name **as it appears in state**, ascending
 *
 * Level 5 is the state key and not a name rebuilt from the parse, because the
 * rebuilt form cannot distinguish `Gi0/00` from `Gi0/0` and would leave their
 * order dependent on insertion.
 */
export function compareInterfaces(a, b) {
  const left = parseInterfaceName(a)
  const right = parseInterfaceName(b)

  const rankLeft = typeRank(left.type)
  const rankRight = typeRank(right.type)
  if (rankLeft !== rankRight) return rankLeft - rankRight
  if (left.type !== right.type) return left.type < right.type ? -1 : 1

  if (left.slots.length !== right.slots.length) return left.slots.length - right.slots.length

  for (let i = 0; i < left.slots.length; i += 1) {
    if (left.slots[i] !== right.slots[i]) return left.slots[i] - right.slots[i]
  }

  const suffixLeft = left.suffix ?? -1
  const suffixRight = right.suffix ?? -1
  if (suffixLeft !== suffixRight) return suffixLeft - suffixRight

  if (a === b) return 0
  return a < b ? -1 : 1
}

/**
 * Pad a header and its rows into aligned columns.
 *
 * Each column is as wide as its widest cell, so adding a longer interface name
 * reflows the table instead of truncating it. Trailing whitespace is stripped
 * per line so a byte comparison in a test is not sensitive to padding.
 */
function formatTable(headers, rows) {
  const widths = headers.map((header, column) =>
    Math.max(String(header).length, ...rows.map((row) => String(row[column]).length))
  )

  const line = (cells) =>
    cells
      .map((cell, column) => String(cell).padEnd(widths[column]))
      .join(COLUMN_GAP)
      .trimEnd()

  return [line(headers), ...rows.map(line)].join('\n')
}

/** `show vlan brief` — VLAN id and name, id ascending numerically. */
function renderShowVlanBrief(state) {
  const vlans = state.vlans ?? {}
  const rows = Object.keys(vlans)
    .map(Number)
    .sort((a, b) => a - b)
    .map((id) => [id, vlans[String(id)].name ?? VLAN_NAME_UNSET])

  return formatTable(['VLAN ID', 'Name'], rows)
}

/** `show ip interface brief` — the address and the administrative state. */
function renderShowIpInterfaceBrief(state) {
  const interfaces = state.interfaces ?? {}
  const rows = Object.keys(interfaces)
    .sort(compareInterfaces)
    .map((name) => {
      const address = interfaces[name].ipv4?.address
      return [
        name,
        address ?? 'unassigned',
        interfaces[name].adminUp ? 'up' : 'administratively down',
      ]
    })

  return formatTable(['Interface', 'IP-Address', 'Admin'], rows)
}

const RENDERERS = {
  'show ip interface brief': renderShowIpInterfaceBrief,
  'show vlan brief': renderShowVlanBrief,
}

/** The commands this module can render, and the four `not-emulated.json` names. */
export const RENDERED_COMMANDS = Object.freeze(Object.keys(RENDERERS))

/**
 * Render one show command against a device state.
 *
 * The command is normalised only for whitespace, so `"show  vlan  brief"` is
 * the same command as `"show vlan brief"`. Anything not in the registry throws:
 * an unknown command that silently rendered an empty screen would be
 * indistinguishable from a device with nothing to show.
 *
 * @param {string} command
 * @param {object} state a state from `reduceConfig`
 * @returns {string} the screen text, without a trailing newline
 */
export function render(command, state) {
  const normalised = String(command ?? '')
    .trim()
    .replace(/\s+/g, ' ')

  const renderer = RENDERERS[normalised]
  if (!renderer) {
    throw new Error(
      `render: no renderer for ${JSON.stringify(command)}. ` +
        `Implemented: ${RENDERED_COMMANDS.map((name) => `"${name}"`).join(', ')}`
    )
  }

  return renderer(state ?? {})
}
