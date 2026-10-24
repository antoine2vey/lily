import { Array, Option, pipe, String } from 'effect'

export const SCOPES_SUPPORTED = [
  'plants:read',
  'plants:write',
  'knowledge:read',
] as const

export type Scope = (typeof SCOPES_SUPPORTED)[number]

const isScope = (scope: string): scope is Scope =>
  Array.contains(SCOPES_SUPPORTED, scope)

/**
 * Scopes to bind to an authorization from the request's `scope` parameter.
 * No scope requested grants every supported scope (RFC 6749 §3.3); any
 * unsupported scope rejects the request (`None`).
 */
export const grantScopes = (
  requested: string | null
): Option.Option<readonly Scope[]> => {
  const scopes = pipe(
    Option.fromNullishOr(requested),
    Option.map(String.split(' ')),
    Option.getOrElse((): readonly string[] => []),
    Array.filter(String.isNonEmpty)
  )
  if (Array.isReadonlyArrayEmpty(scopes)) {
    return Option.some(SCOPES_SUPPORTED)
  }
  return Array.every(scopes, isScope)
    ? Option.some(Array.dedupe(scopes))
    : Option.none()
}
