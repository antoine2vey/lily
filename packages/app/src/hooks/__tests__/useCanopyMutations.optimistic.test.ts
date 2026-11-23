import type { CanopyResponse } from '@lily/shared'
import { act, renderHook, waitFor } from '@testing-library/react-native'
import { Result } from 'effect'
import { canopyIds, mockCanopy } from '@/__tests__/fixtures'
import {
  createCacheTestQueryClient,
  createQueryWrapper,
} from '@/__tests__/utils/query-helpers'

// Stubbed at the network so the hooks run through the real API client.
const fetchMock = jest.spyOn(globalThis, 'fetch')
afterEach(() => fetchMock.mockReset())

import type { ApiResult } from '@/utils/client'
import { MY_CANOPY_QUERY_KEY } from '@/utils/query-keys'
import {
  useRemoveCanopyMember,
  useWithdrawCanopyInvitation,
} from '../useCanopyMutations'

const seed = () => {
  const client = createCacheTestQueryClient()
  client.setQueryData(
    MY_CANOPY_QUERY_KEY,
    Result.succeed({ canopy: mockCanopy })
  )
  return client
}

const cachedCanopy = (client: ReturnType<typeof seed>) =>
  Result.getOrThrow(
    client.getQueryData(MY_CANOPY_QUERY_KEY) as ApiResult<CanopyResponse>
  ).canopy

describe('useWithdrawCanopyInvitation optimistic update', () => {
  it('removes the invitation before the API answers', () => {
    fetchMock.mockReturnValue(new Promise(() => {}))
    const client = seed()
    const { result } = renderHook(useWithdrawCanopyInvitation, {
      wrapper: createQueryWrapper(client),
    })

    act(() => result.current.mutate(canopyIds.invitation))

    expect(cachedCanopy(client)?.invitations.map((i) => i.id)).toEqual([
      canopyIds.otherInvitation,
    ])
    expect(cachedCanopy(client)?.members).toEqual(mockCanopy.members)
  })

  it('restores the canopy when the API fails', async () => {
    fetchMock.mockRejectedValue(new TypeError('Network request failed'))
    const client = seed()
    const { result } = renderHook(useWithdrawCanopyInvitation, {
      wrapper: createQueryWrapper(client),
    })

    act(() => result.current.mutate(canopyIds.invitation))

    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(fetchMock).toHaveBeenCalled()
    expect(cachedCanopy(client)).toEqual(mockCanopy)
  })
})

describe('useRemoveCanopyMember optimistic update', () => {
  it('removes the member before the API answers', () => {
    fetchMock.mockReturnValue(new Promise(() => {}))
    const client = seed()
    const { result } = renderHook(useRemoveCanopyMember, {
      wrapper: createQueryWrapper(client),
    })

    act(() => result.current.mutate(canopyIds.member))

    expect(cachedCanopy(client)?.members.map((m) => m.userId)).toEqual([
      canopyIds.owner,
    ])
    expect(cachedCanopy(client)?.invitations).toEqual(mockCanopy.invitations)
  })

  it('restores the canopy when the API fails', async () => {
    fetchMock.mockRejectedValue(new TypeError('Network request failed'))
    const client = seed()
    const { result } = renderHook(useRemoveCanopyMember, {
      wrapper: createQueryWrapper(client),
    })

    act(() => result.current.mutate(canopyIds.member))

    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(fetchMock).toHaveBeenCalled()
    expect(cachedCanopy(client)).toEqual(mockCanopy)
  })
})
