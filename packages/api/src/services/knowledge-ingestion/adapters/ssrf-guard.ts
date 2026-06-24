/**
 * SSRF guard for outbound fetches in knowledge-ingestion adapters.
 *
 * Ingest jobs let an (admin) operator supply arbitrary URLs to crawl. Without a
 * guard, a URL pointing at `localhost`, an RFC1918 host, or the cloud metadata
 * endpoint (169.254.169.254) would let the server be used as a proxy into the
 * private network — a classic Server-Side Request Forgery primitive.
 *
 * `fetchGuarded` validates the URL scheme, resolves the hostname, and rejects
 * the request if ANY resolved address falls in a private/reserved range. It
 * follows redirects manually so each hop is re-validated (a benign first host
 * cannot bounce to a private address). Normal http->https / CDN redirects to
 * public hosts still work.
 */

import { lookup } from 'node:dns/promises'
import { isIP } from 'node:net'
import { AdapterError } from '@lily/shared/errors/knowledge'
import {
  Array as Arr,
  Effect,
  Match,
  Option,
  pipe,
  String as Str,
} from 'effect'

const MAX_REDIRECTS = 5

const ipv4ToInt = (ip: string): number =>
  pipe(
    Str.split(ip, '.'),
    Arr.map((part) => parseInt(part, 10)),
    Arr.reduce(0, (acc, octet) => acc * 256 + octet)
  ) >>> 0

// host part of CIDR -> prefix length. Covers loopback, private, link-local
// (incl. cloud metadata 169.254.169.254), CGNAT, benchmark, multicast/reserved.
const IPV4_BLOCKED_CIDRS = [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.168.0.0', 16],
  ['198.18.0.0', 15],
  ['224.0.0.0', 4],
  ['240.0.0.0', 4],
] as const

const inCidr = (ipInt: number, base: string, bits: number): boolean => {
  const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0
  return (ipInt & mask) === (ipv4ToInt(base) & mask)
}

const isPrivateIpv4 = (ip: string): boolean =>
  pipe(
    IPV4_BLOCKED_CIDRS,
    Arr.some(([base, bits]) => inCidr(ipv4ToInt(ip), base, bits))
  )

const isPrivateIpv6 = (ip: string): boolean => {
  const lower = Str.toLowerCase(ip)
  // loopback (::1) / unspecified (::)
  if (lower === '::1' || lower === '::') {
    return true
  }
  // IPv4-mapped (::ffff:a.b.c.d) — unwrap and check the embedded v4
  if (pipe(lower, Str.startsWith('::ffff:'))) {
    const embedded = lower.slice('::ffff:'.length)
    if (isIP(embedded) === 4) {
      return isPrivateIpv4(embedded)
    }
  }
  // unique-local fc00::/7 (fc.. / fd..), link-local fe80::/10, multicast ff00::/8
  return (
    pipe(lower, Str.startsWith('fc')) ||
    pipe(lower, Str.startsWith('fd')) ||
    /^fe[89ab]/.test(lower) ||
    pipe(lower, Str.startsWith('ff'))
  )
}

const addressIsBlocked = (addr: string): boolean =>
  pipe(
    Match.value(isIP(addr)),
    Match.when(4, () => isPrivateIpv4(addr)),
    Match.when(6, () => isPrivateIpv6(addr)),
    // Not a parseable IP — fail closed.
    Match.orElse(() => true)
  )

/**
 * Reject a URL that is not safe to fetch: non-HTTP scheme, an internal-looking
 * hostname, or a host that resolves to a private/reserved IP.
 */
export const assertPublicUrl = (
  rawUrl: string,
  adapter: string
): Effect.Effect<void, AdapterError> =>
  Effect.gen(function* () {
    const parsed = yield* Effect.try({
      try: () => new URL(rawUrl),
      catch: () =>
        new AdapterError({ message: `Invalid URL: ${rawUrl}`, adapter }),
    })

    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return yield* new AdapterError({
        message: `Blocked non-HTTP(S) URL scheme "${parsed.protocol}" for ${rawUrl}`,
        adapter,
      })
    }

    // URL.hostname keeps brackets around IPv6 literals; strip them.
    const hostname = parsed.hostname.replace(/^\[|\]$/g, '')
    const lowerHost = Str.toLowerCase(hostname)

    if (
      lowerHost === 'localhost' ||
      pipe(lowerHost, Str.endsWith('.localhost')) ||
      pipe(lowerHost, Str.endsWith('.local')) ||
      pipe(lowerHost, Str.endsWith('.internal'))
    ) {
      return yield* new AdapterError({
        message: `Blocked internal hostname "${hostname}"`,
        adapter,
      })
    }

    const resolveAddresses =
      isIP(hostname) !== 0
        ? Effect.succeed<readonly string[]>([hostname])
        : Effect.tryPromise({
            try: () =>
              lookup(hostname, { all: true }).then((records) =>
                Arr.map(records, (record) => record.address)
              ),
            catch: () =>
              new AdapterError({
                message: `DNS resolution failed for "${hostname}"`,
                adapter,
              }),
          })

    const addresses = yield* resolveAddresses

    if (pipe(addresses, Arr.some(addressIsBlocked))) {
      return yield* new AdapterError({
        message: `Blocked request to private/reserved address for host "${hostname}"`,
        adapter,
      })
    }
  })

/**
 * Fetch a URL with SSRF protection, validating every redirect hop.
 * Drop-in replacement for `fetch(url, { ...init, redirect: 'follow' })`.
 */
export const fetchGuarded = (
  url: string,
  init: RequestInit,
  adapter: string
): Effect.Effect<Response, AdapterError> =>
  Effect.gen(function* () {
    let current = url
    let redirects = 0

    while (true) {
      yield* assertPublicUrl(current, adapter)

      const response = yield* Effect.tryPromise({
        try: () => fetch(current, { ...init, redirect: 'manual' }),
        catch: (e) =>
          new AdapterError({
            message: `Fetch failed for ${current}: ${String(e)}`,
            adapter,
          }),
      })

      const location = response.headers.get('location')
      const isRedirect =
        response.status >= 300 && response.status < 400 && location !== null

      if (!isRedirect) {
        return response
      }

      if (redirects >= MAX_REDIRECTS) {
        return yield* new AdapterError({
          message: `Too many redirects (>${MAX_REDIRECTS}) fetching ${url}`,
          adapter,
        })
      }

      const nextUrl = pipe(
        Option.fromNullable(location),
        Option.getOrElse(() => '')
      )
      current = new URL(nextUrl, current).toString()
      redirects = redirects + 1
    }
  })
