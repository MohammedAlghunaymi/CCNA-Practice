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
 * ### The two brief shows
 *
 * - `show vlan brief` has no `Status` and no `Ports` column: port membership is
 *   unmodelled until 2b batch 1.
 * - `show ip interface brief` has no `OK?`, `Method`, `Status` or `Protocol`
 *   columns, and no line-protocol state exists to put in them. `Admin` is
 *   administrative state alone.
 * - Column widths are this simulator's, chosen so the output is stable and
 *   readable. They are not measured against IOS.
 *
 * ### `show ip route`
 *
 * - `Codes` is `S` for every entry, because `routing.static` holds no other kind
 *   of route. There is no `L`, `C`, `O`, `B` or `D` line to show.
 * - No `is variably subnetted` grouping headers and no `[distance/metric]`
 *   bracket: `routing.js` cannot express a metric, so the bracket would always
 *   be a lie about a number that does not exist.
 * - The sort order is this simulator's. No single total order reproducing IOS
 *   has been established, and none is claimed here.
 * - IPv6 routes are **filtered out** rather than rendered. On IOS an IPv6 route
 *   is configured with `ipv6 route` and read with `show ipv6 route`, which
 *   `docs/PROJECT.md:126` does not list among the four rendered commands;
 *   printing one inside an IPv4 table teaches a table no device emits. There is
 *   deliberately no `src/lib/ipv6.js`.
 *
 * ### `show running-config`
 *
 * - No `Building configuration` / `Current configuration : N bytes` preamble,
 *   no `version`, `boot-start-marker`, `service password-encryption`,
 *   `no ip cef`, `ip routing` or trailing `end`.
 * - No blank line between sections, where IOS separates them.
 * - Every block **is** terminated by a bare `!`. This is not cosmetic: the
 *   parser scopes a block by `!`, `exit`, or the next block header
 *   (`parser.js:85`), so an unterminated block here would swallow the globals
 *   that follow and hand them to a reducer that rightly refuses them. It is also
 *   what real running-config output looks like, which is why the parser
 *   documents that `!` at all.
 * - Named ACL entries are rendered flush-left; IOS indents them inside the
 *   block. The parser does not scope by indentation, so this is cosmetic.
 * - `ip route` is written in CIDR (`ip route 10.0.0.0/8 …`), not in IOS's
 *   dotted-decimal mask form. The parser's `STATIC` regex
 *   (`routing.js:17`) only accepts the CIDR spelling — the dotted form parses as
 *   `prefix=10.0.0.0 nextHop=255.0.0.0` and then fails, so emitting what IOS
 *   prints would emit text this repository's own parser refuses.
 * - `ntp min-version` is emitted only when the smallest peer version differs
 *   from the seed `minimumVersion: 4` (`services.js:66`). State cannot tell a
 *   student who typed `ntp min-version 4` from one who typed nothing, so the
 *   rule is the same one that governs `shutdownCommand`: never print a line the
 *   student almost certainly never typed. Omitting it always round-trips,
 *   because absence re-parses to the seed.
 * - DHCP pools are **not** rendered at all, because no configuration can
 *   produce one: `ip dhcp pool` is refused outright (`services.js:115`,
 *   "arrives with 2b batch 2"), so `services.dhcp.pools` is empty for every
 *   state reachable from text. A section that can never be populated would be a
 *   line no student typed.
 * - An interface whose `description` is the empty string prints no
 *   `description` line. `interfaces.js:99` stores `''` for both "typed nothing"
 *   and "typed a blank description", so the two cannot be told apart — the same
 *   ambiguity `shutdownCommand` exists to resolve, and it has no command
 *   counterpart to resolve it with.
 */

import { parseInterfaceName } from '../../state/interfaces.js'
import { ipToInt } from '../../../lib/ipv4.js'

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

/** The `services.js:66` seed: what an untouched peer reports. */
const NTP_MIN_VERSION_SEED = 4

/** Sorts after every IPv4 peer, for an `ntp server` that carries a hostname. */
const NON_IPV4_SORT_KEY = Number.MAX_SAFE_INTEGER

/** Text order in code-unit space, so a result never depends on the locale. */
function textCompare(a, b) {
  if (a === b) return 0
  return a < b ? -1 : 1
}

