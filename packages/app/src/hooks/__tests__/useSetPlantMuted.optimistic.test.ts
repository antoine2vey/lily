import type { PlantDetail } from '@lily/shared'
import { act, renderHook, waitFor } from '@testing-library/react-native'
import { Result } from 'effect'
import { mockPlants } from '@/__tests__/fixtures'
import {
  createCacheTestQueryClient,
  createQueryWrapper,
} from '@/__tests__/utils/query-helpers'

// Stubbed at the network so the hook runs through the real API client.
const fetchMock = jest.spyOn(globalThis, 'fetch')
afterEach(() => fetchMock.mockReset())

import type { ApiResult } from '@/utils/client'
import { plantDetailKey } from '@/utils/plant-cache'
import { useSetPlantMuted } from '../usePlantCanopyActions'

// The API client rejects ids that are not UUIDs before sending a request.
const plantId = '3e5a7c9b-1d2f-4a6c-8e0b-2f4a6c8e0b88'

const plant: PlantDetail = {
  ...mockPlants[0]!,
  id: plantId,
  photos: [],
  muted: false,
}

const seed = () => {
  const client = createCacheTestQueryClient()
  client.setQueryData(plantDetailKey(plantId), Result.succeed(plant))
  return client
}

const cachedPlant = (client: ReturnType<typeof seed>) =>
  Result.getOrThrow(
    client.getQueryData(plantDetailKey(plantId)) as ApiResult<PlantDetail>
  )

describe('useSetPlantMuted optimistic update', () => {
  it('shows the plant muted before the API answers', () => {
    fetchMock.mockReturnValue(new Promise(() => {}))
    const client = seed()
    const { result } = renderHook(useSetPlantMuted, {
      wrapper: createQueryWrapper(client),
    })

    act(() => result.current.mutate({ plantId, muted: true }))

    expect(cachedPlant(client).muted).toBe(true)
  })

  it('restores the plant when the API fails', async () => {
    fetchMock.mockRejectedValue(new TypeError('Network request failed'))
    const client = seed()
    const { result } = renderHook(useSetPlantMuted, {
      wrapper: createQueryWrapper(client),
    })

    act(() => result.current.mutate({ plantId, muted: true }))

    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(fetchMock).toHaveBeenCalled()
    expect(cachedPlant(client)).toEqual(plant)
  })
})
