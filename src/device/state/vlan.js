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

const NAME = /^name (.+)$/

export function initialState() {
  return { vlans: {} }
}

/**
 * Reduce parsed VLAN blocks to VLAN state.
 *
 * Takes `{ id, lines }` blocks rather than a flat line list, because the parser
 * already read the `vlan N` header. Re-parsing it here would carry the same fact
 * in two places, and a path could then resolve to a VLAN the block never named.
 */
export function reduce(blocks, previous = initialState()) {
  const state = { vlans: { ...previous.vlans } }

  for (const block of blocks ?? []) {
    // The parser matches the *shape* of a VLAN id and this reducer decides
    // whether it is a real one. `vlan 010` is three characters of shape and a
    // key the grammar cannot address, so it is refused here rather than stored
    // where `vlans.10.name` would never find it.
    const id = vlanKey(block.id)
    state.vlans[id] = state.vlans[id] ?? { id, name: null }

    for (const raw of block.lines) {
      const text = raw.trim()

      const named = NAME.exec(text)
      if (named) {
        state.vlans[id].name = named[1]
        continue
      }

      throw new Error(`vlan ${id}: unrecognised command "${text}"`)
    }
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