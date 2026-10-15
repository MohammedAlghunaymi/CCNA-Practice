/**
 * The `security` sub-reducer: local credentials, ACLs and SSH.
 *
 * ## SSH is not a two-reducer coupling
 *
 * A plan-level note split SSH across `security` and `services` — "security for
 * the transport, services for the daemon". That split has no referent in IOS.
 * `ip ssh version 2`, `crypto key generate rsa` and `line vty 0 4 transport
 * input ssh` are all global configuration, they all describe the same daemon,
 * and they all live here. There is no boundary for a transaction to protect.
 *
 * ## Port security is not here
 *
 * `switchport port-security maximum 3` is interface configuration. It is a fact
 * about a port, so it belongs at `interfaces.<if>.portSecurity`, and a plan-level
 * mapping that put it in `security` was wrong for exactly that reason. It is
 * refused below rather than quietly stored in the wrong tree.
 *
 * ## Credentials are refused, not stored
 *
 * `username ... secret ...` is a credential. The rules governing them — the
 * construction, the salt, and which operators may touch a credential path — land
 * with 2b batch 3, the first commit that has a secret to apply them to. Storing
 * one before the rule exists is how a plaintext ends up in a golden fixture.
 */

const USERNAME = /^username (\S+) privilege (\d+)(?: secret (\S+))?$/
const ENABLE_SECRET = /^enable secret (\S+)$/
const ACL = /^ip access-list extended (\S+)$/
// Two real syntaxes. A numbered list has no sequence prefix at all
// (`access-list 101 permit ip any any`) and IOS implies 10, 20, 30. A named
// list is entered with `ip access-list extended NAME` and its entries carry an
// explicit sequence (`10 permit ip any any`). Conflating them would lose the
// sequence, which is the thing a rule's position depends on.
const ACL_ENTRY_NUMBERED = /^access-list (\d+) (permit|deny) (\S+) (\S+) (\S+)(?:\s+(.*))?$/
const ACL_ENTRY_NAMED = /^(\d+) (permit|deny) (\S+) (\S+) (\S+)(?:\s+(.*))?$/
const SSH_VERSION = /^ip ssh version (\d+)$/

export function initialState() {
  return {
    localPasswords: {},
    acls: {},
    ssh: { version: 0, keys: [] },
  }
}

function aclEntry(state, listName) {
  const acl = state.acls[listName] ?? { name: listName, entries: {} }
  state.acls[listName] = acl
  return acl
}

export function reduce(context, previous = initialState()) {
  const state = {
    localPasswords: { ...previous.localPasswords },
    acls: { ...previous.acls },
    ssh: { ...previous.ssh, keys: [...previous.ssh.keys] },
  }
  const lines = Array.isArray(context) ? context : context.lines ?? []

  // Which named list a bare "10 permit ..." belongs to. Deliberately a local:
  // parse position is not device state and must not reach the golden fixture.
  let currentList = null

  for (const raw of lines) {
    const text = raw.trim()

    const username = USERNAME.exec(text)
    if (username) {
      const [, name, privilege, secret] = username
      if (secret !== undefined) {
        throw new Error(
          `security: a plaintext secret is refused. Credential storage and its operators land ` +
            'with 2b batch 3, which is the first commit with a secret to govern'
        )
      }
      state.localPasswords[name] = { name, privilege: Number(privilege), secret: null }
      continue
    }

    const secret = ENABLE_SECRET.exec(text)
    if (secret) {
      throw new Error(
        'security: a plaintext enable secret is refused; governed from 2b batch 3'
      )
    }

    const acl = ACL.exec(text)
    if (acl) {
      aclEntry(state, acl[1])
      currentList = acl[1]
      continue
    }

    const numbered = ACL_ENTRY_NUMBERED.exec(text)
    if (numbered) {
      const [, listNumber, action, protocol, source, destination, options] = numbered
      const target = aclEntry(state, listNumber)
      const highest = Math.max(0, ...Object.keys(target.entries).map(Number))
      const next = highest === 0 ? 10 : highest + 10
      target.entries[String(next)] = {
        sequence: next,
        action,
        protocol,
        source,
        destination,
        // Kept rather than dropped. `eq 23`, `established`, `log` and `range`
        // change what a rule matches, and a state that discarded them would
        // grade two different rules as the same.
        options: options ? options.trim() : null,
      }
      continue
    }

    const named = ACL_ENTRY_NAMED.exec(text)
    if (named) {
      const [, sequence, action, protocol, source, destination, options] = named
      if (!currentList) {
        throw new Error(`security: "${text}" needs a preceding "ip access-list extended <name>"`)
      }
      const target = aclEntry(state, currentList)
      target.entries[sequence] = {
        sequence: Number(sequence),
        action,
        protocol,
        source,
        destination,
        options: options ? options.trim() : null,
      }
      continue
    }

    const ssh = SSH_VERSION.exec(text)
    if (ssh) {
      state.ssh.version = Number(ssh[1])
      continue
    }

    if (/^switchport port-security\b/.test(text)) {
      throw new Error(
        `security: "${text}" is interface configuration and belongs at interfaces.<if>.portSecurity, ` +
          'not here. It arrives with 2b batch 1'
      )
    }
    if (/^crypto key generate\b/.test(text) || /^line vty\b/.test(text) || /^transport input\b/.test(text)) {
      throw new Error(`security: "${text}" arrives with 2b batch 3`)
    }

    throw new Error(`security: unrecognised command "${text}"`)
  }

  return state
}