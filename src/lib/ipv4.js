/**
 * IPv4 arithmetic in pure integer space.
 *
 * Every function works on 32-bit unsigned integers rather than floats or
 * JS bitwise operators, because `x & mask` yields a *signed* 32-bit result in
 * JavaScript and silently produces negative numbers for addresses with the
 * high bit set. Using Number arithmetic avoids that class of bug entirely.
 */

const OCTET = 256
const TOTAL = 0x100000000 // 2^32

/** @returns {number} unsigned 32-bit integer for a dotted-quad string */
export function ipToInt(ip) {
  const parts = String(ip).trim().split('.')
  if (parts.length !== 4) throw new Error(`invalid IPv4 address: ${ip}`)
  let value = 0
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) throw new Error(`invalid octet in ${ip}`)
    const octet = Number(part)
    if (octet > 255) throw new Error(`octet out of range in ${ip}`)
    value = value * OCTET + octet
  }
  return value
}

/** @returns {string} dotted-quad for an unsigned 32-bit integer */
export function intToIp(value) {
  if (!Number.isInteger(value) || value < 0 || value >= TOTAL) {
    throw new Error(`not a 32-bit unsigned integer: ${value}`)
  }
  const a = Math.floor(value / 0x1000000) % 256
  const b = Math.floor(value / 0x10000) % 256
  const c = Math.floor(value / 0x100) % 256
  const d = value % 256
  return `${a}.${b}.${c}.${d}`
}

/** @returns {number} the 32-bit mask for a prefix length */
export function prefixToMask(prefix) {
  if (!Number.isInteger(prefix) || prefix < 0 || prefix > 32) {
    throw new Error(`prefix must be 0-32, got ${prefix}`)
  }
  if (prefix === 0) return 0
  return TOTAL - 2 ** (32 - prefix)
}

/** @returns {number} total addresses in a prefix */
export function blockSize(prefix) {
  return 2 ** (32 - prefix)
}

/**
 * Smallest prefix that yields at least `hostsRequired` usable host addresses.
 * Used to check that a question's offered answers are actually sufficient.
 */
export function minimumPrefixForHosts(hostsRequired) {
  if (!Number.isInteger(hostsRequired) || hostsRequired <= 0) {
    throw new Error(`hostsRequired must be a positive integer, got ${hostsRequired}`)
  }
  for (let prefix = 32; prefix >= 0; prefix--) {
    const usable = blockSize(prefix) - 2
    if (prefix <= 30 && usable >= hostsRequired) return prefix
    if (prefix === 31 || prefix === 32) continue
  }
  throw new Error(`cannot satisfy ${hostsRequired} usable hosts with IPv4`)
}

/**
 * Expand a CIDR into every derived field a subnetting question might assert on.
 *
 * @param {string} cidr e.g. "10.0.0.0/24" or "10.0.0.10/24"
 * @returns {{ip:string, prefix:number, mask:string, network:string, broadcast:string,
 *            firstHost:string, lastHost:string, total:number, usable:number}}
 */
export function describeSubnet(cidr) {
  const [ipPart, prefixPart] = String(cidr).split('/')
  if (prefixPart === undefined) throw new Error(`cidr must include a prefix: ${cidr}`)

  const prefix = Number(prefixPart)
  const ip = ipToInt(ipPart)
  const mask = prefixToMask(prefix)
  const networkInt = Math.floor(ip / blockSize(prefix)) * blockSize(prefix)
  const total = blockSize(prefix)

  // /31 and /32 have no usable host range in the RFC 3021 sense.
  const hasHosts = prefix <= 30

  return {
    ip: intToIp(ip),
    prefix,
    mask: intToIp(mask),
    network: intToIp(networkInt),
    broadcast: intToIp(networkInt + total - 1),
    firstHost: hasHosts ? intToIp(networkInt + 1) : intToIp(networkInt),
    lastHost: hasHosts ? intToIp(networkInt + total - 2) : intToIp(networkInt),
    total,
    usable: hasHosts ? total - 2 : 0,
  }
}

/** Number of distinct subnets of `prefixA` available inside `prefixB`. */
export function subnetCount(outerPrefix, innerPrefix) {
  if (innerPrefix < outerPrefix) {
    throw new Error(`inner prefix /${innerPrefix} is larger than outer /${outerPrefix}`)
  }
  return 2 ** (innerPrefix - outerPrefix)
}