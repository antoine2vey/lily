import { createMockNotificationRepository } from '@lily/api/__tests__/mocks/notification.repository'
import { MockSqlClientLive } from '@lily/api/__tests__/mocks/sql-client'
import {
  changeOwn,
  changeReminders,
} from '@lily/api/services/plants/helpers/plant-change'
import { requireReminderKeys } from '@lily/api/services/plants/helpers/reminder-keys'
import { Cause, Effect, Exit, Layer } from 'effect'
import { describe, expect, it } from 'vitest'

const Live = Layer.mergeAll(
  MockSqlClientLive,
  createMockNotificationRepository([])
)

const outcome = (exit: Exit.Exit<unknown, unknown>) =>
  Exit.match(exit, {
    onSuccess: () => 'ok',
    onFailure: (cause) => {
      const error = Cause.squash(cause)
      return typeof error === 'object' && error !== null && '_tag' in error
        ? String(error._tag)
        : String(error)
    },
  })

describe('lock plans', () => {
  it('runs a change inside one plan', async () => {
    const exit = await Effect.runPromiseExit(
      changeOwn('alex')(Effect.succeed('done')).pipe(Effect.provide(Live))
    )
    expect(exit).toEqual(Exit.succeed('done'))
  })

  it('dies when a plan runs inside another plan', async () => {
    const exit = await Effect.runPromiseExit(
      changeOwn('alex')(changeReminders(['fern'])(Effect.void)).pipe(
        Effect.provide(Live)
      )
    )
    expect(outcome(exit)).toBe('LockPlanNested')
  })

  it('dies when a reminder write runs outside every plan', async () => {
    const exit = await Effect.runPromiseExit(
      requireReminderKeys([{ plantId: 'fern', type: 'watering_reminder' }])(
        Effect.void
      )
    )
    expect(outcome(exit)).toBe('ReminderKeyNotHeld')
  })
})
