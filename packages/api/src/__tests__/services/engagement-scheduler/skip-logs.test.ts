import {
  freezeClock,
  SUNDAY_10_IN_PARIS,
} from '@lily/api/__tests__/fixtures/clock'
import { createTestNotification } from '@lily/api/__tests__/fixtures/notifications'
import { makeUserWithSettings } from '@lily/api/__tests__/fixtures/users'
import { createMockEngagementRepository } from '@lily/api/__tests__/mocks/engagement.repository'
import { createMockNotificationRepository } from '@lily/api/__tests__/mocks/notification.repository'
import type {
  EngagementRepository,
  UserWithSettings,
} from '@lily/api/repositories/engagement.repository'
import type { NotificationRepository } from '@lily/api/repositories/notification.repository'
import {
  photoReminder,
  plantAnniversary,
} from '@lily/api/services/engagement-scheduler/scheduler'
import {
  type EngagementRule,
  runRules,
} from '@lily/api/services/helpers/engagement-rules'
import type { Notification } from '@lily/shared/notification'
import { Effect, Layer, Logger } from 'effect'
import { describe, expect, it } from 'vitest'

freezeClock(SUNDAY_10_IN_PARIS)

const DAY = 24 * 60 * 60 * 1000
const ago = (days: number) => new Date(Date.now() - days * DAY)

const user = makeUserWithSettings({ id: 'user-1' })
const plant = {
  plantId: 'plant-1',
  plantName: 'Ficus',
  userId: 'user-1',
  dateAdded: ago(365),
}

const logsOf = async (
  rule: EngagementRule<
    UserWithSettings,
    EngagementRepository | NotificationRepository
  >,
  sent: ReadonlyArray<Notification>
) => {
  const logs: unknown[] = []
  await Effect.runPromise(
    runRules('engagement-scheduler', [user], [rule]).pipe(
      Effect.provide(
        Layer.mergeAll(
          createMockNotificationRepository([...sent]),
          createMockEngagementRepository({
            plantsWithoutRecentPhoto: {
              'user-1': [{ ...plant, lastPhotoAt: ago(45) }],
            },
          }),
          Logger.layer([
            Logger.make(({ message }) => {
              logs.push(message)
            }),
          ])
        )
      )
    )
  )
  return logs
}

const alreadySent = (rule: string) => [
  [
    `[engagement-scheduler] Skipped user (${rule})`,
    { reason: 'already_sent', userId: 'user-1' },
  ],
]

describe('what a run logs about a user it passes over', () => {
  it('says nothing of a user with no plant anniversary today', async () => {
    expect(await logsOf(plantAnniversary([]), [])).toEqual([])
  })

  it('names the anniversaries already celebrated', async () => {
    const celebrated = createTestNotification({
      userId: 'user-1',
      type: 'plant_anniversary',
      plantId: 'plant-1',
    })

    expect(await logsOf(plantAnniversary([plant]), [celebrated])).toEqual(
      alreadySent('plant_anniversary')
    )
  })

  it('names the photo reminders already sent', async () => {
    const reminded = createTestNotification({
      userId: 'user-1',
      type: 'photo_reminder',
      plantId: 'plant-1',
    })

    expect(await logsOf(photoReminder, [reminded])).toEqual(
      alreadySent('photo_reminder')
    )
  })
})
