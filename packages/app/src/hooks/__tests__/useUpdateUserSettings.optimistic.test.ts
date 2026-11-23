import type { UserSettings } from '@lily/shared'
import { act, renderHook, waitFor } from '@testing-library/react-native'
import { Result } from 'effect'
import { mockUserSettings } from '@/__tests__/fixtures'
import {
  createCacheTestQueryClient,
  createQueryWrapper,
} from '@/__tests__/utils/query-helpers'

const fetchMock = jest.spyOn(globalThis, 'fetch')
afterEach(() => fetchMock.mockReset())

import type { ApiResult } from '@/utils/client'
import { USER_SETTINGS_QUERY_KEY } from '@/utils/query-keys'
import { useUpdateUserSettings } from '../useUpdateUserSettings'

const seed = () => {
  const client = createCacheTestQueryClient()
  client.setQueryData(USER_SETTINGS_QUERY_KEY, Result.succeed(mockUserSettings))
  return client
}

const cachedSettings = (client: ReturnType<typeof seed>) =>
  Result.getOrThrow(
    client.getQueryData(USER_SETTINGS_QUERY_KEY) as ApiResult<UserSettings>
  )

describe('useUpdateUserSettings optimistic update', () => {
  it('merges only the sent fields before the API answers', () => {
    fetchMock.mockReturnValue(new Promise(() => {}))
    const client = seed()
    const { result } = renderHook(useUpdateUserSettings, {
      wrapper: createQueryWrapper(client),
    })

    act(() => result.current.mutate({ temperatureUnit: 'fahrenheit' }))

    expect(cachedSettings(client)).toEqual({
      ...mockUserSettings,
      temperatureUnit: 'fahrenheit',
    })
  })

  it('restores the settings when the API fails', async () => {
    fetchMock.mockRejectedValue(new TypeError('Network request failed'))
    const client = seed()
    const { result } = renderHook(useUpdateUserSettings, {
      wrapper: createQueryWrapper(client),
    })

    act(() => result.current.mutate({ preferredNotificationTime: '07:30' }))

    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(fetchMock).toHaveBeenCalled()
    expect(cachedSettings(client)).toEqual(mockUserSettings)
  })
})
