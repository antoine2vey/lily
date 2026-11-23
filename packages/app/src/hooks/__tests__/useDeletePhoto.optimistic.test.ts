import { QueryClient } from '@tanstack/react-query'
import { act, renderHook } from '@testing-library/react-native'
import { Result } from 'effect'
import { mockPlants } from '@/__tests__/fixtures'
import { ok, stubApi } from '@/__tests__/utils/fake-api'
import { createQueryWrapper } from '@/__tests__/utils/query-helpers'
import { plantDetailKey, plantPhotosKey } from '@/utils/plant-cache'
import { useDeletePhoto } from '../useDeletePhoto'

const photo = (id: string) => ({
  id,
  url: `https://example.com/${id}.jpg`,
  takenAt: new Date('2025-01-01T00:00:00Z'),
  plantId: 'plant-1',
})

const PLANT_ID = '6f1c2a3b-4d5e-4f60-8a7b-9c0d1e2f3a4b'
const PHOTO_ID = '0d9e8f7a-6b5c-4d3e-8f2a-1b0c9d8e7f6a'

// gcTime: Infinity so observer-less cache entries survive long enough to assert.
const makeClient = () =>
  new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: Number.POSITIVE_INFINITY },
      mutations: { retry: false, gcTime: 0 },
    },
  })

const seed = (client: QueryClient) => {
  client.setQueryData(
    plantDetailKey(PLANT_ID),
    Result.succeed({
      ...mockPlants[0]!,
      id: PLANT_ID,
      photos: [photo(PHOTO_ID), photo('b')],
    })
  )
  client.setQueryData(
    plantPhotosKey(PLANT_ID),
    Result.succeed({
      items: [photo(PHOTO_ID), photo('b')],
      total: 2,
      page: 1,
      limit: 100,
      hasMore: false,
    })
  )
}

const detailIds = (client: QueryClient) =>
  Result.getOrThrow(
    client.getQueryData(plantDetailKey(PLANT_ID)) as Result.Result<
      { photos: Array<{ id: string }> },
      unknown
    >
  ).photos.map((p) => p.id)

const listIds = (client: QueryClient) =>
  Result.getOrThrow(
    client.getQueryData(plantPhotosKey(PLANT_ID)) as Result.Result<
      { items: Array<{ id: string }> },
      unknown
    >
  ).items.map((p) => p.id)

describe('useDeletePhoto optimistic lifecycle', () => {
  it('deletes the photo on the server and keeps it out of both caches', async () => {
    const api = stubApi(({ method, path }) =>
      method === 'DELETE' && path === `/plants/${PLANT_ID}/photos/${PHOTO_ID}`
        ? ok()
        : undefined
    )
    const client = makeClient()
    seed(client)

    const { result } = renderHook(() => useDeletePhoto(), {
      wrapper: createQueryWrapper(client),
    })

    await act(async () => {
      await result.current.mutateAsync({
        params: { id: PLANT_ID, photoId: PHOTO_ID },
      })
    })

    expect(api.sent).toEqual([
      expect.objectContaining({
        method: 'DELETE',
        path: `/plants/${PLANT_ID}/photos/${PHOTO_ID}`,
      }),
    ])
    expect(detailIds(client)).toEqual(['b'])
    expect(listIds(client)).toEqual(['b'])
  })

  it('rolls back both caches when the API refuses the delete', async () => {
    stubApi(() => ({ status: 404, body: { _tag: 'PlantNotFoundError' } }))
    const client = makeClient()
    seed(client)

    const { result } = renderHook(() => useDeletePhoto(), {
      wrapper: createQueryWrapper(client),
    })

    await act(async () => {
      await expect(
        result.current.mutateAsync({
          params: { id: PLANT_ID, photoId: PHOTO_ID },
        })
      ).rejects.toMatchObject({ _tag: 'PlantNotFoundError' })
    })

    expect(detailIds(client)).toEqual([PHOTO_ID, 'b'])
    expect(listIds(client)).toEqual([PHOTO_ID, 'b'])
  })
})
