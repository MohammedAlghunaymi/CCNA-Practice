import { describe, it, expect } from 'vitest'
import {
  ipToInt, intToIp, prefixToMask, blockSize,
  describeSubnet, minimumPrefixForHosts, subnetCount,
} from '../src/lib/ipv4.js'

describe('ipToInt / intToIp', () => {
  it('round-trips the full 32-bit range without going negative', () => {
    // This is the reason these helpers use Number arithmetic: `0xFFFFFFFF << 0`
    // and friends are *signed* 32-bit in JavaScript, so a naive implementation
    // turns 255.255.255.255 into -1 and corrupts every derived field after it.
    const cases = ['0.0.0.0', '10.0.0.1', '192.168.255.254', '255.255.255.255', '224.0.0.251']
    for (const ip of cases) {
      const value = ipToInt(ip)
      expect(value).toBeGreaterThanOrEqual(0)
      expect(value).toBeLessThanOrEqual(0xffffffff)
      expect(intToIp(value)).toBe(ip)
    }
  })

  it('agrees with known values', () => {
    expect(ipToInt('0.0.0.0')).toBe(0)
    expect(ipToInt('10.0.0.0')).toBe(0x0a000000)
    expect(ipToInt('255.255.255.255')).toBe(0xffffffff)
  })

  it('rejects malformed input', () => {
    expect(() => ipToInt('10.0.0')).toThrow(/invalid IPv4/)
    expect(() => ipToInt('10.0.0.256')).toThrow(/out of range/)
    expect(() => ipToInt('10.0.0.x')).toThrow(/invalid octet/)
    expect(() => intToIp(0x100000000)).toThrow(/32-bit/)
  })
})

describe('prefixToMask / blockSize', () => {
  it('produces the conventional masks', () => {
    expect(prefixToMask(24)).toBe(0xffffff00)
    expect(prefixToMask(30)).toBe(0xfffffffc)
    expect(prefixToMask(0)).toBe(0)
  })

  it('rejects an out-of-range prefix', () => {
    expect(() => prefixToMask(33)).toThrow(/prefix must be 0-32/)
    expect(() => prefixToMask(-1)).toThrow(/prefix must be 0-32/)
  })

  it('blocksize halves as the prefix grows', () => {
    expect(blockSize(24)).toBe(256)
    expect(blockSize(25)).toBe(128)
  })
})

describe('describeSubnet', () => {
  it('expands a /24 correctly', () => {
    expect(describeSubnet('10.0.0.0/24')).toMatchObject({
      prefix: 24,
      mask: '255.255.255.0',
      network: '10.0.0.0',
      broadcast: '10.0.0.255',
      firstHost: '10.0.0.1',
      lastHost: '10.0.0.254',
      total: 256,
      usable: 254,
    })
  })

  it('normalises a host address down to its network', () => {
    // A question may state "192.168.1.77/24"; the network is still .0/24.
    expect(describeSubnet('192.168.1.77/24').network).toBe('192.168.1.0')
    expect(describeSubnet('192.168.1.77/24').broadcast).toBe('192.168.1.255')
  })

  it('handles the top of the address space without overflow', () => {
    const top = describeSubnet('255.255.255.252/30')
    expect(top.network).toBe('255.255.255.252')
    expect(top.broadcast).toBe('255.255.255.255')
    expect(top.usable).toBe(2)
  })

  it('reports no usable hosts on /31 and /32', () => {
    expect(describeSubnet('10.0.0.0/31').usable).toBe(0)
    expect(describeSubnet('10.0.0.0/32').usable).toBe(0)
  })

  it('expands the default route without overflowing', () => {
    const defaultRoute = describeSubnet('0.0.0.0/0')
    expect(defaultRoute.network).toBe('0.0.0.0')
    expect(defaultRoute.broadcast).toBe('255.255.255.255')
    expect(defaultRoute.total).toBe(4294967296)
  })

  it('rejects a cidr with no prefix', () => {
    expect(() => describeSubnet('10.0.0.0')).toThrow(/must include a prefix/)
  })
})

describe('minimumPrefixForHosts', () => {
  it('finds the smallest prefix that fits the requirement', () => {
    expect(minimumPrefixForHosts(200)).toBe(24)
    expect(minimumPrefixForHosts(254)).toBe(24)
    expect(minimumPrefixForHosts(255)).toBe(23)
    expect(minimumPrefixForHosts(1)).toBe(30)
    expect(minimumPrefixForHosts(2)).toBe(30)
  })

  it('rejects a non-positive requirement', () => {
    expect(() => minimumPrefixForHosts(0)).toThrow(/positive integer/)
  })
})

describe('subnetCount', () => {
  it('counts subnets carved from a larger block', () => {
    expect(subnetCount(24, 26)).toBe(4)
    expect(subnetCount(16, 24)).toBe(256)
    expect(subnetCount(20, 20)).toBe(1)
  })

  it('rejects a nested prefix smaller than its parent', () => {
    expect(() => subnetCount(24, 22)).toThrow(/larger than outer/)
  })
})