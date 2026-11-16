import { act, renderHook, waitFor } from '@testing-library/react-native'
import { Result } from 'effect'
import {
  createCacheTestQueryClient,
  createQueryWrapper,
} from '@/__tests__/utils/query-helpers'

jest.mock('@/utils/client', () => ({
  ...jest.requireActual('@/utils/client'),
  apiEffectRunner: jest.fn(),
}))

import { apiEffectRunner } from '@/utils/client'
import { useFollowUser } from '../useFollowUser'

const profileKey = ['social', 'getPublicProfile', { params: { userId: 'u2' } }]
const followingKey = ['social', 'getFollowing', { params: { userId: 'me' } }]

const seed = () => {
  const client = createCacheTestQueryClient()
  client.setQueryData(
    profileKey,
    Result.succeed({ id: 'u2', isFollowing: false, followerCount: 3 })
  )
  client.setQueryData(
    followingKey,
    Result.succeed({
      items: [{ id: 'u3', isFollowing: true }],
      total: 1,
    })
  )
  return client
}

const read = (client: ReturnType<typeof seed>, key: unknown[]) =>
  Result.getOrThrow(client.getQueryData(key) as Result.Result<unknown, never>)

describe('useFollowUser optimistic update', () => {
  it('marks the profile followed and counts it before the API answers', () => {
    jest.mocked(apiEffectRunner).mockReturnValue(new Promise(() => {}))
    const client = seed()
    const { result } = renderHook(() => useFollowUser(), {
      wrapper: createQueryWrapper(client),
    })

    act(() => result.current.mutate({ params: { userId: 'u2' } }))

    expect(read(client, profileKey)).toEqual({
      id: 'u2',
      isFollowing: true,
      followerCount: 4,
    })
    expect(read(client, followingKey)).toEqual({
      items: [{ id: 'u3', isFollowing: true }],
      total: 2,
    })
  })

  it('restores every social entry when the API fails', async () => {
    jest.mocked(apiEffectRunner).mockRejectedValue(new Error('follow failed'))
    const client = seed()
    const before = [read(client, profileKey), read(client, followingKey)]
    const { result } = renderHook(() => useFollowUser(), {
      wrapper: createQueryWrapper(client),
    })

    act(() => result.current.mutate({ params: { userId: 'u2' } }))

    await waitFor(() => expect(result.current.isError).toBe(true))
    expect([read(client, profileKey), read(client, followingKey)]).toEqual(
      before
    )
  })
})
