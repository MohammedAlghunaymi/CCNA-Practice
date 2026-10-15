/**
 * The `routing` sub-reducer.
 *
 * Static routes are keyed by prefix, because the prefix is the identifier the
 * routing table itself displays — `show ip route` lists `192.168.1.0/24` in its
 * left column. OSPF processes are keyed by process id for the same reason:
 * `router ospf 1` names process 1, and a process list would make `ospf.1` mean
 * whichever process happened to be written second.
 *
 * IPv6 prefixes are accepted and stored unescaped as **one** key. `2001:db8::/32`
 * contains no dot, so it needs no `\.` escape — the escape exists for dotted
 * IPv4, where `192.168.1.0/24` would otherwise split into four segments. The
 * adversarial fixture carries both, which is what proves the two are treated
 * differently rather than by accident.
 */

const STATIC = /^ip route (\S+) (\S+)(?: (\d+))?$/
const OSPF = /^router ospf (\d+)$/

/**
 * What this reducer owns in the global configuration block.
 *
 * A line that matches nothing here belongs to another reducer and is skipped. A
 * line that matches is claimed, and if it then fails to parse the reducer throws
 * — which is the distinction that matters: a line this reducer owns but cannot
 * understand is a broken configuration, and a line it does not own is not its
 * business to complain about.
 */
export const OWNS = [/^ip route\b/, /^router ospf\b/]

export function initialState() {
  return { static: {}, ospf: {} }
}

/**
 * Normalise a route's destination to a canonical `address/prefix-length` key.
 *
 * `ip route 0.0.0.0 10.0.0.254` is a default route written without a length,
 * and IOS treats it as `0.0.0.0/0`. Storing the two spellings as different keys
 * would give one default route two identities in the state and in the table.
 */
function normalisePrefix(prefix) {
  const match = /^([0-9a-fA-F:.]+)(?:\/(\d{1,3}))?$/.exec(prefix)
  if (!match) {
    throw new Error(`route prefix ${JSON.stringify(prefix)} is not an address/prefix-length pair`)
  }
  const [, address, length] = match
  const canonical = length === undefined ? `${address}/0` : `${address}/${length}`
  const finalLength = length === undefined ? 0 : Number(length)
  const maxLength = address.includes(':') ? 128 : 32
  if (finalLength > maxLength) {
    throw new Error(`route prefix ${JSON.stringify(prefix)} exceeds /${maxLength}`)
  }
  return canonical
}

function checkNextHop(nextHop) {
  // Next-hop may be an address, or an interface for a connected route.
  if (/^[0-9a-fA-F:.]+$/.test(nextHop) || /^\S+\d+\/\d+/.test(nextHop)) return
  throw new Error(`next hop ${JSON.stringify(nextHop)} is neither an address nor an interface`)
}

export function reduce(context, previous = initialState()) {
  const state = {
    static: { ...previous.static },
    ospf: { ...previous.ospf },
  }
  const lines = Array.isArray(context) ? context : context.lines ?? []

  for (const raw of lines) {
    const text = raw.trim()

    const ospf = OSPF.exec(text)
    if (ospf) {
      const id = ospf[1]
      state.ospf[id] = state.ospf[id] ?? { processId: Number(id), neighbors: {} }
      continue
    }

    const route = STATIC.exec(text)
    if (route) {
      const [, prefix, nextHop, distance] = route
      const key = normalisePrefix(prefix)
      checkNextHop(nextHop)
      state.static[key] = {
        prefix: key,
        nextHop,
        // IOS omits the distance for a 0.0.0.0 route and defaults it to 1.
        distance: distance === undefined ? 1 : Number(distance),
      }
      continue
    }

    if (!OWNS.some((pattern) => pattern.test(text))) continue

    if (/^router ospf\b/.test(text)) {
      throw new Error(`routing: "${text}" is network-type configuration, which belongs to 2b batch 2`)
    }

    throw new Error(`routing: "${text}" is not a route this reducer recognises`)
  }

  return state
}