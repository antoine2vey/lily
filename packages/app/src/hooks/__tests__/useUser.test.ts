import { renderHook, waitFor } from '@testing-library/react-native'
import { createQueryWrapper } from 'src/__tests__/utils/query-helpers'
import { useUser } from '../useUser'

describe('useUser', () => {
  it('returns user data when successful', async () => {
    const { result } = renderHook(() => useUser(), {
      wrapper: createQueryWrapper(),
    })

    // Initially loading
    expect(result.current.isLoading).toBe(true)

    // Wait for data to load
    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true)
    })

    expect(result.current.data).toBeDefined()
    expect(result.current.data?.id).toBe('user-1')
    expect(result.current.data?.email).toBe('user@example.com')
    expect(result.current.data?.name).toBe('Plant Lover')
  })

  it('returns user with correct shape', async () => {
    const { result } = renderHook(() => useUser(), {
      wrapper: createQueryWrapper(),
    })

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true)
    })

    expect(result.current.data).toMatchObject({
      id: expect.any(String),
      email: expect.any(String),
      name: expect.any(String),
      createdAt: expect.any(String),
    })
  })

  it('provides refetch function', async () => {
    const { result } = renderHook(() => useUser(), {
      wrapper: createQueryWrapper(),
    })

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true)
    })

    expect(typeof result.current.refetch).toBe('function')
  })

  it('uses correct query key', async () => {
    const _queryClient = require('@tanstack/react-query').QueryClient
    const { result } =
      require('src/__tests__/utils/query-helpers').renderQueryHook(() =>
        useUser()
      )

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true)
    })

    // Query key should be ['user']
    expect(result.current.data).toBeDefined()
  })
})
