import {
  createInMemoryGCS,
  mockPublicUrl,
} from '@lily/api/__tests__/mocks/gcs.service'
import {
  Holder,
  releaseObjects,
} from '@lily/api/services/helpers/release-objects'
import { Effect, Logger, References } from 'effect'
import { describe, expect, it } from 'vitest'

const FERN = '0b7e5a52-3c8f-4d0e-9a51-6f2d1c4b8e90'
const ALEX = '9f8e7d6c-5b4a-4321-8fed-cba987654321'
const PHOTO = `plants/${FERN}/photo.jpg`
const LEAF = `users/${ALEX}/chat/c1/leaf.jpg`

const tooLongToRead = (text: string) =>
  `https://cdn.example/${text}/${'a'.repeat(2100)}.jpg`

const release = (kept: ReadonlyArray<string>) => {
  const gcs = createInMemoryGCS()
  gcs.objects.plant.add(PHOTO)
  gcs.objects.ai.add(LEAF)
  const warnings: { message: unknown; annotations: unknown }[] = []
  const capture = Logger.make(({ logLevel, message, fiber }) => {
    if (logLevel === 'Warn') {
      warnings.push({
        message,
        annotations: fiber.getRef(References.CurrentLogAnnotations),
      })
    }
  })
  return Effect.runPromise(
    releaseObjects({
      scopes: [],
      dropped: [
        { holder: Holder.Plant({ plantId: FERN }), ref: mockPublicUrl(PHOTO) },
        { holder: Holder.Chat({ userId: ALEX }), ref: LEAF },
      ],
      kept,
    }).pipe(Effect.provide([gcs.layer, Logger.layer([capture])]))
  ).then(() => ({
    plant: [...gcs.objects.plant],
    ai: [...gcs.objects.ai],
    warnings,
  }))
}

describe('releaseObjects', () => {
  it('keeps what a reference too long to read may name, and says so', async () => {
    expect(await release([tooLongToRead(FERN)])).toEqual({
      plant: [PHOTO],
      ai: [],
      warnings: [
        {
          message: [
            'Kept released objects that a reference too long to read may name',
          ],
          annotations: { unreadable: 1, objects: [`plant:${PHOTO}`] },
        },
      ],
    })
  })

  it('keeps every object when a reference too long to read holds a disguise', async () => {
    const { plant, ai } = await release([tooLongToRead(`${FERN} pic`)])

    expect({ plant, ai }).toEqual({ plant: [PHOTO], ai: [LEAF] })
  })

  it('deletes what no kept reference names, and warns of nothing', async () => {
    expect(await release([mockPublicUrl(`plants/${FERN}/other.jpg`)])).toEqual({
      plant: [],
      ai: [],
      warnings: [],
    })
  })
})
