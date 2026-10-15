/**
 * The `vlan` sub-reducer.
 *
 * A VLAN is a **named, numbered entity**, so the state is keyed by VLAN id as
 * a decimal string and `vlan.10.name` means VLAN 10 — not the eleventh entry of
 * a list. That distinction is the whole reason the frozen grammar's integer rule
 * rejects a leading zero: `vlan.01` is a different VLAN from `vlan.1`, on every
 * container, because `01` is not a canonical integer.
 *
 * The interface-scoped half of VLAN membership (`switchport trunk allowed vlan`,
 * `switchport access vlan`) belongs to the `interfaces` reducer, because it is
 * a fact about a port. What lands here is the entity both sides agree on.
 */

const VLAN = /^vlan (\d{1,4})$/
const NAME = /^name (.+)$/

export function initialState() {
  return { vlans: {} }
}

function blankVlan(id) {
  return { id, name: null }
}

/**
 * Reduce parsed configuration lines to VLAN state.
 *
 * `context` is the device's global configuration block only; interface blocks
 * belong to the `interfaces` reducer.
 */
export function reduce(context, previous = initialState()) {
  const state = { vlans: { ...previous.vlans } }
  const lines = Array.isArray(context) ? context : context.lines ?? []

  let current = null
  for (const raw of lines) {
    const text = raw.trim()

    const created = VLAN.exec(text)
    if (created) {
      const id = created[1]
      state.vlans[id] = state.vlans[id] ?? blankVlan(id)
      current = id
      continue
    }

    const named = NAME.exec(text)
    if (named) {
      if (!current) throw new Error(`"${text}" needs a preceding "vlan <id>" block`)
      state.vlans[current].name = named[1]
      continue
    }

    if (current && /^(exit|end)$/.test(text)) {
      current = null
      continue
    }

    throw new Error(`vlan: unrecognised command "${text}"`)
  }

  return state
}

/** The key the state uses for a VLAN id, which is also the key a path must spell. */
export function vlanKey(id) {
  if (!/^(0|[1-9][0-9]*)$/.test(String(id))) {
    throw new Error(`vlan id ${JSON.stringify(id)} is not canonical; the grammar reads it as a key`)
  }
  return String(id)
}