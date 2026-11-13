import { createTestMembership } from '@lily/api/__tests__/fixtures/canopies'
import {
  createTestCarePlan,
  createTestCarePlanStep,
} from '@lily/api/__tests__/fixtures/care-plans'
import { createTestCarePlant } from '@lily/api/__tests__/fixtures/care-plants'
import { createTestPlant } from '@lily/api/__tests__/fixtures/plants'
import { mockUserProfile } from '@lily/api/__tests__/mocks/auth'
import { createMockCanopyRepository } from '@lily/api/__tests__/mocks/canopy.repository'
import { createInMemoryCare } from '@lily/api/__tests__/mocks/care'
import { createMockCareLogRepository } from '@lily/api/__tests__/mocks/care-log.repository'
import { createCarePlanRows } from '@lily/api/__tests__/mocks/care-plan.repository'
import { createMockCareScheduleRepository } from '@lily/api/__tests__/mocks/care-schedule.repository'
import { createMockDelegationRepository } from '@lily/api/__tests__/mocks/delegation.repository'
import { createMockEventBus } from '@lily/api/__tests__/mocks/event-bus'
import { createMockNotificationRepository } from '@lily/api/__tests__/mocks/notification.repository'
import { createMockPlantRepository } from '@lily/api/__tests__/mocks/plant.repository'
import { createMockSqlClient } from '@lily/api/__tests__/mocks/sql-client'
import { createMockUserRepository } from '@lily/api/__tests__/mocks/user.repository'
import { createMockWeatherRepository } from '@lily/api/__tests__/mocks/weather.repository'
import { createMockWeatherCache } from '@lily/api/__tests__/mocks/weather-cache'
import { createMockWeatherProvider } from '@lily/api/__tests__/mocks/weather-provider'
import type { Api } from '@lily/api/api'
import { LifeState } from '@lily/api/contexts/care/domain/care-plant'
import {
  Authentication,
  CurrentUser,
} from '@lily/api/services/auth/middleware.types'
import { CarePlansApi } from '@lily/api/services/care-plans/api'
import { CarePlansApiLive } from '@lily/api/services/care-plans/handlers'
import { Effect, FileSystem, Layer, Path, Redacted } from 'effect'
import { Etag, HttpPlatform, HttpRouter } from 'effect/http'
import { HttpApi, HttpApiBuilder } from 'effect/http-api'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const alex = 'user-alex'
const lily = 'user-lily'
const sam = 'user-sam'

const plant = createTestPlant({
  id: crypto.randomUUID(),
  userId: null,
  canopyId: 'canopy-1',
  createdByUserId: alex,
})
const shared = createTestCarePlan({
  id: crypto.randomUUID(),
  plantId: plant.id,
  userId: alex,
  status: 'accepted',
  chatMessageId: crypto.randomUUID(),
})
const step = createTestCarePlanStep(shared.id, {
  id: crypto.randomUUID(),
  title: 'Check the leaves',
})
const authorStep = createTestCarePlanStep(shared.id, {
  id: crypto.randomUUID(),
  position: 1,
  title: 'Mist the stems',
})

const leftPlant = createTestPlant({
  id: crypto.randomUUID(),
  userId: null,
  canopyId: 'canopy-1',
  createdByUserId: 'user-gone',
})
const leftBehind = createTestCarePlan({
  id: crypto.randomUUID(),
  plantId: leftPlant.id,
  userId: 'user-gone',
  status: 'accepted',
  chatMessageId: crypto.randomUUID(),
})
const leftStep = createTestCarePlanStep(leftBehind.id, {
  id: crypto.randomUUID(),
  title: 'Repot',
})

const buriedPlant = createTestPlant({
  id: crypto.randomUUID(),
  userId: null,
  canopyId: 'canopy-1',
  createdByUserId: alex,
  diedAt: new Date('2026-11-01'),
})
const planOfBuried = (id: string) =>
  createTestCarePlan({ id, plantId: buriedPlant.id, userId: alex })
const buriedPlans = {
  accept: planOfBuried(crypto.randomUUID()),
  dismiss: planOfBuried(crypto.randomUUID()),
  complete: planOfBuried(crypto.randomUUID()),
  uncomplete: planOfBuried(crypto.randomUUID()),
  dropStep: planOfBuried(crypto.randomUUID()),
  delete: planOfBuried(crypto.randomUUID()),
}
const buriedStepOf = (planId: string) => `${planId.slice(0, -4)}0000`
const proposedTwice = createTestCarePlan({
  id: crypto.randomUUID(),
  plantId: plant.id,
  userId: alex,
})

const TestApi = HttpApi.make('carePlanAccess').add(CarePlansApi)

const AuthLive = Layer.succeed(
  Authentication,
  Authentication.of({
    bearer: (httpEffect, { credential }) =>
      Effect.provideService(httpEffect, CurrentUser, {
        ...mockUserProfile,
        id: Redacted.value(credential),
      }),
  })
)

const planRows = createCarePlanRows({
  plans: [shared, leftBehind, proposedTwice, ...Object.values(buriedPlans)],
  steps: [
    step,
    authorStep,
    leftStep,
    ...Object.values(buriedPlans).map((plan) =>
      createTestCarePlanStep(plan.id, {
        id: buriedStepOf(plan.id),
        completedAt: plan === buriedPlans.uncomplete ? new Date() : null,
      })
    ),
  ],
  plants: [
    { id: plant.id, name: plant.name, imageUrl: null },
    { id: leftPlant.id, name: leftPlant.name, imageUrl: null },
    { id: buriedPlant.id, name: buriedPlant.name, imageUrl: null },
  ],
})

