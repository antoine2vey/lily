import { createTestMembership } from '@lily/api/__tests__/fixtures/canopies'
import {
  createTestCarePlan,
  createTestCarePlanStep,
} from '@lily/api/__tests__/fixtures/care-plans'
import { createTestPlant } from '@lily/api/__tests__/fixtures/plants'
import { mockUserProfile } from '@lily/api/__tests__/mocks/auth'
import { createMockCanopyRepository } from '@lily/api/__tests__/mocks/canopy.repository'
import { createMockCareLogRepository } from '@lily/api/__tests__/mocks/care-log.repository'
import { createMockCarePlanRepository } from '@lily/api/__tests__/mocks/care-plan.repository'
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

const RepositoriesLive = Layer.mergeAll(
  createMockCarePlanRepository({
    plans: [shared],
    steps: [step],
    plants: [{ id: plant.id, name: plant.name, imageUrl: null }],
  }),
  createMockPlantRepository({ plants: [plant] }),
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
  createMockWeatherRepository()
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
})
