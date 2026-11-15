import { createMockAccountPhotoRepository } from '@lily/api/__tests__/mocks/account-photo.repository'
import {
  createInMemoryGCS,
  mockPublicUrl,
} from '@lily/api/__tests__/mocks/gcs.service'
import {
  type AccountPhotoRefs,
  AccountPhotoRepository,
} from '@lily/api/repositories/account-photo.repository'
import { eraseAccountPhotos } from '@lily/api/services/user/helpers/erase-account-photos'
import { GCSService } from '@lily/shared/services/file/gcs'
import { Cause, Effect, Exit, Fiber, Layer } from 'effect'
import { TestClock } from 'effect/testing'
import { describe, expect, it } from 'vitest'

const stored = (
  gcs: ReturnType<typeof createInMemoryGCS>,
  objects: { plant?: string[]; ai?: string[] }
) => {
  for (const key of objects.plant ?? []) gcs.objects.plant.add(key)
  for (const key of objects.ai ?? []) gcs.objects.ai.add(key)
}

const left = (gcs: ReturnType<typeof createInMemoryGCS>) => ({
  plant: [...gcs.objects.plant].sort(),
  ai: [...gcs.objects.ai].sort(),
})

const erase = (
  gcs: ReturnType<typeof createInMemoryGCS>,
  refs: Partial<AccountPhotoRefs>,
  shownByOtherPlants: readonly string[] = []
) =>
  Effect.runPromiseExit(
    eraseAccountPhotos('alex').pipe(
      Effect.provide(
        Layer.mergeAll(
          gcs.layer,
          Layer.effect(
            AccountPhotoRepository,
            Effect.map(AccountPhotoRepository, (repo) => ({
              ...repo,
              findRefsOutside: () => Effect.succeed(shownByOtherPlants),
            }))
          ).pipe(
            Layer.provide(
              createMockAccountPhotoRepository({
                plantIds: [],
                uploaded: [],
                claimed: [],
                ...refs,
              })
            )
          )
        )
      )
    )
  )

describe('eraseAccountPhotos', () => {
  it('empties the scope of the user and of each of their plants in both buckets', async () => {
    const gcs = createInMemoryGCS()
    stored(gcs, {
      plant: [
        'users/alex/avatars/a.png',
        'plants/fern/a.png',
        'plants/fern/replaced.png',
        'users/sam/avatars/a.png',
        'plants/shared-ficus/a.png',
      ],
      ai: [
        'users/alex/detect/a.png',
        'users/alex/chat/c1/a.png',
        'users/sam/detect/a.png',
      ],
    })

    const exit = await erase(gcs, { plantIds: ['fern'] })

    expect(Exit.isSuccess(exit)).toBe(true)
    expect(left(gcs)).toEqual({
      plant: ['plants/shared-ficus/a.png', 'users/sam/avatars/a.png'],
      ai: ['users/sam/detect/a.png'],
    })
  })

  it('deletes the older keys that the rows of the account point at', async () => {
    const gcs = createInMemoryGCS()
    stored(gcs, {
      plant: [
        '1700-avatars/alex/a.png',
        '1700-plants/fern/a.png',
        '1700-detect/scan.png',
        '1699-IMG_0042.jpg',
        '1700-detect/somebody-else.png',
      ],
      ai: ['1700-chat/c1/a.png', '1700-scan-card/unreferenced.png'],
    })

    const exit = await erase(gcs, {
      plantIds: ['fern'],
      uploaded: [mockPublicUrl('1700-plants/fern/a.png'), '1700-chat/c1/a.png'],
      claimed: [
        mockPublicUrl('1700-avatars/alex/a.png'),
        mockPublicUrl('1700-detect/scan.png'),
        mockPublicUrl('1699-IMG_0042.jpg'),
      ],
    })

    expect(Exit.isSuccess(exit)).toBe(true)
    expect(left(gcs)).toEqual({
      plant: ['1700-detect/somebody-else.png'],
      ai: ['1700-scan-card/unreferenced.png'],
    })
  })

  it('keeps an object that the account only claims in a column the client writes', async () => {
    const gcs = createInMemoryGCS()
    const theirs = [
      '1700-avatars/sam/a.png',
      '1700-plants/sams-ficus/a.png',
      '1700-detect/sams-scan.png',
      'users/sam/avatars/a.png',
      'plants/sams-ficus/a.png',
      'catalog/monstera.png',
    ]
    stored(gcs, { plant: theirs })

    const exit = await erase(
      gcs,
      {
        plantIds: ['fern'],
        claimed: [
          ...theirs.map(mockPublicUrl),
          'https://lh3.googleusercontent.com/a/oauth-avatar',
        ],
      },
      [mockPublicUrl('1700-detect/sams-scan.png')]
    )

    expect(Exit.isSuccess(exit)).toBe(true)
    expect(left(gcs).plant).toEqual([...theirs].sort())
  })

  it('fails when the bucket cannot be reached, and deletes on the next attempt', async () => {
    const gcs = createInMemoryGCS()
    stored(gcs, { plant: ['users/alex/avatars/a.png'] })
    gcs.outage.deletes = true

    const failed = await erase(gcs, {})

    expect(Exit.isFailure(failed)).toBe(true)
    expect(left(gcs).plant).toEqual(['users/alex/avatars/a.png'])

    gcs.outage.deletes = false
    await erase(gcs, {})
    const again = await erase(gcs, {})

    expect(Exit.isSuccess(again)).toBe(true)
    expect(left(gcs).plant).toEqual([])
  })

  it('gives up with a GCSDeleteError when storage hangs for 2 minutes', async () => {
    const hanging = Layer.effect(
      GCSService,
      Effect.map(GCSService, (service) => ({
        ...service,
        deleteScope: () => Effect.never,
      }))
    ).pipe(Layer.provide(createInMemoryGCS().layer))

    const exit = await Effect.runPromise(
      Effect.gen(function* () {
        const fiber = yield* Effect.forkChild(
          Effect.exit(eraseAccountPhotos('alex'))
        )
        yield* TestClock.adjust('119 seconds')
        const before = fiber.pollUnsafe()
        yield* TestClock.adjust('2 seconds')
        return { before, exit: yield* Fiber.join(fiber) }
      }).pipe(
        Effect.provide(
          Layer.mergeAll(
            hanging,
            createMockAccountPhotoRepository(),
            TestClock.layer()
          )
        )
      )
    )

    expect(exit.before).toBeUndefined()
    expect(
      Exit.isFailure(exit.exit) && Cause.squash(exit.exit.cause)
    ).toMatchObject({ _tag: 'GCSDeleteError' })
  })
})
