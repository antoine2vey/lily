import { type Brand, Schema, Struct } from 'effect'

export type Seen<A> = A & Brand.Brand<'Seen'>

export const seen = Schema.brand('Seen')

/** The chat that led to a row is its author's alone. */
export const asSeenBy =
  (viewerId: string) =>
  <
    A extends {
      readonly userId: string
      readonly chatMessageId?: string | undefined
    },
  >(
    row: A
  ): Seen<A | Omit<A, 'chatMessageId'>> =>
    (row.userId === viewerId
      ? row
      : Struct.omit(row, ['chatMessageId'])) as Seen<
      A | Omit<A, 'chatMessageId'>
    >