/**
 * A sortable number for a peer address.
 *
 * `ntp server` accepts any non-space token, so a hostname reaches state
 * legitimately and ordering must not throw on a configuration that parsed.
 */
function ipv4SortKey(address) {
  try {
    return ipToInt(address)
  } catch {
    return NON_IPV4_SORT_KEY
  }
}

function routeParts(prefix) {
  const [network, length] = String(prefix).split('/')
  return { network, length: Number(length), colon: network.includes(':') }
}

/**
 * The total order over routes, shared by `show ip route` and the
 * `show running-config` route section.
 *
 * Distance ascending, then IPv6 behind IPv4 **at equal distance**, then prefix
 * length **descending**, then the network numerically, then the prefix as text.
 * The colon test has to be a level of its own rather than part of the network
 * comparison: `ipToInt` throws on an IPv6 address, so handing it one would fail
 * the sort instead of ordering it behind its IPv4 peers.
 */
export function compareRoutes(a, b) {
  const left = routeParts(a.prefix)
  const right = routeParts(b.prefix)

  if (a.distance !== b.distance) return a.distance - b.distance
  if (left.colon !== right.colon) return left.colon ? 1 : -1
  if (left.length !== right.length) return right.length - left.length
  if (!left.colon) {
    const network = ipToInt(left.network) - ipToInt(right.network)
    if (network !== 0) return network
  }
  return textCompare(a.prefix, b.prefix)
}

/**
 * ACL list names: every all-digit name before every other name, so the numbered
 * branch and the named branch never interleave.
 *
 * The terminal text key is not decoration. `Number('01') === Number('1')`, so
 * numeric comparison alone ties and the order would come from insertion.
 */
export function compareAclNames(a, b) {
  const digitsLeft = /^\d+$/.test(a)
  const digitsRight = /^\d+$/.test(b)
  if (digitsLeft !== digitsRight) return digitsLeft ? -1 : 1
  if (digitsLeft) {
    const difference = Number(a) - Number(b)
    if (difference !== 0) return difference
  }
  return textCompare(a, b)
}

function compareSubKey(left, right) {
  const leftIsNumber = typeof left === 'number'
  const rightIsNumber = typeof right === 'number'
  if (leftIsNumber !== rightIsNumber) return leftIsNumber ? -1 : 1
  if (leftIsNumber) return left - right
  return textCompare(left, right)
}

function compareTail(left, right) {
  if (left.token !== right.token) return textCompare(left.token, right.token)
  const key = compareSubKey(left.key, right.key)
  if (key !== 0) return key
  return textCompare(left.line, right.line)
}

/**
 * The trailing global commands, as a token then a sub-key.
 *
 * The token is a full command prefix — `ip nat inside`, not `ip nat` — because
 * `ip nat` alone leaves inside, outside and pool unordered among themselves.
 * `ntp min-version` is deliberately tokened as `ntp server` and given an
 * infinite key: `services.js:73` applies it by looping over the peer set, which
 * is empty before the servers exist, so it must sort after every one of them
 * rather than land on the letter `m`.
 */
function tailItems(state) {
  const items = []

  const services = state.services ?? {}
  const ntp = services.ntp ?? { peers: {} }
  const peers = Object.values(ntp.peers ?? {})
  for (const peer of peers) {
    items.push({
      token: 'ntp server',
      key: ipv4SortKey(peer.address),
      line: `ntp server ${peer.address}`,
    })
  }

  const smallest = peers.reduce(
    (minimum, peer) => Math.min(minimum, peer.minimumVersion),
    Number.POSITIVE_INFINITY
  )
  if (peers.length > 0 && smallest !== NTP_MIN_VERSION_SEED) {
    items.push({ token: 'ntp server', key: Number.POSITIVE_INFINITY, line: `ntp min-version ${smallest}` })
  }

  const nat = services.nat ?? {}
  for (const pool of Object.values(nat.pools ?? {})) {
    items.push({
      token: 'ip nat pool',
      key: pool.name,
      line: `ip nat pool ${pool.name} netmask ${pool.netmask}`,
    })
  }
  for (const id of nat.inside ?? []) {
    items.push({ token: 'ip nat inside', key: Number(id), line: `ip nat inside global ${id}` })
  }
  for (const id of nat.outside ?? []) {
    items.push({ token: 'ip nat outside', key: Number(id), line: `ip nat outside global ${id}` })
  }

  const ssh = (state.security ?? {}).ssh ?? { version: 0, keys: [] }
  if (ssh.version) {
    items.push({ token: 'ip ssh version', key: 0, line: `ip ssh version ${ssh.version}` })
  }

  for (const user of Object.values((state.security ?? {}).localPasswords ?? {})) {
    items.push({
      token: 'username',
      key: user.name,
      line: `username ${user.name} privilege ${user.privilege}`,
    })
  }

  return items.sort(compareTail)
}

