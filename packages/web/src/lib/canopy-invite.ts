import { Array, Match, Option, Predicate, pipe, String } from 'effect'

const API_URL = pipe(
  Option.fromNullishOr(process.env.NEXT_PUBLIC_API_URL),
  Option.getOrElse(() => 'https://api.withlily.app/api')
)

export interface InvitePreview {
  readonly canopyName: string
  readonly inviterName: string | null
}

const isInvitePreview = (body: unknown): body is InvitePreview =>
  Predicate.hasProperty(body, 'canopyName') &&
  Predicate.isString(body.canopyName) &&
  Predicate.hasProperty(body, 'inviterName') &&
  (Predicate.isString(body.inviterName) || Predicate.isNull(body.inviterName))

export type InviteView =
  | { readonly _tag: 'Loading' }
  | { readonly _tag: 'Ready'; readonly preview: InvitePreview }
  | { readonly _tag: 'Expired' }
  | { readonly _tag: 'Invalid' }
  | { readonly _tag: 'Unavailable' }

export const loading: InviteView = { _tag: 'Loading' }
export const invalid: InviteView = { _tag: 'Invalid' }
const expired: InviteView = { _tag: 'Expired' }
const unavailable: InviteView = { _tag: 'Unavailable' }

export const tokenFromPath = (pathname: string): Option.Option<string> =>
  pipe(
    pathname,
    String.match(/^\/join\/([^/]+)\/?$/),
    Option.flatMap(Array.get(1))
  )

export const appLink = (token: string): string => `lily://join/${token}`

const viewFromResponse = (status: number, body: unknown): InviteView =>
  Match.value(status).pipe(
    Match.when(200, () =>
      pipe(
        Option.liftPredicate(body, isInvitePreview),
        Option.match({
          onNone: () => unavailable,
          onSome: (preview): InviteView => ({ _tag: 'Ready', preview }),
        })
      )
    ),
    Match.when(410, () => expired),
    Match.whenOr(400, 404, () => invalid),
    Match.orElse(() => unavailable)
  )

export const fetchInviteView = (
  token: string,
  signal: AbortSignal
): Promise<InviteView> =>
  fetch(`${API_URL}/canopy-invites/preview`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ token }),
    signal,
  })
    .then(async (response) =>
      viewFromResponse(
        response.status,
        response.ok ? await response.json() : null
      )
    )
    .catch(() => unavailable)
