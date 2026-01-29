import { renderHook } from '@testing-library/react-native'
import {
  createQueryWrapper,
  mockQueryError,
  mockQueryLoading,
  mockQuerySuccess,
} from 'src/__tests__/utils/query-helpers'

// Mock the client
jest.mock('@/utils/client', () => ({
  useEffectQuery: jest.fn(),
}))

import { useRecentActivities } from 'src/hooks/useRecentActivities'
import { useEffectQuery } from '@/utils/client'

const mockedUseEffectQuery = useEffectQuery as jest.MockedFunction<
  typeof useEffectQuery
>

describe('useRecentActivities', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe('query configuration', () => {
    it('should call useEffectQuery with correct parameters', () => {
      mockedUseEffectQuery.mockReturnValue({
        ...mockQueryLoading(),
        data: undefined,
      })

      renderHook(() => useRecentActivities(), {
        wrapper: createQueryWrapper(),
      })

      expect(mockedUseEffectQuery).toHaveBeenCalledWith(
        'careLogs',
        'getRecentActivities',
        { urlParams: { limit: '10' } },
        expect.objectContaining({
          staleTime: expect.any(Number),
        })
      )
    })

    it('should use custom limit when provided', () => {
      mockedUseEffectQuery.mockReturnValue({
        ...mockQueryLoading(),
        data: undefined,
      })

      renderHook(() => useRecentActivities(5), {
        wrapper: createQueryWrapper(),
      })

      expect(mockedUseEffectQuery).toHaveBeenCalledWith(
        'careLogs',
        'getRecentActivities',
        { urlParams: { limit: '5' } },
        expect.any(Object)
      )
    })

    it('should pass limit of 20 as string', () => {
      mockedUseEffectQuery.mockReturnValue({
        ...mockQueryLoading(),
        data: undefined,
      })

      renderHook(() => useRecentActivities(20), {
        wrapper: createQueryWrapper(),
      })

      expect(mockedUseEffectQuery).toHaveBeenCalledWith(
        'careLogs',
        'getRecentActivities',
        { urlParams: { limit: '20' } },
        expect.any(Object)
      )
    })
  })

  describe('data transformation', () => {
    it('should return empty array when data is undefined', () => {
      mockedUseEffectQuery.mockReturnValue({
        ...mockQueryLoading(),
        data: undefined,
      })

      const { result } = renderHook(() => useRecentActivities(), {
        wrapper: createQueryWrapper(),
      })

      expect(result.current.data).toEqual([])
    })

    it('should return empty array when items is null', () => {
      mockedUseEffectQuery.mockReturnValue({
        ...mockQuerySuccess({ items: null }),
        data: { items: null },
      })

      const { result } = renderHook(() => useRecentActivities(), {
        wrapper: createQueryWrapper(),
      })

      expect(result.current.data).toEqual([])
    })

    it('should transform watering activity correctly', () => {
      const mockItems = [
        {
          id: 'care-1',
          type: 'watering' as const,
          plantId: 'plant-1',
          plantName: 'My Fern',
          date: '2024-01-15T10:30:00.000Z',
          plantImageUrl: 'https://example.com/fern.jpg',
        },
      ]

      mockedUseEffectQuery.mockReturnValue({
        ...mockQuerySuccess({ items: mockItems }),
        data: { items: mockItems },
      })

      const { result } = renderHook(() => useRecentActivities(), {
        wrapper: createQueryWrapper(),
      })

      expect(result.current.data).toHaveLength(1)
      expect(result.current.data[0]).toMatchObject({
        id: 'care-1',
        type: 'watered',
        plantId: 'plant-1',
        plantName: 'My Fern',
        plantImageUrl: 'https://example.com/fern.jpg',
      })
      expect(result.current.data[0].timestamp).toBeInstanceOf(Date)
    })

    it('should transform fertilization activity correctly', () => {
      const mockItems = [
        {
          id: 'care-2',
          type: 'fertilization' as const,
          plantId: 'plant-2',
          plantName: 'My Succulent',
          date: '2024-01-14T08:00:00.000Z',
          plantImageUrl: undefined,
        },
      ]

      mockedUseEffectQuery.mockReturnValue({
        ...mockQuerySuccess({ items: mockItems }),
        data: { items: mockItems },
      })

      const { result } = renderHook(() => useRecentActivities(), {
        wrapper: createQueryWrapper(),
      })

      expect(result.current.data).toHaveLength(1)
      expect(result.current.data[0]).toMatchObject({
        id: 'care-2',
        type: 'fertilized',
        plantId: 'plant-2',
        plantName: 'My Succulent',
      })
    })

    it('should transform multiple activities', () => {
      const mockItems = [
        {
          id: 'care-1',
          type: 'watering' as const,
          plantId: 'plant-1',
          plantName: 'Fern',
          date: '2024-01-15T10:30:00.000Z',
        },
        {
          id: 'care-2',
          type: 'fertilization' as const,
          plantId: 'plant-2',
          plantName: 'Succulent',
          date: '2024-01-14T08:00:00.000Z',
        },
        {
          id: 'care-3',
          type: 'watering' as const,
          plantId: 'plant-1',
          plantName: 'Fern',
          date: '2024-01-13T15:00:00.000Z',
        },
      ]

      mockedUseEffectQuery.mockReturnValue({
        ...mockQuerySuccess({ items: mockItems }),
        data: { items: mockItems },
      })

      const { result } = renderHook(() => useRecentActivities(), {
        wrapper: createQueryWrapper(),
      })

      expect(result.current.data).toHaveLength(3)
      expect(result.current.data[0].type).toBe('watered')
      expect(result.current.data[1].type).toBe('fertilized')
      expect(result.current.data[2].type).toBe('watered')
    })

    it('should handle Date objects in date field', () => {
      const dateObj = new Date('2024-01-15T10:30:00.000Z')
      const mockItems = [
        {
          id: 'care-1',
          type: 'watering' as const,
          plantId: 'plant-1',
          plantName: 'Fern',
          date: dateObj,
        },
      ]

      mockedUseEffectQuery.mockReturnValue({
        ...mockQuerySuccess({ items: mockItems }),
        data: { items: mockItems },
      })

      const { result } = renderHook(() => useRecentActivities(), {
        wrapper: createQueryWrapper(),
      })

      expect(result.current.data[0].timestamp).toEqual(dateObj)
    })
  })

  describe('query state passthrough', () => {
    it('should pass through loading state', () => {
      mockedUseEffectQuery.mockReturnValue({
        ...mockQueryLoading(),
        data: undefined,
      })

      const { result } = renderHook(() => useRecentActivities(), {
        wrapper: createQueryWrapper(),
      })

      expect(result.current.isLoading).toBe(true)
      expect(result.current.isPending).toBe(true)
    })

    it('should pass through error state', () => {
      const mockError = new Error('Failed to fetch')
      mockedUseEffectQuery.mockReturnValue({
        ...mockQueryError(mockError),
        data: undefined,
      })

      const { result } = renderHook(() => useRecentActivities(), {
        wrapper: createQueryWrapper(),
      })

      expect(result.current.isError).toBe(true)
      expect(result.current.error).toBe(mockError)
    })

    it('should pass through success state', () => {
      mockedUseEffectQuery.mockReturnValue({
        ...mockQuerySuccess({ items: [] }),
        data: { items: [] },
      })

      const { result } = renderHook(() => useRecentActivities(), {
        wrapper: createQueryWrapper(),
      })

      expect(result.current.isSuccess).toBe(true)
      expect(result.current.isError).toBe(false)
    })
  })
})
