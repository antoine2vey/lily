import { BlockList, isIPv6 } from 'node:net'
import { Array, Option, pipe, String } from 'effect'

// https://www.cloudflare.com/ips-v4/ and /ips-v6/, fetched 2026-10-24
const CLOUDFLARE_RANGES = [
  '173.245.48.0/20',
  '103.21.244.0/22',
  '103.22.200.0/22',
  '103.31.4.0/22',
  '141.101.64.0/18',
  '108.162.192.0/18',
  '190.93.240.0/20',
  '188.114.96.0/20',
  '197.234.240.0/22',
  '198.41.128.0/17',
  '162.158.0.0/15',
  '104.16.0.0/13',
  '104.24.0.0/14',
  '172.64.0.0/13',
  '131.0.72.0/22',
  '2400:cb00::/32',
  '2606:4700::/32',
  '2803:f800::/32',
  '2405:b500::/32',
  '2405:8100::/32',
  '2a06:98c0::/29',
  '2c0f:f248::/32',
] as const

const cloudflare = new BlockList()
Array.forEach(CLOUDFLARE_RANGES, (range) => {
  const [network = '', prefix = ''] = String.split(range, '/')
  cloudflare.addSubnet(
    network,
    Number(prefix),
    isIPv6(network) ? 'ipv6' : 'ipv4'
  )
})

const isCloudflare = (ip: string) =>
  cloudflare.check(ip, isIPv6(ip) ? 'ipv6' : 'ipv4')

/**
 * The caller's IP for rate limiting. Railway's edge overwrites `x-real-ip`
 * with whoever connected to it: a Cloudflare edge for proxied traffic, the
 * caller for a direct hit on the `*.up.railway.app` origin. `cf-connecting-ip`
 * is only believed when that peer really is Cloudflare, so a direct caller
 * can't pick their own rate-limit key.
 */
export const clientIp = (headers: {
  readonly 'x-real-ip'?: string | undefined
  readonly 'cf-connecting-ip'?: string | undefined
}): string =>
  pipe(
    Option.fromNullishOr(headers['x-real-ip']),
    Option.map((peer) =>
      isCloudflare(peer)
        ? pipe(
            Option.fromNullishOr(headers['cf-connecting-ip']),
            Option.getOrElse(() => peer)
          )
        : peer
    ),
    Option.getOrElse(() => 'unknown')
  )
