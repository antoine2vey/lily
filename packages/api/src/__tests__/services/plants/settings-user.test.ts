import { mockCanopyId } from '@lily/api/__tests__/fixtures/canopies'
import { createMockCurrentUser } from '@lily/api/__tests__/mocks/session'
import { interimSettingsUserFor } from '@lily/api/services/plants/helpers/settings-user'
import { Effect } from 'effect'
import { describe, expect, it } from 'vitest'

const asCaretaker = createMockCurrentUser({ id: 'user-caretaker' })

describe('interimSettingsUserFor', () => {
  it('uses the owner for a personal plant, even when a caretaker acts', async () => {
    const userId = await Effect.runPromise(
      interimSettingsUserFor({ _tag: 'User', userId: 'user-owner' }).pipe(
        Effect.provide(asCaretaker)
      )
    )
    expect(userId).toBe('user-owner')
  })

  it('uses the acting member for a Canopy plant', async () => {
    const userId = await Effect.runPromise(
      interimSettingsUserFor({ _tag: 'Canopy', canopyId: mockCanopyId }).pipe(
        Effect.provide(asCaretaker)
      )
    )
    expect(userId).toBe('user-caretaker')
  })
})
