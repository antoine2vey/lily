import { carePermit, createStubCare } from '@lily/api/__tests__/mocks/care'
import { createMockGCSService } from '@lily/api/__tests__/mocks/gcs.service'
import { MockOutboxLive } from '@lily/api/__tests__/mocks/outbox'
import { MockSqlClientLive } from '@lily/api/__tests__/mocks/sql-client'
import { createMockStoredRefRepository } from '@lily/api/__tests__/mocks/stored-ref.repository'
import { deleteCareLog } from '@lily/api/services/care-logs/endpoints/delete-care-log'
import { Effect, Layer } from 'effect'
import { describe, expect, it } from 'vitest'

describe('deleteCareLog', () => {
  it('removes the care of the permitted plant and confirms it', async () => {
    const care = createStubCare()
    const permit = carePermit('plant-1')

    const result = await Effect.runPromise(
      deleteCareLog(permit, 'log-1').pipe(
        Effect.provide(
          Layer.mergeAll(
            care.layer,
            createMockGCSService(),
            createMockStoredRefRepository(),
            MockSqlClientLive,
            MockOutboxLive
          )
        )
      )
    )

    expect(care.removed).toEqual([{ permit, careLogId: 'log-1' }])
    expect(result).toEqual({ message: 'Care log log-1 deleted successfully' })
  })
})
