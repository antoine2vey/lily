import { CanopyFullError } from '@lily/shared'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react-native'
import { Option } from 'effect'
import { createElement, type ReactNode } from 'react'
import { parseInviteToken } from '@/utils/canopy-invite-token'

jest.mock('@/utils/client', () => ({
  apiEffectRunner: jest.fn(),
}))

import { apiEffectRunner } from '@/utils/client'
import { useAcceptCanopyInvite } from '../useCanopyMutations'

const token = Option.getOrThrow(
  parseInviteToken('U97umPWqTRea_CZl99IrKv07PctPfxf7mjipVeP7HcM')
)

// The root layout retries every mutation that is not a 401 up to 3 times.
const appLikeClient = () =>
  new QueryClient({
    defaultOptions: {
      mutations: {
        retry: (failureCount) => failureCount < 3,
        retryDelay: 0,
      },
    },
  })

describe('Canopy mutations', () => {
  it('sends one request per tap when the API answers with a tagged error', async () => {
    jest
      .mocked(apiEffectRunner)
      .mockRejectedValue(new CanopyFullError({ limit: 10 }))
    const client = appLikeClient()
    const wrapper = ({ children }: { children: ReactNode }) =>
      createElement(QueryClientProvider, { client }, children)

    const { result } = renderHook(() => useAcceptCanopyInvite(), { wrapper })
    act(() => result.current.mutate(token))

    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(result.current.error).toBeInstanceOf(CanopyFullError)
    expect(apiEffectRunner).toHaveBeenCalledTimes(1)
    client.clear()
  })
})
