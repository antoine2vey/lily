import { act, renderHook, waitFor } from '@testing-library/react-native'
import { Result } from 'effect'
import {
  createCacheTestQueryClient,
  createQueryWrapper,
} from '@/__tests__/utils/query-helpers'

const fetchMock = jest.spyOn(globalThis, 'fetch')
afterEach(() => fetchMock.mockReset())

import { useFollowUser } from '../useFollowUser'

// The API client rejects ids that are not UUIDs before sending a request.
const target = '5e2b7c90-1a3d-4f6e-8b24-9c0d1e2f3a55'
const me = '8f1a2b3c-4d5e-4f60-9a71-b2c3d4e5f666'
const other = '2c4e6a8b-0d1f-4e3a-8c5b-7d9e1f3a5b77'

const profileKey = [
  'social',
  'getPublicProfile',
  { params: { userId: target } },
]
const followingKey = ['social', 'getFollowing', { params: { userId: me } }]

const seed = () => {
  const client = createCacheTestQueryClient()
  client.setQueryData(
    profileKey,
    Result.succeed({ id: target, isFollowing: false, followerCount: 3 })
  )
  client.setQueryData(
    followingKey,
    Result.succeed({
      items: [{ id: other, isFollowing: true }],
      total: 1,
    })
  )
  return client
}

const read = (client: ReturnType<typeof seed>, key: unknown[]) =>
  Result.getOrThrow(client.getQueryData(key) as Result.Result<unknown, never>)

describe('useFollowUser optimistic update', () => {
  it('marks the profile followed and counts it before the API answers', () => {
    fetchMock.mockReturnValue(new Promise(() => {}))
    const client = seed()
    const { result } = renderHook(() => useFollowUser(), {
      wrapper: createQueryWrapper(client),
    })

    act(() => result.current.mutate({ params: { userId: target } }))

    expect(read(client, profileKey)).toEqual({
      id: target,
      isFollowing: true,
      followerCount: 4,
    })
    expect(read(client, followingKey)).toEqual({
      items: [{ id: other, isFollowing: true }],
      total: 2,
    })
  })

  it('restores every social entry when the API fails', async () => {
    fetchMock.mockRejectedValue(new TypeError('Network request failed'))
    const client = seed()
    const before = [read(client, profileKey), read(client, followingKey)]
    const { result } = renderHook(() => useFollowUser(), {
      wrapper: createQueryWrapper(client),
    })

    act(() => result.current.mutate({ params: { userId: target } }))

    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(fetchMock).toHaveBeenCalled()
    expect([read(client, profileKey), read(client, followingKey)]).toEqual(
      before
    )
  })
})
