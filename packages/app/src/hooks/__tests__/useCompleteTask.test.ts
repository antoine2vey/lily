import { renderQueryHook } from '@/__tests__/utils/query-helpers'
import { useCompleteTask } from '../useCompleteTask'

// Mock the client
jest.mock('@/utils/client', () => ({
  apiEffectRunner: jest.fn(),
}))

describe('useCompleteTask', () => {
  it('returns mutation object', () => {
    const { result } = renderQueryHook(() => useCompleteTask())

    expect(result.current).toBeDefined()
    expect(typeof result.current.mutate).toBe('function')
    expect(typeof result.current.mutateAsync).toBe('function')
  })

  it('has isPending state', () => {
    const { result } = renderQueryHook(() => useCompleteTask())

    expect(result.current.isPending).toBe(false)
  })

  it('has isSuccess state', () => {
    const { result } = renderQueryHook(() => useCompleteTask())

    expect(result.current.isSuccess).toBe(false)
  })

  it('has isError state', () => {
    const { result } = renderQueryHook(() => useCompleteTask())

    expect(result.current.isError).toBe(false)
  })
})
