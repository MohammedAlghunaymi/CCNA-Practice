/**
 * The `interfaces` sub-reducer: one of the five `PROJECT.md:138` names.
 *
 * Input is **parsed configuration lines, not raw CLI text**. Parsing is
 * `2a.4a`'s job; this module owns what the state becomes. Keeping the boundary
 * here means the state machine can be tested against the real configuration
 * shape without a parser, which is what makes a golden fixture worth having.
 *
 * Every key here is the identifier IOS itself shows the student — an interface
 * name, a description, an address. Nothing is positional. That is deliberate
 * and it is the reason the frozen path grammar needs no array in this reducer:
 * a NAT pool is `ip nat pool NAME`, not a list, so it keys by name too.
 *
 * Command context is a flat list of `{ if: string, lines: string[] }`, because
 * the sub-mode relationship (`interface X` plus indented lines) is a property
 * of the parse, not of the state.
 */

const IPV4_ADDRESS = /^ip address (\d{1,3}(?:\.\d{1,3}){3}) (\d{1,3}(?:\.\d{1,3}){3})$/
const INTERFACE = /^interface (\S+)$/
const DESCRIPTION = /^description (.*)$/
const SHUTDOWN = /^shutdown$/
const NO_SHUTDOWN = /^no shutdown$/

export function initialState() {
  return { kind: 'router', interfaces: {} }
}

/** Split an interface name into its type prefix and its numeric slots. */
function parseInterfaceName(name) {
  const match = /^(.+?)(\d+(?:\/\d+)*)$/.exec(name)
  if (!match) return { type: name, slots: [] }
  return { type: match[1], slots: match[2].split('/').map(Number) }
}

function blankInterface(name) {
  return {
    name,
    description: '',
    // `false` is what a router Layer-3 interface really does: it is
    // administratively down until `no shutdown`, which is why that is the answer
    // to `show ip interface brief` reporting one down. Physical switchports
    // default up, but none is modelled — `switchport` throws at :88-90 — so this
    // default is never exercised on one. Pinned by
    // tests/expectedState.test.js "defaults an interface to administratively
    // down until told otherwise"; do not "fix" it to true without that.
    adminUp: false,
    // `adminUp` collapses two states a student can be in — typed nothing, and
    // typed `shutdown` — because both leave the interface down. `show
    // running-config` has to print the line the student actually entered, and a
    // line derived from the boolean would print `shutdown` for someone who
    // typed nothing. So the typed command is recorded here instead. `'none'`
    // means no administrative-state command has been seen.
    shutdownCommand: 'none',
    ipv4: { address: null, netmask: null },
  }
}

/**
 * Apply one interface's configuration lines to the state.
 *
 * `switchport` and `spanning-tree` are recognised and **rejected**, not ignored.
 * They belong to 2b batch 1 and `PROJECT.md:149` does not yet place them, and a
 * line this reducer silently drops is indistinguishable to a learner from a
 * line that had no effect. Saying so is the whole point.
 */
function applyInterfaceLines(state, name, lines) {
  const interfaceState = state.interfaces[name] ?? blankInterface(name)

  for (const line of lines) {
    const text = line.trim()

    const address = IPV4_ADDRESS.exec(text)
    if (address) {
      interfaceState.ipv4.address = address[1]
      interfaceState.ipv4.netmask = address[2]
      continue
    }

    const description = DESCRIPTION.exec(text)
    if (description) {
      interfaceState.description = description[1]
      continue
    }

    if (SHUTDOWN.test(text)) {
      interfaceState.adminUp = false
      interfaceState.shutdownCommand = 'shutdown'
      continue
    }
    if (NO_SHUTDOWN.test(text)) {
      interfaceState.adminUp = true
      interfaceState.shutdownCommand = 'no shutdown'
      continue
    }

    if (/^switchport\b/.test(text)) {
      throw new Error(
        `interface ${name}: "${text}" is switchport configuration, which belongs to 2b batch 1. ` +
          'This reducer does not implement it and will not silently ignore it.'
      )
    }
    if (/^spanning-tree\b/.test(text)) {
      throw new Error(
        `interface ${name}: "${text}" is spanning-tree configuration, which belongs to 2b batch 1. ` +
          'This reducer does not implement it and will not silently ignore it.'
      )
    }

    throw new Error(`interface ${name}: unrecognised command "${text}"`)
  }

  state.interfaces[name] = interfaceState
  return state
}

/**
 * Reduce a parsed configuration to interfaces state.
 *
 * @param {Array<{if: string, lines: string[]}>} context
 * @param {object} [previous]
 */
export function reduce(context, previous = initialState()) {
  const state = {
    kind: previous.kind ?? 'router',
    interfaces: { ...previous.interfaces },
  }
  for (const entry of context) {
    if (!INTERFACE.test(`interface ${entry.if}`)) {
      throw new Error(`context entry must name an interface, got ${JSON.stringify(entry.if)}`)
    }
    applyInterfaceLines(state, entry.if, entry.lines)
  }
  return state
}

export { parseInterfaceName }