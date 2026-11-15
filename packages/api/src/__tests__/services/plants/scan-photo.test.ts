import { mockPlants } from '@lily/api/__tests__/fixtures/plants'
import {
  createInMemoryGCS,
  mockPublicUrl,
} from '@lily/api/__tests__/mocks/gcs.service'
import { createMockPlantRepository } from '@lily/api/__tests__/mocks/plant.repository'
import { createMockCurrentUser } from '@lily/api/__tests__/mocks/session'
import { PlantRepository } from '@lily/api/repositories/plant.repository'
import { withScanPhoto } from '@lily/api/services/plants/helpers/scan-photo'
import type { EnhancedPlantCreateRequest, Plant } from '@lily/shared/plant'
import { Effect, Layer } from 'effect'
import { describe, expect, it } from 'vitest'

const signed = (key: string) =>
  `https://storage.googleapis.com/mock-private-bucket/${key}?signed=true`

const request = (imageUrl: string): EnhancedPlantCreateRequest =>
  ({
    name: 'Fern',
    wateringFrequencyDays: 7,
    imageUrl,
  }) as EnhancedPlantCreateRequest

const [mockPlant1] = mockPlants
if (!mockPlant1) throw new Error('no plant fixture')
const created = { ...mockPlant1, imageUrl: null } as unknown as Plant

const createFrom = async (
  imageUrl: string,
  privateObjects: readonly string[]
) => {
  const gcs = createInMemoryGCS()
  for (const key of privateObjects) gcs.objects.ai.add(key)
  const asked: EnhancedPlantCreateRequest[] = []

  const plants = createMockPlantRepository({ plants: [mockPlant1] })
  const { plant, saved } = await Effect.runPromise(
    Effect.gen(function* () {
      const plant = yield* withScanPhoto(request(imageUrl), (asking) => {
        asked.push(asking)
        return Effect.succeed({
          ...created,
          imageUrl: asking.imageUrl ?? null,
        })
      })
      const repo = yield* PlantRepository
      const row = yield* repo.findById(created.id)
      return { plant, saved: row?.imageUrl ?? null }
    }).pipe(
      Effect.provide(
        Layer.mergeAll(
          gcs.layer,
          plants,
          createMockCurrentUser({ id: 'user-1' })
        )
      )
    )
  )

  return {
    askedFor: asked.map((asking) => asking.imageUrl),
    answered: plant.imageUrl,
    saved,
    published: [...gcs.objects.plant],
  }
}

describe('withScanPhoto', () => {
  it("gives the plant a public copy of the caller's scan photo", async () => {
    const key = 'users/user-1/detect/scan.png'

    const result = await createFrom(signed(key), [key])

    expect(result.published).toHaveLength(1)
    expect(result.published[0]).toMatch(
      new RegExp(`^plants/${created.id}/[0-9a-f-]{36}\\.png$`)
    )
    const publicUrl = mockPublicUrl(result.published[0] ?? '')
    expect(result).toMatchObject({
      askedFor: [undefined],
      answered: publicUrl,
      saved: publicUrl,
    })
  })

  it.each([
    ["another user's scan photo", 'users/user-2/detect/scan.png'],
    ['a private photo from before scopes', '1700-scan-card/scan.png'],
  ])('creates the plant without an image for %s', async (_case, key) => {
    const result = await createFrom(signed(key), [key])

    expect(result).toMatchObject({
      askedFor: [undefined],
      answered: null,
      published: [],
    })
  })

  it('leaves a public URL as the request gave it', async () => {
    const url = mockPublicUrl('1700-detect/scan.png')

    const result = await createFrom(url, [])

    expect(result).toMatchObject({
      askedFor: [url],
      answered: url,
      published: [],
    })
  })

  it('creates the plant without an image when the copy fails', async () => {
    const result = await createFrom(signed('users/user-1/detect/gone.png'), [])

    expect(result).toMatchObject({
      askedFor: [undefined],
      answered: null,
      published: [],
    })
  })
})
