import { CurrentUser } from '@lily/api/services/auth/middleware.types'
import { type Brand, Effect, Schema, Struct } from 'effect'

export type Seen<A> = A & Brand.Brand<'Seen'>

export const seen = Schema.brand('Seen')

/** The chat that led to a row is its author's alone. */
export const seenByCaller = <
  A extends {
    readonly userId: string
    readonly chatMessageId?: string | undefined
  },
>(
  row: A
): Effect.Effect<Seen<A | Omit<A, 'chatMessageId'>>, never, CurrentUser> =>
  Effect.map(
    CurrentUser,
    ({ id }) =>
      (row.userId === id ? row : Struct.omit(row, ['chatMessageId'])) as Seen<
        A | Omit<A, 'chatMessageId'>
      >
  )