const RepositoriesLive = Layer.mergeAll(
  planRows.layer,
  createMockPlantRepository({ plants: [plant, leftPlant, buriedPlant] }),
  createMockCanopyRepository([
    createTestMembership({ userId: alex, role: 'owner' }),
    createTestMembership({ userId: lily }),
  ]),
  createMockDelegationRepository({}),
  createMockCareScheduleRepository({ schedules: [], plants: [plant] }),
  createMockNotificationRepository([]),
  createMockCareLogRepository([]),
  createMockUserRepository([]),
  createMockEventBus(),
  createMockSqlClient(),
  createMockWeatherProvider(),
  createMockWeatherCache(),
  createMockWeatherRepository(),
  createInMemoryCare(
    [
      createTestCarePlant(plant.id),
      createTestCarePlant(leftPlant.id),
      createTestCarePlant(buriedPlant.id, { life: LifeState.Dead() }),
    ],
    { plans: planRows }
  ).layer
)

const PlatformLive = Layer.mergeAll(
  Path.layer,
  Etag.layer,
  HttpPlatform.layer
).pipe(Layer.provideMerge(FileSystem.layerNoop({})))

const makeHandler = () =>
  HttpRouter.toWebHandler(
    HttpApiBuilder.layer(TestApi).pipe(
      Layer.provide(CarePlansApiLive(TestApi as unknown as Api)),
      Layer.provide(AuthLive),
      Layer.provide(RepositoriesLive),
      Layer.provide(PlatformLive)
    ) as unknown as Layer.Layer<never>,
    { disableLogger: true }
  )

describe('care plan access over HTTP', () => {
  let web: ReturnType<typeof makeHandler>

  const call = async (method: string, path: string, userId: string) => {
    const res = await web.handler(
      new Request(`http://lily.test${path}`, {
        method,
        headers: { Authorization: `Bearer ${userId}` },
      })
    )
    return { status: res.status, body: await res.json() }
  }

  beforeAll(() => {
    web = makeHandler()
  })

  afterAll(async () => {
    await web.dispose()
  })

  it('answers 404 for a plan the caller cannot see', async () => {
    const res = await call('DELETE', `/care-plans/${shared.id}`, sam)
    expect(res.status).toBe(404)
    expect(res.body._tag).toBe('CarePlanNotFoundError')
  })

  it('answers 403 when a member asks for an author-only action', async () => {
    const res = await call('DELETE', `/care-plans/${shared.id}`, lily)
    expect(res.status).toBe(403)
    expect(res.body._tag).toBe('CarePlanNotAuthorizedError')
  })

  it('lists a shared plan to another member without its chat link', async () => {
    const res = await call('GET', `/care-plans/plant/${plant.id}`, lily)
    expect(res.status).toBe(200)
    expect(res.body.items).toHaveLength(1)
    expect(res.body.items[0]).not.toHaveProperty('chatMessageId')
  })

  it('keeps the chat link out of a tick response for another member', async () => {
    const res = await call(
      'PATCH',
      `/care-plans/${shared.id}/steps/${step.id}/complete`,
      lily
    )
    expect(res.status).toBe(200)
    expect(res.body).not.toHaveProperty('chatMessageId')
  })

  it('shows the author their own chat link', async () => {
    const res = await call('GET', `/care-plans/plant/${plant.id}`, alex)
    expect(res.body.items[0].chatMessageId).toBe(shared.chatMessageId)
  })

  it('keeps the chat link out of a delete-step response for a Steward', async () => {
    const res = await call(
      'DELETE',
      `/care-plans/${leftBehind.id}/steps/${leftStep.id}`,
      alex
    )
    expect(res.status).toBe(200)
    expect(res.body).not.toHaveProperty('chatMessageId')
  })

  it('shows the author their chat link after deleting a step', async () => {
    const res = await call(
      'DELETE',
      `/care-plans/${shared.id}/steps/${authorStep.id}`,
      alex
    )
    expect(res.status).toBe(200)
    expect(res.body.chatMessageId).toBe(shared.chatMessageId)
  })

  it('answers 409 to a second accept of the same plan', async () => {
    const path = `/care-plans/${proposedTwice.id}/accept`

    const first = await call('PATCH', path, alex)
    const second = await call('PATCH', path, alex)

    expect(first.status).toBe(200)
    expect(first.body.status).toBe('accepted')
    expect(second.status).toBe(409)
    expect(second.body._tag).toBe('CarePlanNotProposedError')
  })

  it.each([
    ['accept', 'PATCH', (id: string) => `/care-plans/${id}/accept`],
    ['dismiss', 'PATCH', (id: string) => `/care-plans/${id}/dismiss`],
    [
      'complete',
      'PATCH',
      (id: string) => `/care-plans/${id}/steps/${buriedStepOf(id)}/complete`,
    ],
    [
      'uncomplete',
      'PATCH',
      (id: string) => `/care-plans/${id}/steps/${buriedStepOf(id)}/uncomplete`,
    ],
    [
      'dropStep',
      'DELETE',
      (id: string) => `/care-plans/${id}/steps/${buriedStepOf(id)}`,
    ],
  ] as const)(
    'answers 404 to %s on a plan of a dead plant (a change: it used to run)',
    async (command, method, pathOf) => {
      const res = await call(method, pathOf(buriedPlans[command].id), alex)

      expect(res.status).toBe(404)
      expect(res.body._tag).toBe('CarePlanNotFoundError')
    }
  )

  it('still deletes a plan of a dead plant', async () => {
    const res = await call(
      'DELETE',
      `/care-plans/${buriedPlans.delete.id}`,
      alex
    )

    expect(res.status).toBe(200)
  })
})
