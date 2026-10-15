/**
 * The `services` sub-reducer: DHCP, NTP and NAT entities.
 *
 * Everything here is a **named global entity**, keyed by the identifier IOS
 * shows. `ntp server 10.0.0.1` keys by address; `ip nat pool MGMT` keys by pool
 * name. Nothing is positional.
 *
 * ## The axis, and where it actually falls
 *
 * A plan-level note claimed the rule was "per-interface config lives in
 * `interfaces`, global config lives here". That is not quite right, and getting
 * it right changes what crosses a reducer boundary:
 *
 *   - A **designation** marks an interface: `ip nat inside`, `ip dhcp client`,
 *     `switchport access vlan`. It is a fact about a port, so it belongs at
 *     `interfaces.<if>.<...>` — in the `interfaces` reducer.
 *   - The **entity** the designation refers to — `ip nat pool NAME`, the NAT
 *     inside/outside sets, a DHCP pool — is global, and lives here.
 *
 * So `ip nat inside source static …` writes to *both* reducers. That is the
 * genuine two-reducer transaction this round has to honour, and the command
 * that performs it is assembled in `src/device/cli/commands/config.js`, not
 * here: these reducers stay pure and single-domain so a rejected command
 * cannot leave one of them half-written.
 */

const NTP_SERVER = /^ntp server (\S+)$/
const NTP_MIN_VERSION = /^ntp min-version (\d)$/
const NAT_POOL = /^ip nat pool (\S+) netmask (\S+)$/
const NAT_INSIDE = /^ip nat inside global (\d+)$/
const NAT_OUTSIDE = /^ip nat outside global (\d+)$/

/** What this reducer owns in the global configuration block. See routing.js. */
export const OWNS = [/^ntp\b/, /^ip nat\b/, /^ip dhcp\b/]

export function initialState() {
  return {
    ntp: { peers: {} },
    dhcp: { pools: {} },
    nat: { pools: {}, inside: [], outside: [] },
  }
}

function addOnce(list, value) {
  if (!list.includes(value)) list.push(value)
}

export function reduce(context, previous = initialState()) {
  const state = {
    ntp: { peers: { ...previous.ntp.peers } },
    dhcp: { pools: { ...previous.dhcp.pools } },
    nat: {
      pools: { ...previous.nat.pools },
      inside: [...previous.nat.inside],
      outside: [...previous.nat.outside],
    },
  }
  const lines = Array.isArray(context) ? context : context.lines ?? []

  for (const raw of lines) {
    const text = raw.trim()

    const server = NTP_SERVER.exec(text)
    if (server) {
      const address = server[1]
      state.ntp.peers[address] = state.ntp.peers[address] ?? { address, minimumVersion: 4 }
      continue
    }

    const minVersion = NTP_MIN_VERSION.exec(text)
    if (minVersion) {
      const version = Number(minVersion[1])
      for (const peer of Object.values(state.ntp.peers)) peer.minimumVersion = version
      continue
    }

    const pool = NAT_POOL.exec(text)
    if (pool) {
      state.nat.pools[pool[1]] = { name: pool[1], netmask: pool[2] }
      continue
    }

    const inside = NAT_INSIDE.exec(text)
    if (inside) {
      addOnce(state.nat.inside, inside[1])
      continue
    }

    const outside = NAT_OUTSIDE.exec(text)
    if (outside) {
      addOnce(state.nat.outside, outside[1])
      continue
    }

    // Not mine: another reducer owns it, and saying so here would be wrong.
    if (!OWNS.some((pattern) => pattern.test(text))) continue

    // Mine, but it configures an interface. The designation half belongs to the
    // `interfaces` reducer and the table half to this one, so the command is a
    // transaction across both — which is what 2b batch 2 builds.
    if (/^ip nat (inside|outside) source\b/.test(text)) {
      throw new Error(
        `services: "${text}" designates an interface and writes to the interfaces reducer; ` +
          'it becomes one transaction across both in 2b batch 2'
      )
    }
    if (/^ip dhcp client\b/.test(text)) {
      throw new Error(
        `services: "${text}" designates an interface and belongs at interfaces.<if>.dhcp`
      )
    }
    if (/^ntp authenticate\b/.test(text) || /^ntp key\b/.test(text)) {
      throw new Error(`services: "${text}" is an NTP credential, governed from 2b batch 3`)
    }
    if (/^ip dhcp pool\b/.test(text)) {
      throw new Error(`services: "${text}" arrives with 2b batch 2`)
    }

    throw new Error(`services: unrecognised command "${text}"`)
  }

  return state
}

/** Merge one entity's state into an existing tree, as a two-reducer transaction needs. */
export function mergeInto(target, patch) {
  for (const [section, value] of Object.entries(patch)) {
    if (Array.isArray(value)) {
      for (const entry of value) addOnce(target[section], entry)
    } else {
      target[section] = { ...target[section], ...value }
    }
  }
  return target
}