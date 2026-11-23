import { act } from '@testing-library/react-native'
import { Result } from 'effect'
import { mockPlants } from '@/__tests__/fixtures'
import { ok, stubApi } from '@/__tests__/utils/fake-api'
import {
  createCacheTestQueryClient,
  renderQueryHook,
} from '@/__tests__/utils/query-helpers'
import { plantDetailKey, plantPhotosKey } from '@/utils/plant-cache'
import { useUploadPhoto } from '../useUploadPhoto'

const PLANT_ID = '6f1c2a3b-4d5e-4f60-8a7b-9c0d1e2f3a4b'

const photo = (id: string) => ({
  id,
  url: `https://example.com/${id}.jpg`,
  takenAt: new Date('2025-01-01T00:00:00Z'),
  plantId: PLANT_ID,
})

describe('useUploadPhoto', () => {
  it('uploads the picked photo and shows the stored one in both caches', async () => {
    const api = stubApi(() =>
      ok({
        photos: [{ ...photo('stored'), takenAt: '2026-11-20T09:00:00.000Z' }],
      })
    )
    const queryClient = createCacheTestQueryClient()
    queryClient.setQueryData(
      plantDetailKey(PLANT_ID),
      Result.succeed({
        ...mockPlants[0]!,
        id: PLANT_ID,
        photos: [photo('old')],
      })
    )
    queryClient.setQueryData(
      plantPhotosKey(PLANT_ID),
      Result.succeed({
        items: [photo('old')],
        total: 1,
        page: 1,
        limit: 100,
        hasMore: false,
      })
    )
    const { result } = renderQueryHook(() => useUploadPhoto(), { queryClient })

    await act(() =>
      result.current.mutateAsync({
        plantId: PLANT_ID,
        photoUri: 'file:///var/mobile/picked.jpg',
      })
    )

    expect(api.sent).toEqual([
      expect.objectContaining({
        method: 'POST',
        path: `/plants/${PLANT_ID}/photos`,
        body: [['files', 'file']],
      }),
    ])
    const urls = (photos: ReadonlyArray<{ url: string }>) =>
      photos.map((p) => p.url)
    expect(
      urls(
        Result.getOrThrow(queryClient.getQueryData(plantDetailKey(PLANT_ID))!)
          .photos
      )
    ).toEqual(['https://example.com/stored.jpg', 'https://example.com/old.jpg'])
    expect(
      urls(
        Result.getOrThrow(queryClient.getQueryData(plantPhotosKey(PLANT_ID))!)
          .items
      )
    ).toEqual(['https://example.com/stored.jpg', 'https://example.com/old.jpg'])
  })
})
