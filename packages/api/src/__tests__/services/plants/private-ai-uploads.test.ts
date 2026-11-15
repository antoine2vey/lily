import { createMockAiService } from '@lily/api/__tests__/mocks/ai.service'
import { createMockEventBus } from '@lily/api/__tests__/mocks/event-bus'
import { createMockFileService } from '@lily/api/__tests__/mocks/file.service'
import { createMockFileSystem } from '@lily/api/__tests__/mocks/file-system'
import { createInMemoryGCS } from '@lily/api/__tests__/mocks/gcs.service'
import { MockLimitCheckerLive } from '@lily/api/__tests__/mocks/limit-checker'
import { createMockRareIdentificationRepository } from '@lily/api/__tests__/mocks/rare-identification.repository'
import { createMockScanRepository } from '@lily/api/__tests__/mocks/scan.repository'
import { createMockCurrentUser } from '@lily/api/__tests__/mocks/session'
import { MockUsageTrackerLive } from '@lily/api/__tests__/mocks/usage-tracker'
import { aiIdentify } from '@lily/api/services/plants/endpoints/ai-identify'
import { detect } from '@lily/api/services/plants/endpoints/detect'
import { scanCard } from '@lily/api/services/plants/endpoints/scan-card'
import { scanCardMultiple } from '@lily/api/services/plants/endpoints/scan-card-multiple'
import { Effect, Layer } from 'effect'
import type { PersistedFile } from 'effect/http/Multipart'
import { describe, expect, it } from 'vitest'

const photo = {
  _tag: 'PersistedFile',
  key: 'images',
  name: 'photo.png',
  contentType: 'image/png',
  path: '/tmp/photo.png',
} as unknown as PersistedFile

describe('photos sent only for an AI answer', () => {
  it.each([
    ['identify', 'identify', () => aiIdentify([photo], 'en')],
    ['detect', 'detect', () => detect([photo], 'en')],
    ['scan-card', 'scan-card', () => scanCard([photo], 'en')],
    ['scan-card-multiple', 'scan-card', () => scanCardMultiple([photo], 'en')],
  ] as const)(
    '%s stores its photo in the private bucket under the caller',
    async (_endpoint, folder, call) => {
      const gcs = createInMemoryGCS()

      const result = await Effect.runPromise(
        call().pipe(
          Effect.provide(
            Layer.mergeAll(
              createMockAiService(),
              gcs.layer,
              createMockFileService(),
              createMockFileSystem(),
              createMockEventBus(),
              createMockCurrentUser({ id: 'user-1' }),
              createMockScanRepository(),
              createMockRareIdentificationRepository(),
              MockLimitCheckerLive,
              MockUsageTrackerLive
            )
          )
        )
      )

      expect({
        public: [...gcs.objects.plant],
        private: [...gcs.objects.ai].map((key) =>
          key.replace(/[0-9a-f-]{36}/, '<uuid>')
        ),
      }).toEqual({
        public: [],
        private: [`users/user-1/${folder}/<uuid>.png`],
      })
      expect(result.imageUrl).toContain('/mock-private-bucket/users/user-1/')
    }
  )
})
