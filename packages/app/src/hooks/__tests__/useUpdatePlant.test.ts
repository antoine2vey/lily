import { renderHook } from '@testing-library/react-native'
import {
  createQueryWrapper,
  mockMutationSuccess,
} from 'src/__tests__/utils/query-helpers'

// Mock the client
jest.mock('@/utils/client', () => ({
  useEffectMutation: jest.fn(),
}))

import { useEffectMutation } from '@/utils/client'
import { useUpdatePlant } from '../useUpdatePlant'

const mockedUseEffectMutation = useEffectMutation as jest.MockedFunction<
  typeof useEffectMutation
>

describe('useUpdatePlant', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('calls useEffectMutation with correct parameters', () => {
    mockedUseEffectMutation.mockReturnValue(mockMutationSuccess() as any)

    renderHook(() => useUpdatePlant('plant-1'), {
      wrapper: createQueryWrapper(),
    })

    expect(mockedUseEffectMutation).toHaveBeenCalledWith(
      'plants',
      'updatePlant',
      expect.any(Object)
    )
  })

  it('returns mutation functions', () => {
    const mockMutation = {
      ...mockMutationSuccess(),
      mutate: jest.fn(),
      mutateAsync: jest.fn(),
    }
    mockedUseEffectMutation.mockReturnValue(mockMutation as any)

    const { result } = renderHook(() => useUpdatePlant('plant-1'), {
      wrapper: createQueryWrapper(),
    })

    expect(typeof result.current.mutate).toBe('function')
    expect(typeof result.current.mutateAsync).toBe('function')
  })
})
