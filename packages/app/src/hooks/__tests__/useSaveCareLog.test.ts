import { act } from '@testing-library/react-native'
import { DateTime } from 'effect'
import { renderQueryHook } from '@/__tests__/utils/query-helpers'
import { apiEffectRunner } from '@/utils/client'
import { useSaveCareLog } from '../useSaveCareLog'

// Mock the client
jest.mock('@/utils/client', () => ({
  apiEffectRunner: jest.fn(),
}))

describe('useSaveCareLog', () => {
  it('returns mutation object', () => {
    const { result } = renderQueryHook(() => useSaveCareLog())

    expect(result.current).toBeDefined()
    expect(typeof result.current.mutate).toBe('function')
    expect(typeof result.current.mutateAsync).toBe('function')
  })

  it('has isPending state', () => {
    const { result } = renderQueryHook(() => useSaveCareLog())

    expect(result.current.isPending).toBe(false)
  })

  it('has isSuccess state', () => {
    const { result } = renderQueryHook(() => useSaveCareLog())

    expect(result.current.isSuccess).toBe(false)
  })

  it('has isError state', () => {
    const { result } = renderQueryHook(() => useSaveCareLog())

    expect(result.current.isError).toBe(false)
  })

  it('logs on the picked day at the picked time of day', async () => {
    jest.mocked(apiEffectRunner).mockResolvedValue({} as never)
    const utc = (iso: string) => DateTime.toDateUtc(DateTime.makeUnsafe(iso))
    const { result } = renderQueryHook(() => useSaveCareLog())

    await act(async () => {
      await result.current.mutateAsync({
        plantIds: ['plant-1'],
        type: 'watering',
        date: utc('2026-03-14T00:00:00Z'),
        time: utc('2000-01-01T09:45:30Z'),
      })
    })

    expect(apiEffectRunner).toHaveBeenCalledWith('careLogs', 'createCareLog', {
      params: { plantId: 'plant-1' },
      payload: expect.objectContaining({
        date: utc('2026-03-14T09:45:00Z'),
      }),
    })
  })
})
