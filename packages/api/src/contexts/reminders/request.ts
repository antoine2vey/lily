import { type Dirty, DirtySchema } from '@lily/api/contexts/reminders/store'
import { Outbox, topic } from '@lily/api/kernel/outbox'
import type { Transaction } from '@lily/api/kernel/transact'
import { Effect } from 'effect'
import type { SqlError } from 'effect/sql/SqlError'

export const RemindersTopic = topic('reminders', DirtySchema)

/**
 * Asks for the reminders of everything `dirty` names to be planned again.
 * The request is stored in the caller's transaction, so it exists if and only
 * if the change that made the reminders stale does. The planning runs after
 * the commit, in the `reminders-replan` consumer.
 */
export const request = (
  ...dirty: ReadonlyArray<Dirty>
): Effect.Effect<void, SqlError, Outbox | Transaction> =>
  Effect.flatMap(Outbox, (outbox) => outbox.append(RemindersTopic, dirty)).pipe(
    Effect.catchTag('SchemaError', Effect.die),
    Effect.withSpan('Reminders.request', {
      attributes: { 'dirty.count': dirty.length },
    })
  )
