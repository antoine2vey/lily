import { renderHook } from '@testing-library/react-native'
import { mockPlants } from '@/__tests__/fixtures/plants'
import { createQueryWrapper } from '@/__tests__/utils/query-helpers'

jest.mock('@/utils/client', () => ({
  useEffectQuery: jest.fn(),
}))

import { useEffectQuery } from '@/utils/client'
import { useDeadPlants } from '../useDeadPlants'

const mockedUseEffectQuery = useEffectQuery as jest.MockedFunction<
  typeof useEffectQuery
>

describe('useDeadPlants', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('requests the dead filter', () => {
    mockedUseEffectQuery.mockReturnValue({
      data: undefined,
      isLoading: true,
    } as never)

    renderHook(() => useDeadPlants(), { wrapper: createQueryWrapper() })

    expect(mockedUseEffectQuery).toHaveBeenCalledWith(
      'plants',
      'getPlants',
      { urlParams: expect.objectContaining({ filter: 'dead' }) },
      expect.any(Object)
    )
  })

  it('sorts by most recent loss first and exposes the total', () => {
    const older = {
      ...mockPlants[0],
      id: 'older',
      diedAt: new Date('2026-01-01'),
    }
    const newer = {
      ...mockPlants[0],
      id: 'newer',
      diedAt: new Date('2026-03-01'),
    }
    mockedUseEffectQuery.mockReturnValue({
      data: { items: [older, newer], total: 2, page: 1, limit: 100 },
      isLoading: false,
    } as never)

    const { result } = renderHook(() => useDeadPlants(), {
      wrapper: createQueryWrapper(),
    })

    expect(result.current.plants.map((p) => p.id)).toEqual(['newer', 'older'])
    expect(result.current.total).toBe(2)
  })

  it('returns an empty list and zero total without data', () => {
    mockedUseEffectQuery.mockReturnValue({
      data: undefined,
      isLoading: false,
    } as never)

    const { result } = renderHook(() => useDeadPlants(), {
      wrapper: createQueryWrapper(),
    })

    expect(result.current.plants).toEqual([])
    expect(result.current.total).toBe(0)
  })
})
