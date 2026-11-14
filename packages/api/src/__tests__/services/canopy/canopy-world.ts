import { createTestPlant } from '@lily/api/__tests__/fixtures/plants'
import { mockUser1 } from '@lily/api/__tests__/fixtures/users'
import { createInMemoryAbsence } from '@lily/api/__tests__/mocks/absence'
import {
  createInMemoryCanopy,
  type MockCanopySurroundings,
} from '@lily/api/__tests__/mocks/canopy'
import {
  createMockCanopyRepository,
  type MockCanopyStore,
} from '@lily/api/__tests__/mocks/canopy.repository'
import { createMockCareScheduleRepository } from '@lily/api/__tests__/mocks/care-schedule.repository'
import { createMockNotificationRepository } from '@lily/api/__tests__/mocks/notification.repository'
import { DeliveringOutboxLive } from '@lily/api/__tests__/mocks/outbox'
import { createOutboxTimeline } from '@lily/api/__tests__/mocks/outbox-timeline'
import { createMockPlantRepository } from '@lily/api/__tests__/mocks/plant.repository'
import { createMockRateLimiterService } from '@lily/api/__tests__/mocks/rate-limiter.service'
import { createMockCurrentUser } from '@lily/api/__tests__/mocks/session'
import { createMockUserRepository } from '@lily/api/__tests__/mocks/user.repository'
import type { CareScheduleRow } from '@lily/api/repositories/care-schedule.repository'
import { withOwner } from '@lily/api/repositories/helpers/plant-owner'
import { PlantRepository } from '@lily/api/repositories/plant.repository'
import type { User } from '@lily/shared'
import type { Notification } from '@lily/shared/notification'
import { Array, Effect, Layer, Option, pipe } from 'effect'

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
  timeline = createOutboxTimeline(),
  around: MockCanopySurroundings = {},
  outsiders: ReadonlyArray<User> = []
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
    Effect.map(PlantRepository, (repo) => {
      const findNow = (ids: ReadonlyArray<string>) =>
        Effect.succeed(
          pipe(
            plantsNow(),
            Array.filter((p) => Array.contains(ids, p.id)),
            Array.map(withOwner)
          )
        )
      return { ...repo, findByIds: findNow, findByIdsForKeyShare: findNow }
    })
  ).pipe(Layer.provide(createMockPlantRepository({ plants })))
  const canopyPlants = (canopyId: string) =>
    pipe(
      store.plants,
      Array.filter((p) => p.canopyId === canopyId),
      Array.map((p) => p.id)
    )
  const plantOwner = (plantId: string) =>
    pipe(
      Array.findFirst(store.plants, (p) => p.id === plantId),
      Option.flatMapNullishOr((p) => p.userId),
      Option.getOrNull
    )
  const users = [
    ...memberUsers(store),
    ...Array.filter(outsiders, (user) => user.id !== actor.id),
    ...(Array.some(store.members, (m) => m.userId === actor.id)
      ? []
      : [
          {
            ...mockUser1,
            id: actor.id,
            name: actor.name ?? null,
            email: `${actor.id}@example.com`,
          },
        ]),
  ]
  const repositories = Layer.mergeAll(
    createMockCanopyRepository(store),
    createMockNotificationRepository(notifications, {
      ...timeline.notificationOptions,
      canopyPlants,
      plantOwner,
    }),
    timeline.queue,
    createMockCareScheduleRepository({
      schedules,
      plants,
      memberships: store.members,
    }),
    plantRepository,
    createMockUserRepository(users),
    createInMemoryAbsence({ users }, { notifications, timeline }).layer,
    createMockRateLimiterService(),
    timeline.sql,
    createMockCurrentUser({ id: actor.id, name: actor.name ?? actor.id })
  )
  return {
    notifications,
    layer: createInMemoryCanopy(store, users, around).service.pipe(
      Layer.provideMerge(DeliveringOutboxLive),
      Layer.provideMerge(repositories)
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
