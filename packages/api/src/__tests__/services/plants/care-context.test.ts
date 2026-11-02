import { mockCanopyId } from '@lily/api/__tests__/fixtures/canopies'
import { createTestUser } from '@lily/api/__tests__/fixtures/users'
import {
  createCanopyStore,
  createMockCanopyRepository,
  createTestCanopyRow,
} from '@lily/api/__tests__/mocks/canopy.repository'
import { createMockUserRepository } from '@lily/api/__tests__/mocks/user.repository'
import {
  actorDayTimezone,
  careContext,
} from '@lily/api/services/plants/helpers/care-context'
import type { PlantOwner } from '@lily/shared'
import { Effect, Layer } from 'effect'
import { describe, expect, it } from 'vitest'

const run = (
  owner: PlantOwner,
  users: ReturnType<typeof createTestUser>[] = [],
  canopies: ReturnType<typeof createTestCanopyRow>[] = []
) =>
  Effect.runPromise(
    careContext(owner).pipe(
      Effect.provide(
        Layer.mergeAll(
          createMockUserRepository(users),
          createMockCanopyRepository(createCanopyStore({ canopies }))
        )
      )
    )
  )

describe('careContext', () => {
  it('takes the timezone and weather location from the owning user', async () => {
    const user = createTestUser({
      id: 'alex',
      timezone: 'Europe/Paris',
      weatherEnabled: true,
      latitude: 48.85,
      longitude: 2.35,
    })
    expect(await run({ _tag: 'User', userId: 'alex' }, [user])).toEqual({
      timezone: 'Europe/Paris',
      weather: { enabled: true, latitude: 48.85, longitude: 2.35 },
    })
  })

  it('keeps weather off for a user who turned it off, even with a location', async () => {
    const user = createTestUser({
      id: 'alex',
      timezone: 'Europe/Paris',
      weatherEnabled: false,
      latitude: 48.85,
      longitude: 2.35,
    })
    const context = await run({ _tag: 'User', userId: 'alex' }, [user])
    expect(context.weather.enabled).toBe(false)
  })

  it('takes the Canopy timezone and location, not the acting member', async () => {
    const canopy = createTestCanopyRow({
      id: mockCanopyId,
      timezone: 'Pacific/Auckland',
      latitude: -36.85,
      longitude: 174.76,
    })
    const member = createTestUser({ id: 'lily', timezone: 'Europe/Paris' })
    expect(
      await run({ _tag: 'Canopy', canopyId: mockCanopyId }, [member], [canopy])
    ).toEqual({
      timezone: 'Pacific/Auckland',
      weather: { enabled: true, latitude: -36.85, longitude: 174.76 },
    })
  })

  it('keeps weather off for a Canopy without a location', async () => {
    const canopy = createTestCanopyRow({
      id: mockCanopyId,
      timezone: 'Pacific/Auckland',
    })
    const context = await run(
      { _tag: 'Canopy', canopyId: mockCanopyId },
      [],
      [canopy]
    )
    expect(context.weather.enabled).toBe(false)
    expect(context.timezone).toBe('Pacific/Auckland')
  })

  it('falls back to UTC with weather off when the owner row is gone', async () => {
    expect(await run({ _tag: 'Canopy', canopyId: mockCanopyId })).toEqual({
      timezone: 'UTC',
      weather: { enabled: false, latitude: null, longitude: null },
    })
  })
})

describe('actorDayTimezone', () => {
  const newYorker = createTestUser({ id: 'lily', timezone: 'America/New_York' })
  const runFor = (owner: PlantOwner) =>
    Effect.runPromise(
      actorDayTimezone(owner, 'lily').pipe(
        Effect.provide(
          Layer.mergeAll(
            createMockUserRepository([newYorker]),
            createMockCanopyRepository(
              createCanopyStore({
                canopies: [
                  createTestCanopyRow({
                    id: mockCanopyId,
                    timezone: 'Europe/Paris',
                  }),
                ],
              })
            )
          )
        )
      )
    )

  it('uses the Canopy zone for a Canopy plant, whoever acts', async () => {
    expect(await runFor({ _tag: 'Canopy', canopyId: mockCanopyId })).toBe(
      'Europe/Paris'
    )
  })

  it('uses the acting user zone for a personal plant, as before Canopies', async () => {
    expect(await runFor({ _tag: 'User', userId: 'alex' })).toBe(
      'America/New_York'
    )
  })
})
