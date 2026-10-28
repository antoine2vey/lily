import { CANOPY_INVITE_TOKEN_LENGTH } from '@lily/shared'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { Effect, Option, Schema } from 'effect'
import { useEffect, useState } from 'react'

const PENDING_JOIN_KEY = '@lily/pending_canopy_join'

export const InviteToken = Schema.String.check(
  Schema.isPattern(new RegExp(`^[A-Za-z0-9_-]{${CANOPY_INVITE_TOKEN_LENGTH}}$`))
).pipe(Schema.brand('InviteToken'))
export type InviteToken = typeof InviteToken.Type

export const parseInviteToken = Schema.decodeUnknownOption(InviteToken)

export const joinRoute = (token: InviteToken) => `/join/${token}` as const

/**
 * Holds an invite opened while signed out, so the join screen can come back
 * once the user has signed in. Storage failures drop the invite: the user can
 * tap the link again.
 */
export const stashPendingJoin = (token: InviteToken) =>
  Effect.tryPromise(() => AsyncStorage.setItem(PENDING_JOIN_KEY, token)).pipe(
    Effect.catchTag('UnknownError', () => Effect.void)
  )

export const readPendingJoin = Effect.tryPromise(() =>
  AsyncStorage.getItem(PENDING_JOIN_KEY)
).pipe(
  Effect.map(parseInviteToken),
  Effect.catchTag('UnknownError', () => Effect.succeed(Option.none()))
)

export const clearPendingJoin = Effect.tryPromise(() =>
  AsyncStorage.removeItem(PENDING_JOIN_KEY)
).pipe(Effect.catchTag('UnknownError', () => Effect.void))

export type PendingJoin =
  | { readonly _tag: 'Loading' }
  | { readonly _tag: 'Loaded'; readonly token: Option.Option<InviteToken> }

export function usePendingJoin(): PendingJoin {
  const [pending, setPending] = useState<PendingJoin>({ _tag: 'Loading' })

  useEffect(() => {
    Effect.runPromise(readPendingJoin).then((token) =>
      setPending({ _tag: 'Loaded', token })
    )
  }, [])

  return pending
}
