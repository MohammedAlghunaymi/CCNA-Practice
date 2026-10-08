import { describe, it, expect } from 'vitest'
import { evaluateVerify } from '../src/lib/verify.js'

describe('evaluateVerify: subnet kind', () => {
  it('passes when the authored assert agrees with real arithmetic', () => {
    const result = evaluateVerify({
      kind: 'subnet',
      cidr: '10.0.0.0/24',
      hostsRequired: 200,
      assert: {
        network: '10.0.0.0', prefix: 24, usable: 254,
        broadcast: '10.0.0.255', firstHost: '10.0.0.1', lastHost: '10.0.0.254',
      },
    })
    expect(result.errors).toEqual([])
    expect(result.pass).toBe(true)
  })

  it('catches an answer key that does not match the maths', () => {
    // The single most valuable failure mode: a question offering 10.0.0.128/25
    // as correct when 200 hosts are required.
    const result = evaluateVerify({
      kind: 'subnet',
      cidr: '10.0.0.0/25',
      hostsRequired: 200,
      assert: { prefix: 25, usable: 126 },
    })
    expect(result.pass).toBe(false)
    expect(result.errors.join(' ')).toMatch(/fewer than the 200 required/)
    expect(result.errors.join(' ')).toMatch(/needs \/24 or larger/)
  })

  it('reports a field the verify kind cannot produce', () => {
    const result = evaluateVerify({
      kind: 'subnet', cidr: '10.0.0.0/24', assert: { nonsense: 1 },
    })
    expect(result.pass).toBe(false)
    expect(result.errors.join(' ')).toMatch(/not a field this verify kind produces/)
  })

  it('rejects an invalid cidr without throwing', () => {
    const result = evaluateVerify({ kind: 'subnet', cidr: 'not-an-ip/24', assert: {} })
    expect(result.pass).toBe(false)
    expect(result.errors.join(' ')).toMatch(/cidr is invalid/)
  })

  it('requires an assert object', () => {
    const result = evaluateVerify({ kind: 'subnet', cidr: '10.0.0.0/24' })
    expect(result.pass).toBe(false)
    expect(result.errors.join(' ')).toMatch(/must be an object/)
  })

  it('rejects a second valid prefix that is too large', () => {
    const result = evaluateVerify({
      kind: 'subnet',
      cidr: '10.0.0.0/24',
      hostsRequired: 200,
      alsoValidPrefix: 27,
      assert: { prefix: 24 },
    })
    expect(result.pass).toBe(false)
    expect(result.errors.join(' ')).toMatch(/alsoValidPrefix/)
  })

  it('accepts a genuinely valid alternative prefix', () => {
    const result = evaluateVerify({
      kind: 'subnet',
      cidr: '10.0.0.0/24',
      hostsRequired: 200,
      alsoValidPrefix: 23,
      assert: { prefix: 24 },
    })
    expect(result.pass).toBe(true)
  })
})

describe('evaluateVerify: subnetCount kind', () => {
  it('passes on a correct count', () => {
    const result = evaluateVerify({
      kind: 'subnetCount', outerPrefix: 24, innerPrefix: 26, assert: { subnets: 4 },
    })
    expect(result.pass).toBe(true)
  })

  it('catches a wrong count', () => {
    const result = evaluateVerify({
      kind: 'subnetCount', outerPrefix: 24, innerPrefix: 26, assert: { subnets: 8 },
    })
    expect(result.pass).toBe(false)
    expect(result.errors.join(' ')).toMatch(/yields 4/)
  })

  it('rejects an inverted prefix pair', () => {
    const result = evaluateVerify({ kind: 'subnetCount', outerPrefix: 26, innerPrefix: 24 })
    expect(result.pass).toBe(false)
  })
})

describe('evaluateVerify: unknown kinds', () => {
  it('fails loudly rather than silently passing', () => {
    const result = evaluateVerify({ kind: 'wildcard-magic' })
    expect(result.pass).toBe(false)
    expect(result.errors.join(' ')).toMatch(/unknown verify.kind/)
  })

  it('fails on a missing verify block', () => {
    expect(evaluateVerify(undefined).pass).toBe(false)
  })
})