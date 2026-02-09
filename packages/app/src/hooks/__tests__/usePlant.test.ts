import { renderHook } from '@testing-library/react-native'
import { mockPlants } from 'src/__tests__/fixtures/plants'
import {
  createQueryWrapper,
  mockQueryLoading,
  mockQuerySuccess,
} from 'src/__tests__/utils/query-helpers'

// Mock the client
jest.mock('@/utils/client', () => ({
  useEffectQuery: jest.fn(),
}))

import { useEffectQuery } from 'src/utils/client'
import { usePlant } from '../usePlant'

const mockedUseEffectQuery = useEffectQuery as jest.Mock

describe('usePlant', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('calls useEffectQuery with correct parameters', () => {
    mockedUseEffectQuery.mockReturnValue(mockQueryLoading())

    renderHook(() => usePlant('plant-1'), {
      wrapper: createQueryWrapper(),
    })

    expect(mockedUseEffectQuery).toHaveBeenCalledWith(
      'plants',
      'getPlant',
      { path: { id: 'plant-1' } },
      expect.objectContaining({
        enabled: true,
        staleTime: expect.any(Number),
      })
    )
  })

  it('disables query when plantId is empty', () => {
    mockedUseEffectQuery.mockReturnValue(mockQueryLoading())

    renderHook(() => usePlant(''), {
      wrapper: createQueryWrapper(),
    })

    expect(mockedUseEffectQuery).toHaveBeenCalledWith(
      'plants',
      'getPlant',
      expect.any(Object),
      expect.objectContaining({
        enabled: false,
      })
    )
  })

  it('returns plant data when successful', () => {
    const mockPlant = mockPlants[0]
    mockedUseEffectQuery.mockReturnValue(mockQuerySuccess(mockPlant))

    const { result } = renderHook(() => usePlant('plant-1'), {
      wrapper: createQueryWrapper(),
    })

    expect(result.current.data).toEqual(mockPlant)
    expect(result.current.isSuccess).toBe(true)
  })

  it('returns loading state', () => {
    mockedUseEffectQuery.mockReturnValue(mockQueryLoading())

    const { result } = renderHook(() => usePlant('plant-1'), {
      wrapper: createQueryWrapper(),
    })

    expect(result.current.isLoading).toBe(true)
    expect(result.current.data).toBeUndefined()
  })

  it('passes plant ID to path parameter', () => {
    mockedUseEffectQuery.mockReturnValue(mockQueryLoading())

    renderHook(() => usePlant('plant-123'), {
      wrapper: createQueryWrapper(),
    })

    expect(mockedUseEffectQuery).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(String),
      expect.objectContaining({
        path: { id: 'plant-123' },
      }),
      expect.any(Object)
    )
  })
})
