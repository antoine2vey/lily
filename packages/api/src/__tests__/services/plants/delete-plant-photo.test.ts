import { failureOf } from '@lily/api/__tests__/fixtures/exit'
import { mockPlants } from '@lily/api/__tests__/fixtures/plants'
import { permitTo } from '@lily/api/__tests__/mocks/care'
import { createMockGCSService } from '@lily/api/__tests__/mocks/gcs.service'
import { createMockPlantRepository } from '@lily/api/__tests__/mocks/plant.repository'
import { MockSqlClientLive } from '@lily/api/__tests__/mocks/sql-client'
import { createMockStoredRefRepository } from '@lily/api/__tests__/mocks/stored-ref.repository'
import type { RecordPermit } from '@lily/api/kernel/permit'
import { PlantRepository } from '@lily/api/repositories/plant.repository'
import { deletePlantPhoto } from '@lily/api/services/plants/endpoints/delete-plant-photo'
import { PlantNotAuthorizedError } from '@lily/shared/errors/plant'
import { Array, Effect, Layer } from 'effect'
import { describe, expect, it } from 'vitest'

const photo = (id: string, uploadedByUserId: string | null) => ({
  id,
  url: `https://example.com/${id}.jpg`,
  takenAt: new Date('2024-01-05'),
  plantId: 'plant-1',
  uploadedByUserId,
})

describe('deletePlantPhoto', () => {
  const deleting = (permit: RecordPermit<'photo'>, photoId: string) =>
    Effect.runPromise(
      Effect.gen(function* () {
        const exit = yield* Effect.exit(deletePlantPhoto(permit, photoId))
        const repo = yield* PlantRepository
        const left = yield* repo.findPhotos({ plantId: 'plant-1' })
        return { exit, left: Array.map(left.items, (p) => p.id) }
      }).pipe(
        Effect.provide(
          Layer.mergeAll(
            createMockPlantRepository({
              plants: mockPlants,
              photos: [
                photo('mine', 'user-1'),
                photo('theirs', 'user-2'),
                photo('unknown', null),
              ],
            }),
            createMockGCSService(),
            createMockStoredRefRepository(),
            MockSqlClientLive
          )
        )
      )
    )

  it('deletes the photo its actor uploaded and no other', async () => {
    const { exit, left } = await deleting(permitTo('photo', 'plant-1'), 'mine')

    expect(exit._tag).toBe('Success')
    expect(left).toEqual(['theirs', 'unknown'])
  })

  it.each(['theirs', 'unknown'])(
    'refuses a photo permit on the photo %s and keeps it',
    async (photoId) => {
      const { exit, left } = await deleting(
        permitTo('photo', 'plant-1'),
        photoId
      )

      expect(failureOf(exit)).toBeInstanceOf(PlantNotAuthorizedError)
      expect(left).toEqual(['mine', 'theirs', 'unknown'])
    }
  )

  it.each(['theirs', 'unknown'])(
    'deletes the photo %s under a curate permit',
    async (photoId) => {
      const { exit, left } = await deleting(
        permitTo('curate', 'plant-1'),
        photoId
      )

      expect(exit._tag).toBe('Success')
      expect(left).not.toContain(photoId)
      expect(left).toHaveLength(2)
    }
  )

  it('leaves every photo alone when the plant has no such photo', async () => {
    const { exit, left } = await deleting(
      permitTo('photo', 'plant-1'),
      'missing'
    )

    expect(exit._tag).toBe('Success')
    expect(left).toEqual(['mine', 'theirs', 'unknown'])
  })
})
