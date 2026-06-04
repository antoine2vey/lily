import { QueryClient } from '@tanstack/react-query'
import { act, renderHook } from '@testing-library/react-native'
import { Either } from 'effect'
import { createQueryWrapper } from '@/__tests__/utils/query-helpers'
import { plantDetailKey, plantPhotosKey } from '@/utils/plant-cache'

// Controls the Either the (mocked) delete mutation resolves with. Must be
// `mock`-prefixed to be referenceable inside the hoisted jest.mock factory.
let mockResult: unknown = Either.right(undefined)

// Delegate useEffectMutation to a REAL useMutation whose mutationFn resolves
// our controllable Either — so the hook's onMutate/onSuccess/onError/onSettled
// run for real. This mirrors the production client, whose mutationFn resolves
// (never rejects) with an Either.
jest.mock('@/utils/client', () => {
  const actual = jest.requireActual('@/utils/client')
  const rq = jest.requireActual('@tanstack/react-query')
  return {
    ...actual,
    useEffectMutation: (_section: string, _method: string, options: object) =>
      rq.useMutation({
        mutationFn: async () => mockResult,
        ...options,
      }),
  }
})

import { useDeletePhoto } from '../useDeletePhoto'

const photo = (id: string) => ({
  id,
  url: `https://example.com/${id}.jpg`,
  takenAt: new Date('2025-01-01T00:00:00Z'),
  plantId: 'plant-1',
})

const PLANT_ID = 'plant-1'

// gcTime: Infinity so observer-less cache entries survive long enough to assert.
const makeClient = () =>
  new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: Number.POSITIVE_INFINITY },
      mutations: { retry: false },
    },
  })

const seed = (client: QueryClient) => {
  client.setQueryData(
    plantDetailKey(PLANT_ID),
    Either.right({ id: PLANT_ID, photos: [photo('a'), photo('b')] })
  )
  client.setQueryData(
    plantPhotosKey(PLANT_ID),
    Either.right({
      items: [photo('a'), photo('b')],
      total: 2,
      page: 1,
      limit: 100,
      hasMore: false,
    })
  )
}

const detailIds = (client: QueryClient) =>
  Either.getOrThrow(
    client.getQueryData(plantDetailKey(PLANT_ID)) as Either.Either<
      { photos: Array<{ id: string }> },
      unknown
    >
  ).photos.map((p) => p.id)

const listIds = (client: QueryClient) =>
  Either.getOrThrow(
    client.getQueryData(plantPhotosKey(PLANT_ID)) as Either.Either<
      { items: Array<{ id: string }> },
      unknown
    >
  ).items.map((p) => p.id)

describe('useDeletePhoto optimistic lifecycle', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('removes the photo from both caches and keeps it removed on success', async () => {
    mockResult = Either.right(undefined)
    const client = makeClient()
    seed(client)

    const { result } = renderHook(() => useDeletePhoto(), {
      wrapper: createQueryWrapper(client),
    })

    await act(async () => {
      await result.current.mutateAsync({
        path: { id: PLANT_ID, photoId: 'a' },
      })
    })

    expect(detailIds(client)).toEqual(['b'])
    expect(listIds(client)).toEqual(['b'])
  })

  it('rolls back both caches when the API resolves a typed Left failure', async () => {
    // A typed failure resolves as Either.left — it does NOT throw, so the fix
    // must roll back from onSuccess (not onError).
    mockResult = Either.left({ _tag: 'PlantNotFoundError' })
    const client = makeClient()
    seed(client)

    const { result } = renderHook(() => useDeletePhoto(), {
      wrapper: createQueryWrapper(client),
    })

    await act(async () => {
      await result.current.mutateAsync({
        path: { id: PLANT_ID, photoId: 'a' },
      })
    })

    // Optimistically removed in onMutate, then restored once the Left resolves.
    expect(detailIds(client)).toEqual(['a', 'b'])
    expect(listIds(client)).toEqual(['a', 'b'])
  })
})
