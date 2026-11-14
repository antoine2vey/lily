import { carePermit, createStubCare } from '@lily/api/__tests__/mocks/care'
import { deleteCareLog } from '@lily/api/services/care-logs/endpoints/delete-care-log'
import { Effect } from 'effect'
import { describe, expect, it } from 'vitest'

describe('deleteCareLog', () => {
  it('removes the care of the permitted plant and confirms it', async () => {
    const care = createStubCare()
    const permit = carePermit('plant-1')

    const result = await Effect.runPromise(
      deleteCareLog(permit, 'log-1').pipe(Effect.provide(care.layer))
    )

    expect(care.removed).toEqual([{ permit, careLogId: 'log-1' }])
    expect(result).toEqual({ message: 'Care log log-1 deleted successfully' })
  })
})
