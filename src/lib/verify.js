/**
 * Machine-checkable assertions for computational questions.
 *
 * The point of this module is that a subnetting question's arithmetic is
 * verified by code, not by re-reading it. If the authored `assert` block
 * disagrees with what IPv4 maths actually produces, the question fails CI.
 */
import { describeSubnet, subnetCount, minimumPrefixForHosts } from './ipv4.js'

/**
 * Evaluate one question's `verify` block.
 *
 * @param {Object} verify
 * @returns {{pass: boolean, errors: string[], detail: Object}}
 */
export function evaluateVerify(verify) {
  const errors = []
  const detail = {}

  if (!verify || typeof verify !== 'object') {
    return { pass: false, errors: ['verify must be an object'], detail }
  }

  if (verify.kind === 'subnet') {
    if (typeof verify.cidr !== 'string') {
      errors.push('verify.cidr must be a string for kind "subnet"')
      return { pass: false, errors, detail }
    }

    let actual
    try {
      actual = describeSubnet(verify.cidr)
    } catch (error) {
      return { pass: false, errors: [`verify.cidr is invalid: ${error.message}`], detail }
    }

    detail.actual = actual

    // If the question states a host requirement, the prefix must satisfy it.
    if (verify.hostsRequired !== undefined) {
      try {
        const needed = minimumPrefixForHosts(verify.hostsRequired)
        detail.minimumPrefixForHosts = needed
        if (actual.prefix > needed) {
          errors.push(
            `/${actual.prefix} yields ${actual.usable} usable hosts, ` +
              `fewer than the ${verify.hostsRequired} required (needs /${needed} or larger)`
          )
        }
      } catch (error) {
        errors.push(`hostsRequired is invalid: ${error.message}`)
      }
    }

    // If the question states an alternative valid prefix, check it is truly valid.
    if (verify.alsoValidPrefix !== undefined) {
      try {
        const minNeeded = minimumPrefixForHosts(verify.hostsRequired ?? 1)
        if (verify.alsoValidPrefix > minNeeded) {
          errors.push(
            `alsoValidPrefix /${verify.alsoValidPrefix} is too large to satisfy ` +
              `the stated host requirement (needs /${minNeeded} or larger)`
          )
        }
        detail.alsoValidUsable = describeSubnet(`0.0.0.0/${verify.alsoValidPrefix}`).usable
      } catch (error) {
        errors.push(`alsoValidPrefix is invalid: ${error.message}`)
      }
    }

    errors.push(...compareAssert(verify.assert, actual))

    return { pass: errors.length === 0, errors, detail }
  }

  if (verify.kind === 'subnetCount') {
    const { outerPrefix, innerPrefix } = verify
    if (!Number.isInteger(outerPrefix) || !Number.isInteger(innerPrefix)) {
      errors.push('verify.outerPrefix and verify.innerPrefix must be integers')
      return { pass: false, errors, detail }
    }
    try {
      detail.actual = subnetCount(outerPrefix, innerPrefix)
    } catch (error) {
      errors.push(error.message)
      return { pass: false, errors, detail }
    }
    if (verify.assert?.subnets !== undefined && verify.assert.subnets !== detail.actual) {
      errors.push(
        `assert.subnets is ${verify.assert.subnets} but /${outerPrefix} into /${innerPrefix} yields ${detail.actual}`
      )
    }
    return { pass: errors.length === 0, errors, detail }
  }

  errors.push(`unknown verify.kind: ${JSON.stringify(verify.kind)}`)
  return { pass: false, errors, detail }
}

/** Compare an authored `assert` block against computed values, field by field. */
function compareAssert(assert, actual) {
  const errors = []
  if (!assert || typeof assert !== 'object') {
    return ['verify.assert must be an object describing the expected values']
  }

  for (const [field, expected] of Object.entries(assert)) {
    const got = actual[field]
    if (got === undefined) {
      errors.push(`assert.${field} is not a field this verify kind produces`)
      continue
    }
    if (got !== expected) {
      errors.push(`assert.${field} expects ${JSON.stringify(expected)} but maths gives ${JSON.stringify(got)}`)
    }
  }

  return errors
}