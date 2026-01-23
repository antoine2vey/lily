import { mockPlants } from '@lily/api/__tests__/fixtures/plants'
import { renderHook, waitFor } from '@testing-library/react-native'
import {
  createQueryWrapper,
  mockQueryLoading,
  mockQuerySuccess,
} from 'src/__tests__/utils/query-helpers'

// Mock the client
jest.mock('@/utils/client', () => ({
  useEffectQuery: jest.fn(),
}))

import { useEffectQuery } from '@/utils/client'
import { usePlants } from '../usePlants'

const mockedUseEffectQuery = useEffectQuery as jest.MockedFunction<
  typeof useEffectQuery
>

describe('usePlants', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('calls useEffectQuery with correct parameters', () => {
    mockedUseEffectQuery.mockReturnValue(mockQueryLoading() as any)

    renderHook(() => usePlants(), {
      wrapper: createQueryWrapper(),
    })

    expect(mockedUseEffectQuery).toHaveBeenCalledWith(
      'plants',
      'getPlants',
      expect.objectContaining({
        urlParams: expect.objectContaining({
          page: '1',
          limit: '20',
          filter: 'all',
          sort: 'added',
        }),
      }),
      expect.any(Object)
    )
  })

  it('accepts custom pagination params', () => {
    mockedUseEffectQuery.mockReturnValue(mockQueryLoading() as any)

    renderHook(() => usePlants({ page: '2', limit: '10' }), {
      wrapper: createQueryWrapper(),
    })

    expect(mockedUseEffectQuery).toHaveBeenCalledWith(
      'plants',
      'getPlants',
      expect.objectContaining({
        urlParams: expect.objectContaining({
          page: '2',
          limit: '10',
        }),
      }),
      expect.any(Object)
    )
  })

  it('accepts custom filter param', () => {
    mockedUseEffectQuery.mockReturnValue(mockQueryLoading() as any)

    renderHook(() => usePlants({ filter: 'needsWater' }), {
      wrapper: createQueryWrapper(),
    })

    expect(mockedUseEffectQuery).toHaveBeenCalledWith(
      'plants',
      'getPlants',
      expect.objectContaining({
        urlParams: expect.objectContaining({
          filter: 'needsWater',
        }),
      }),
      expect.any(Object)
    )
  })

  it('accepts custom sort param', () => {
    mockedUseEffectQuery.mockReturnValue(mockQueryLoading() as any)

    renderHook(() => usePlants({ sort: 'name' }), {
      wrapper: createQueryWrapper(),
    })

    expect(mockedUseEffectQuery).toHaveBeenCalledWith(
      'plants',
      'getPlants',
      expect.objectContaining({
        urlParams: expect.objectContaining({
          sort: 'name',
        }),
      }),
      expect.any(Object)
    )
  })

  it('returns query result', () => {
    const mockData = { items: mockPlants, total: mockPlants.length }
    mockedUseEffectQuery.mockReturnValue(mockQuerySuccess(mockData) as any)

    const { result } = renderHook(() => usePlants(), {
      wrapper: createQueryWrapper(),
    })

    expect(result.current.data).toEqual(mockData)
    expect(result.current.isLoading).toBe(false)
    expect(result.current.isSuccess).toBe(true)
  })

  it('handles loading state', () => {
    mockedUseEffectQuery.mockReturnValue(mockQueryLoading() as any)

    const { result } = renderHook(() => usePlants(), {
      wrapper: createQueryWrapper(),
    })

    expect(result.current.isLoading).toBe(true)
    expect(result.current.data).toBeUndefined()
  })
})
