import type { createTestPlant } from '@lily/api/__tests__/fixtures/plants'
import {
  type AbsenceSurroundings,
  createInMemoryAbsence,
} from '@lily/api/__tests__/mocks/absence'
import {
  createMockCanopyRepository,
  type MockCanopyStore,
} from '@lily/api/__tests__/mocks/canopy.repository'
import { createStubCare } from '@lily/api/__tests__/mocks/care'
import {
  createMockCareScheduleRepository,
  type MockCareScheduleData,
} from '@lily/api/__tests__/mocks/care-schedule.repository'
import { createMockDelegationRepository } from '@lily/api/__tests__/mocks/delegation.repository'
import { createMockNotificationRepository } from '@lily/api/__tests__/mocks/notification.repository'
import { DeliveringOutboxLive } from '@lily/api/__tests__/mocks/outbox'
import { createMockPlantRepository } from '@lily/api/__tests__/mocks/plant.repository'
import { createMockCurrentUser } from '@lily/api/__tests__/mocks/session'
import { MockSqlClientLive } from '@lily/api/__tests__/mocks/sql-client'
import { createMockUserRepository } from '@lily/api/__tests__/mocks/user.repository'
import type { DelegationRow } from '@lily/api/repositories/delegation.repository'
import type { User } from '@lily/shared'
import type { Notification } from '@lily/shared/notification'
import { Layer } from 'effect'

export interface VacationWorld {
  readonly users: User[]
  readonly plants?: ReturnType<typeof createTestPlant>[] | undefined
  readonly schedules?: MockCareScheduleData['schedules']
  readonly memberships?: MockCareScheduleData['memberships']
  readonly canopies?: MockCanopyStore | undefined
  readonly delegations?: DelegationRow[] | undefined
  readonly delegationPlants?:
    | Array<{ delegationId: string; plantId: string }>
    | undefined
  readonly notifications?: Notification[] | undefined
  readonly currentUserId?: string | undefined
  readonly store?: AbsenceSurroundings['store']
}

export const createVacationWorld = (world: VacationWorld) => {
  const plants = world.plants ?? []
  const notifications = world.notifications ?? []
  const delegations = world.delegations ?? []
  const delegationPlants = world.delegationPlants ?? []
  const care = createStubCare()
  const replanned = Layer.mergeAll(
    MockSqlClientLive,
    createMockUserRepository(world.users),
    createMockNotificationRepository(notifications),
    createMockPlantRepository({ plants }),
    createMockCareScheduleRepository({
      plants,
      ...(world.schedules ? { schedules: world.schedules } : {}),
      ...(world.memberships ? { memberships: world.memberships } : {}),
    }),
    createMockCanopyRepository(world.canopies ?? world.memberships ?? []),
    createMockDelegationRepository({ delegations, delegationPlants })
  )
  const absence = createInMemoryAbsence(
    { users: world.users, plants, delegations, delegationPlants },
    {
      notifications,
      care: care.layer,
      outbox: DeliveringOutboxLive.pipe(Layer.provide(replanned)),
      store: world.store,
    }
  )
  return {
    care,
    notifications,
    events: absence.events,
    writes: absence.writes,
    layer: Layer.mergeAll(
      absence.layer,
      createMockCurrentUser({ id: world.currentUserId ?? 'user-1' })
    ),
  }
}
