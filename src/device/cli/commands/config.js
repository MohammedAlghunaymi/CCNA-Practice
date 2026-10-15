/**
 * Configuration to device state.
 *
 * This is the transaction layer, and it is deliberately the **only** place that
 * knows how the five reducers fit together. Each reducer is pure and owns one
 * slice of the tree; nothing here mutates state in place.
 *
 * ## Why the coordinator lives here and not in `src/device/state/`
 *
 * `tests/subReducers.test.js` compares `src/device/state/` against the five
 * modules `PROJECT.md:138` names, in both directions, so a sixth file there is a
 * failure on purpose. That fence is right: a state directory that grows a
 * coordinator is a state directory that has stopped being reducers. Cross-reducer
 * composition is a property of *commands*, so it belongs beside the parser.
 *
 * ## Dispatch
 *
 * A global line goes to the reducer whose `OWNS` claims it. Every global-line
 * reducer sees every global line and keeps only its own; a line none of them
 * claims is refused **here**, once, with every owner named — which is the
 * honest "unknown command". The Gate 9 question from the plan resolves itself:
 * there is no refusal table, because the vocabularies *are* the table, and a
 * second copy would only be a second thing to keep in step.
 *
 * ## Skip and throw are different
 *
 * A reducer skips a line it does not own and throws on a line it owns but
 * cannot parse. Without that split, dispatch is impossible: handing `routing`
 * the whole global block would make it refuse every `ntp server` line. With it,
 * a line that is merely someone else's is not an error, and a line that is a
 * genuine typo in *this* reducer's vocabulary still is.
 *
 * ## Transactions
 *
 * A command that writes two reducers writes both or neither. Nothing implemented
 * yet crosses that line — the first will be `switchport trunk allowed vlan` in
 * 2b batch 1 — so the boundary is drawn now and exercised then, rather than built
 * against a subject that does not exist.
 */

import { parse } from '../parser.js'
import * as interfaces from '../../state/interfaces.js'
import * as vlan from '../../state/vlan.js'
import * as routing from '../../state/routing.js'
import * as services from '../../state/services.js'
import * as security from '../../state/security.js'

/** Global-line consumers, in the order they are asked. */
const GLOBAL_OWNERS = [
  ['routing', routing.OWNS],
  ['services', services.OWNS],
  ['security', security.OWNS],
]

const OWNER_SUMMARY =
  'routing (ip route, router ospf), services (ntp, ip nat, ip dhcp), ' +
  'security (username, enable, access-list, ip ssh, crypto key, line vty, transport input)'

/**
 * Reduce parsed configuration to device state.
 *
 * @param {string} text configuration text
 * @param {object} [options]
 * @param {string} [options.kind] `'router'` or `'switch'`
 * @returns {object} DeviceState, nested by reducer
 */
export function reduceConfig(text, options = {}) {
  const parsed = parse(text)
  const kind = options.kind ?? 'router'

  const interfaceState = interfaces.reduce(parsed.interfaces, {
    ...interfaces.initialState(),
    kind,
  })

  // Every global-line reducer is handed every global line, and each keeps only
  // what its own `OWNS` claims. Filtering here instead would leave the skip in
  // each reducer dead code in production: reachable only from a golden fixture
  // that had already done the filtering for it. One vocabulary, in one place.
  //
  // What is left unaccounted for is a global line nobody owns, which is a
  // configuration error rather than someone else's business.
  const unknown = parsed.global.filter(
    (line) => !GLOBAL_OWNERS.some(([, patterns]) => patterns.some((p) => p.test(line.trim())))
  )
  if (unknown.length > 0) {
    throw new Error(
      `no reducer claims ${unknown.length} configuration line(s): ` +
        `${unknown.map((line) => `"${line}"`).join(', ')}. Known owners: ${OWNER_SUMMARY}`
    )
  }

  return {
    kind,
    interfaces: interfaceState.interfaces,
    vlans: vlan.reduce(parsed.vlan).vlans,
    routing: routing.reduce(parsed.global),
    services: services.reduce(parsed.global),
    security: security.reduce(parsed.global, parsed.acls),
  }
}

/**
 * Apply a single global configuration command to an existing state.
 *
 * Returns a **new** state. Nothing is mutated in place, so a rejected command
 * cannot leave a device in a state no configuration could describe — which is the
 * property the transaction boundary exists to provide.
 *
 * Today every implemented command writes exactly one reducer, so the boundary is
 * trivially satisfied. It stops being trivial at `switchport trunk allowed vlan`
 * in 2b batch 1.
 *
 * @param {object} state a state from `reduceConfig`
 * @param {string} line one global configuration command
 * @returns {object} a new state
 */
export function applyCommand(state, line) {
  const text = String(line ?? '').trim()
  if (!text) throw new Error('applyCommand: empty command')

  const parsed = parse(text)
  if (parsed.interfaces.length || parsed.vlan.length || parsed.acls.length) {
    throw new Error(
      `applyCommand: "${text}" opens a block. Blocks are reduced through reduceConfig, ` +
        'not applied one line at a time'
    )
  }
  if (parsed.global.length !== 1) {
    throw new Error(
      `applyCommand: expected one command, got ${parsed.global.length} from "${text}"`
    )
  }

  const owner = GLOBAL_OWNERS.find(([, patterns]) => patterns.some((p) => p.test(text)))
  if (!owner) {
    throw new Error(
      `applyCommand: no reducer claims "${text}". Known owners: ${OWNER_SUMMARY}`
    )
  }

  const [name] = owner
  if (name === 'routing') {
    return { ...state, routing: routing.reduce(parsed.global, state.routing) }
  }
  if (name === 'services') {
    return { ...state, services: services.reduce(parsed.global, state.services) }
  }
  if (name === 'security') {
    return { ...state, security: security.reduce(parsed.global, [], state.security) }
  }
  throw new Error(`applyCommand: "${name}" has no single-command path`)
}

export { parse, GLOBAL_OWNERS }