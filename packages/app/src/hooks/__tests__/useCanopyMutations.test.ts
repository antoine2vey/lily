import { CanopyFullError } from '@lily/shared'
import { QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react-native'
import { Option } from 'effect'
import { createElement, type ReactNode } from 'react'
import { parseInviteToken } from '@/utils/canopy-invite-token'

jest.mock('@/utils/client', () => ({
  apiEffectRunner: jest.fn(),
}))

import { apiEffectRunner } from '@/utils/client'
import { createQueryClient } from '@/utils/query-client'
import { queryKeys } from '@/utils/query-keys'
import {
  useAcceptCanopyInvite,
  useDeleteCanopy,
  useLeaveCanopy,
  useRemoveCanopyMember,
} from '../useCanopyMutations'

const token = Option.getOrThrow(
  parseInviteToken('U97umPWqTRea_CZl99IrKv07PctPfxf7mjipVeP7HcM')
)

describe('Canopy mutations', () => {
  it('sends one request per tap when the API answers with a tagged error', async () => {
    jest
      .mocked(apiEffectRunner)
      .mockRejectedValue(new CanopyFullError({ limit: 10 }))
    const client = createQueryClient()
    const wrapper = ({ children }: { children: ReactNode }) =>
      createElement(QueryClientProvider, { client }, children)

    const { result } = renderHook(() => useAcceptCanopyInvite(), { wrapper })
    act(() => result.current.mutate(token))

    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(result.current.error).toBeInstanceOf(CanopyFullError)
    expect(apiEffectRunner).toHaveBeenCalledTimes(1)
    client.clear()
  })

  // Leaving, removal and dissolving hand shared plants back to whoever shared
  // them; leave-and-join runs leave then accept.
  const withRun = (mutation: { isSuccess: boolean }, run: () => void) => ({
    isSuccess: mutation.isSuccess,
    run,
  })
  it.each([
    [
      'leave',
      () => {
        const m = useLeaveCanopy()
        return withRun(m, () => m.mutate())
      },
    ],
    [
      'delete',
      () => {
        const m = useDeleteCanopy()
        return withRun(m, () => m.mutate())
      },
    ],
    [
      'remove a member',
      () => {
        const m = useRemoveCanopyMember()
        return withRun(m, () => m.mutate('user-2'))
      },
    ],
    [
      'accept an invite',
      () => {
        const m = useAcceptCanopyInvite()
        return withRun(m, () => m.mutate(token))
      },
    ],
  ] as const)(
    'refreshes plants, the cemetery and rooms after %s',
    async (_, useCase) => {
      jest.mocked(apiEffectRunner).mockResolvedValue({ canopy: null })
      const client = createQueryClient()
      const invalidate = jest.spyOn(client, 'invalidateQueries')
      const wrapper = ({ children }: { children: ReactNode }) =>
        createElement(QueryClientProvider, { client }, children)

      const { result } = renderHook(useCase, { wrapper })
      act(() => result.current.run())

      await waitFor(() => expect(result.current.isSuccess).toBe(true))
      expect(invalidate).toHaveBeenCalledWith({
        queryKey: queryKeys.plants.all,
      })
      expect(invalidate).toHaveBeenCalledWith({ queryKey: queryKeys.rooms.all })
      client.clear()
    }
  )
})
