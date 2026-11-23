import type { PublicUserProfile, UserCardListResponse } from '@lily/shared'
import { act, renderHook, waitFor } from '@testing-library/react-native'
import { Result } from 'effect'
import {
  createCacheTestQueryClient,
  createQueryWrapper,
} from '@/__tests__/utils/query-helpers'

const fetchMock = jest.spyOn(globalThis, 'fetch')
afterEach(() => fetchMock.mockReset())

import { effectQueryKey } from '@/utils/query-keys'
import { useFollowUser } from '../useFollowUser'

// The API client rejects ids that are not UUIDs before sending a request.
const target = '5e2b7c90-1a3d-4f6e-8b24-9c0d1e2f3a55'
const other = '2c4e6a8b-0d1f-4e3a-8c5b-7d9e1f3a5b77'

const profileKey = effectQueryKey('social', 'getPublicProfile', {
  params: { userId: target },
})
const followingKey = effectQueryKey('social', 'getFollowing', {
  query: { page: '1', limit: '20' },
})

const profile: PublicUserProfile = {
  id: target,
  name: 'Target',
  image: null,
  bio: null,
  plantCount: 2,
  followerCount: 3,
  followingCount: 0,
  isFollowing: false,
  shareGrowthData: false,
  createdAt: new Date('2025-01-01'),
  recentPlants: [],
}

const following: UserCardListResponse = {
  items: [
    { id: other, name: 'Other', image: null, plantCount: 1, isFollowing: true },
  ],
  total: 1,
  page: 1,
  limit: 20,
  hasMore: false,
}

const seed = () => {
  const client = createCacheTestQueryClient()
  client.setQueryData(profileKey, Result.succeed(profile))
  client.setQueryData(followingKey, Result.succeed(following))
  return client
}

const cached = (client: ReturnType<typeof seed>) => ({
  profile: client.getQueryData(profileKey),
  following: client.getQueryData(followingKey),
})

describe('useFollowUser optimistic update', () => {
  it('marks the profile followed and counts it before the API answers', () => {
    fetchMock.mockReturnValue(new Promise(() => {}))
    const client = seed()
    const { result } = renderHook(() => useFollowUser(), {
      wrapper: createQueryWrapper(client),
    })

    act(() => result.current.mutate({ params: { userId: target } }))

    expect(cached(client)).toEqual({
      profile: Result.succeed({
        ...profile,
        isFollowing: true,
        followerCount: 4,
      }),
      following: Result.succeed({ ...following, total: 2 }),
    })
  })

  it('restores every social entry when the API fails', async () => {
    fetchMock.mockRejectedValue(new TypeError('Network request failed'))
    const client = seed()
    const before = cached(client)
    const { result } = renderHook(() => useFollowUser(), {
      wrapper: createQueryWrapper(client),
    })

    act(() => result.current.mutate({ params: { userId: target } }))

    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(fetchMock).toHaveBeenCalled()
    expect(cached(client)).toEqual(before)
  })
})
