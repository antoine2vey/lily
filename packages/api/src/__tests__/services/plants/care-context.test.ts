import { mockCanopyId } from '@lily/api/__tests__/fixtures/canopies'
import { createTestUser } from '@lily/api/__tests__/fixtures/users'
import {
  createCanopyStore,
  createMockCanopyRepository,
  createTestCanopyRow,
} from '@lily/api/__tests__/mocks/canopy.repository'
import { createMockUserRepository } from '@lily/api/__tests__/mocks/user.repository'
import { actorDayTimezone } from '@lily/api/services/plants/helpers/care-context'
import type { PlantOwner } from '@lily/shared'
import { ZoneName } from '@lily/shared'
import { Effect, Layer } from 'effect'
import { describe, expect, it } from 'vitest'

describe('actorDayTimezone', () => {
  const newYorker = createTestUser({
    id: 'lily',
    timezone: ZoneName.make('America/New_York'),
  })
  const parisCanopy = createTestCanopyRow({
    id: mockCanopyId,
    timezone: ZoneName.make('Europe/Paris'),
  })
  const runFor = (
    owner: PlantOwner,
    users = [newYorker],
    canopies = [parisCanopy]
  ) =>
    Effect.runPromise(
      actorDayTimezone(owner, 'lily').pipe(
        Effect.provide(
          Layer.mergeAll(
            createMockUserRepository(users),
            createMockCanopyRepository(createCanopyStore({ canopies }))
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

  it('falls back to UTC when the Canopy row is gone', async () => {
    expect(
      await runFor({ _tag: 'Canopy', canopyId: mockCanopyId }, [], [])
    ).toBe('UTC')
  })

  it('falls back to UTC when the acting user row is gone', async () => {
    expect(await runFor({ _tag: 'User', userId: 'alex' }, [], [])).toBe('UTC')
  })
})
