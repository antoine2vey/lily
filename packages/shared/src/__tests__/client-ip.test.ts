import { describe, expect, it } from 'vitest'
import { clientIp } from '../services/http/client-ip'

describe('clientIp', () => {
  it('takes the visitor from cf-connecting-ip when Cloudflare connected', () => {
    expect(
      clientIp({
        'x-real-ip': '172.68.10.4',
        'cf-connecting-ip': '203.0.113.9',
      })
    ).toBe('203.0.113.9')
  })

  it('recognizes a Cloudflare edge on IPv6', () => {
    expect(
      clientIp({
        'x-real-ip': '2a06:98c0:3600::103',
        'cf-connecting-ip': '2001:db8::7',
      })
    ).toBe('2001:db8::7')
  })

  it('ignores cf-connecting-ip from a caller that bypassed Cloudflare', () => {
    expect(
      clientIp({ 'x-real-ip': '198.51.100.23', 'cf-connecting-ip': '10.0.0.1' })
    ).toBe('198.51.100.23')
  })

  it('falls back to the Cloudflare edge when the visitor header is missing', () => {
    expect(clientIp({ 'x-real-ip': '104.16.0.1' })).toBe('104.16.0.1')
  })

  it('keys a malformed peer on its own value', () => {
    expect(
      clientIp({ 'x-real-ip': 'not-an-ip', 'cf-connecting-ip': '203.0.113.9' })
    ).toBe('not-an-ip')
  })

  it('shares one key when no proxy header is present', () => {
    expect(clientIp({ 'cf-connecting-ip': '203.0.113.9' })).toBe('unknown')
  })
})
