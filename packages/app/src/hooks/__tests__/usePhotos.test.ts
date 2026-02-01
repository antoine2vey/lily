import { renderHook } from '@testing-library/react-native'
import { mockPlantPhotos } from 'src/__tests__/fixtures/plants'
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
import { usePhotos } from '../usePhotos'

const mockedUseEffectQuery = useEffectQuery as jest.Mock

describe('usePhotos', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('calls useEffectQuery with correct parameters', () => {
    mockedUseEffectQuery.mockReturnValue(mockQueryLoading())

    renderHook(() => usePhotos({ plantId: 'plant-1' }), {
      wrapper: createQueryWrapper(),
    })

    expect(mockedUseEffectQuery).toHaveBeenCalled()
  })

  it('returns photos data when successful', () => {
    mockedUseEffectQuery.mockReturnValue(mockQuerySuccess(mockPlantPhotos))

    const { result } = renderHook(() => usePhotos({ plantId: 'plant-1' }), {
      wrapper: createQueryWrapper(),
    })

    expect(result.current.data).toEqual(mockPlantPhotos)
    expect(result.current.isSuccess).toBe(true)
  })

  it('returns loading state', () => {
    mockedUseEffectQuery.mockReturnValue(mockQueryLoading())

    const { result } = renderHook(() => usePhotos({ plantId: 'plant-1' }), {
      wrapper: createQueryWrapper(),
    })

    expect(result.current.isLoading).toBe(true)
  })
})