function renderAclEntry(listName, entry) {
  const body =
    `${entry.action} ${entry.protocol} ${entry.source} ${entry.destination}` +
    (entry.options ? ` ${entry.options}` : '')
  return listName === null ? `${entry.sequence} ${body}` : `access-list ${listName} ${body}`
}

/** `show ip route` — IPv4 static routes only, in this simulator's order. */
function renderShowIpRoute(state) {
  const routes = Object.values((state.routing ?? {}).static ?? {})
    .filter((route) => !route.prefix.includes(':'))
    .sort(compareRoutes)

  return formatTable(
    ['Codes', 'Network', 'NextHop', 'Distance'],
    routes.map((route) => ['S', route.prefix, route.nextHop, String(route.distance)])
  )
}

/**
 * `show running-config` — six sections, each with an explicit sort key.
 *
 * Nothing here relies on key enumeration order: the engine hoists ordinal keys,
 * so inserting `15`, `101`, `9` enumerates as `['9','15','101']` and `vlans` is
 * keyed by decimal string, which would make its section order a property of the
 * engine rather than of this module.
 */
function renderShowRunningConfig(state) {
  const lines = []

  const interfaces = state.interfaces ?? {}
  for (const name of Object.keys(interfaces).sort(compareInterfaces)) {
    const itf = interfaces[name]
    lines.push(`interface ${name}`)
    if (itf.description) lines.push(`description ${itf.description}`)
    if (itf.ipv4?.address) lines.push(`ip address ${itf.ipv4.address} ${itf.ipv4.netmask}`)
    // Keyed on the typed command and never on `adminUp`, or every interface
    // would print `no shutdown` for a line nobody typed.
    if (itf.shutdownCommand && itf.shutdownCommand !== 'none') lines.push(itf.shutdownCommand)
    lines.push('!')
  }

  const vlans = state.vlans ?? {}
  for (const id of Object.keys(vlans)
    .map(Number)
    .sort((a, b) => a - b)) {
    lines.push(`vlan ${id}`)
    const vlan = vlans[String(id)]
    if (vlan.name !== null && vlan.name !== undefined) lines.push(`name ${vlan.name}`)
    lines.push('!')
  }

  const routing = state.routing ?? {}
  for (const id of Object.keys(routing.ospf ?? {})
    .map(Number)
    .sort((a, b) => a - b)) {
    lines.push(`router ospf ${id}`)
  }

  for (const route of Object.values(routing.static ?? {}).sort(compareRoutes)) {
    lines.push(`ip route ${route.prefix} ${route.nextHop} ${route.distance}`)
  }

  const acls = (state.security ?? {}).acls ?? {}
  for (const name of Object.keys(acls).sort(compareAclNames)) {
    const entries = Object.values(acls[name].entries).sort((a, b) => a.sequence - b.sequence)
    if (/^\d+$/.test(name)) {
      for (const entry of entries) lines.push(renderAclEntry(name, entry))
    } else {
      lines.push(`ip access-list extended ${name}`)
      for (const entry of entries) lines.push(renderAclEntry(null, entry))
      lines.push('!')
    }
  }

  for (const item of tailItems(state)) lines.push(item.line)

  return lines.join('\n')
}

const RENDERERS = {
  'show ip interface brief': renderShowIpInterfaceBrief,
  'show ip route': renderShowIpRoute,
  'show running-config': renderShowRunningConfig,
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
