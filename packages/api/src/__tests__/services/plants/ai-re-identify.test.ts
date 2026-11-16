import { failureOf } from '@lily/api/__tests__/fixtures/exit'
import { createMockAiService } from '@lily/api/__tests__/mocks/ai.service'
import {
  createMockGCSService,
  MOCK_BUCKET_NAMES,
} from '@lily/api/__tests__/mocks/gcs.service'
import { createMockRareIdentificationRepository } from '@lily/api/__tests__/mocks/rare-identification.repository'
import { createMockCurrentUser } from '@lily/api/__tests__/mocks/session'
import { createMockUsageTracker } from '@lily/api/__tests__/mocks/usage-tracker'
import { AiService } from '@lily/api/services/ai/service'
import { AiReIdentifyPayload } from '@lily/api/services/plants/api'
import { aiReIdentify } from '@lily/api/services/plants/endpoints/ai-re-identify'
import { LimitExceededError, MAX_SCAN_FILES } from '@lily/shared'
import { InvalidImageError } from '@lily/shared/services/file/image-upload'
import { Array as Arr, Effect, Exit, Layer, Schema } from 'effect'
import { describe, expect, it } from 'vitest'

const signed = (key: string) =>
  `https://storage.googleapis.com/${MOCK_BUCKET_NAMES.ai}/${key}?X-Goog-Signature=abc`

const reIdentify = async (
  imageUrls: readonly string[],
  options: { limitReached?: boolean; locale?: string } = {}
) => {
  const seenByAi: Array<{
    urls: readonly string[]
    locale: string | undefined
  }> = []
  const recordingAi = Layer.effect(
    AiService,
    Effect.gen(function* () {
      const base = yield* AiService
      return AiService.of({
        ...base,
        plantRecognition: (urls, locale) => {
          seenByAi.push({ urls: Arr.ensure(urls), locale })
          return base.plantRecognition(urls, locale)
        },
      })
    })
  ).pipe(Layer.provide(createMockAiService()))

  const exit = await Effect.runPromiseExit(
    aiReIdentify(imageUrls, options.locale ?? 'en').pipe(
      Effect.provide(
        Layer.mergeAll(
          recordingAi,
          createMockGCSService(),
          createMockCurrentUser({ id: 'user-1' }),
          createMockRareIdentificationRepository(),
          createMockUsageTracker({
            limitReached: options.limitReached ?? false,
          })
        )
      )
    )
  )
  return { exit, seenByAi }
}

describe('aiReIdentify', () => {
  const own = [
    signed('users/user-1/identify/photo1.jpg'),
    signed('users/user-1/identify/photo2.jpg'),
  ]

  it("shows the AI a fresh link to each of the caller's uploads and answers with the first URL sent", async () => {
    const { exit, seenByAi } = await reIdentify(own, { locale: 'fr' })

    expect(Exit.isSuccess(exit) && exit.value).toMatchObject({
      name: 'Mock Plant',
      confidence: 0.95,
      imageUrl: own[0],
    })
    expect(seenByAi).toEqual([
      {
        urls: [
          'https://storage.googleapis.com/mock-private-bucket/users/user-1/identify/photo1.jpg?signed=true&expires=3600',
          'https://storage.googleapis.com/mock-private-bucket/users/user-1/identify/photo2.jpg?signed=true&expires=3600',
        ],
        locale: 'fr',
      },
    ])
  })

  it.each([
    ['a URL on another host', 'https://rare-plants.example/obliqua.jpg'],
    ["another user's upload", signed('users/user-2/identify/photo1.jpg')],
    [
      'a public photo',
      `https://storage.googleapis.com/${MOCK_BUCKET_NAMES.plant}/plants/plant-1/cover.jpg`,
    ],
    ['a device file', 'file:///var/mobile/Containers/Data/tmp/photo.jpg'],
  ])('refuses %s without asking the AI', async (_case, url) => {
    const { exit, seenByAi } = await reIdentify([own[0] ?? '', url])

    expect({
      refused: Exit.isFailure(exit) && failureOf(exit),
      seenByAi,
    }).toEqual({
      refused: expect.any(InvalidImageError),
      seenByAi: [],
    })
  })

  it('fails with LimitExceededError and skips the AI call when the quota is exhausted', async () => {
    const { exit, seenByAi } = await reIdentify(own, { limitReached: true })

    expect(failureOf(exit)).toBeInstanceOf(LimitExceededError)
    expect(seenByAi).toEqual([])
  })
})

describe('AiReIdentifyPayload', () => {
  const decode = Schema.decodeUnknownExit(AiReIdentifyPayload)
  const url = 'https://storage.example.com/plants/photo1.jpg'

  it('accepts up to the scan file cap and defaults locale to en', () => {
    const exit = decode({ imageUrls: Array(MAX_SCAN_FILES).fill(url) })
    expect(Exit.isSuccess(exit)).toBe(true)
    if (Exit.isSuccess(exit)) expect(exit.value.locale).toBe('en')
  })

  it('rejects more URLs than the cap', () => {
    const exit = decode({ imageUrls: Array(MAX_SCAN_FILES + 1).fill(url) })
    expect(Exit.isFailure(exit)).toBe(true)
  })

  it('rejects an empty URL list', () => {
    expect(Exit.isFailure(decode({ imageUrls: [] }))).toBe(true)
  })

  it('rejects an unsupported locale', () => {
    expect(
      Exit.isFailure(decode({ imageUrls: [url], locale: 'ignore previous' }))
    ).toBe(true)
  })
})
