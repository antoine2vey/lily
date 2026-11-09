import { createTestPlant } from '@lily/api/__tests__/fixtures/plants'
import { mockUser1 } from '@lily/api/__tests__/fixtures/users'
import {
  createMockCanopyRepository,
  type MockCanopyStore,
} from '@lily/api/__tests__/mocks/canopy.repository'
import { createMockCareScheduleRepository } from '@lily/api/__tests__/mocks/care-schedule.repository'
import { createMockDelegationRepository } from '@lily/api/__tests__/mocks/delegation.repository'
import { createMockNotificationRepository } from '@lily/api/__tests__/mocks/notification.repository'
import { createOutboxTimeline } from '@lily/api/__tests__/mocks/outbox-timeline'
import { createMockPlantRepository } from '@lily/api/__tests__/mocks/plant.repository'
import { createMockRateLimiterService } from '@lily/api/__tests__/mocks/rate-limiter.service'
import { createMockRecipientRepository } from '@lily/api/__tests__/mocks/recipient.repository'
import { createMockCurrentUser } from '@lily/api/__tests__/mocks/session'
import { createMockUserRepository } from '@lily/api/__tests__/mocks/user.repository'
import type { CareScheduleRow } from '@lily/api/repositories/care-schedule.repository'
import { withOwner } from '@lily/api/repositories/helpers/plant-owner'
import { PlantRepository } from '@lily/api/repositories/plant.repository'
import type { User } from '@lily/shared'
import type { Notification } from '@lily/shared/notification'
import { Array, Effect, Layer, pipe } from 'effect'

export const memberUsers = (store: MockCanopyStore): User[] =>
  Array.map(store.members, (m) => ({
    ...mockUser1,
    id: m.userId,
    name: m.name ?? null,
    email: `${m.userId}@example.com`,
  }))

export const canopyWorld = (
  store: MockCanopyStore,
  actor: { readonly id: string; readonly name?: string },
  notifications: Notification[] = [],
  schedules: CareScheduleRow[] = [],
  timeline = createOutboxTimeline()
) => {
  const plantsNow = () =>
    Array.map(store.plants, (p) =>
      createTestPlant({
        id: p.id,
        userId: p.userId,
        canopyId: p.canopyId,
        remindersEnabled: p.remindersEnabled,
        diedAt: p.diedAt,
      })
    )
  const plants = plantsNow()
  // Reminders read each plant's owner when they are rebuilt, after a move.
  const plantRepository = Layer.effect(
    PlantRepository,
    Effect.map(PlantRepository, (repo) => ({
      ...repo,
      findByIdsForKeyShare: (ids: ReadonlyArray<string>) =>
        Effect.succeed(
          pipe(
            plantsNow(),
            Array.filter((p) => Array.contains(ids, p.id)),
            Array.map(withOwner)
          )
        ),
    }))
  ).pipe(Layer.provide(createMockPlantRepository({ plants })))
  const canopyPlants = (canopyId: string) =>
    pipe(
      store.plants,
      Array.filter((p) => p.canopyId === canopyId),
      Array.map((p) => p.id)
    )
  return {
    notifications,
    layer: Layer.mergeAll(
      createMockCanopyRepository(store),
      createMockNotificationRepository(notifications, {
        ...timeline.notificationOptions,
        canopyPlants,
      }),
      timeline.queue,
      createMockCareScheduleRepository({
        schedules,
        plants,
        memberships: store.members,
      }),
      plantRepository,
      createMockUserRepository(memberUsers(store)),
      createMockDelegationRepository(),
      createMockRecipientRepository(store),
      createMockRateLimiterService(),
      timeline.sql,
      createMockCurrentUser({ id: actor.id, name: actor.name ?? actor.id })
    ),
  }
}

export const pushesOf = (
  notifications: ReadonlyArray<Notification>,
  type: string
) =>
  pipe(
    Array.filter(notifications, (n) => n.type === type),
    Array.map((n) => n.userId)
  )

export type WorldServices = Layer.Success<
  ReturnType<typeof canopyWorld>['layer']
>
