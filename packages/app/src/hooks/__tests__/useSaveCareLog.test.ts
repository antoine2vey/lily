import { renderQueryHook } from '@/__tests__/utils/query-helpers'
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
})
