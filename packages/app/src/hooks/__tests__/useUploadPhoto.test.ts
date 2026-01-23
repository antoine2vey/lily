import { renderQueryHook } from 'src/__tests__/utils/query-helpers'
import { useUploadPhoto } from '../useUploadPhoto'

// Mock the upload utils
jest.mock('@/utils/upload', () => ({
  createFileFromUri: jest.fn(),
  uploadMultipart: jest.fn(),
}))

describe('useUploadPhoto', () => {
  it('returns mutation object', () => {
    const { result } = renderQueryHook(() => useUploadPhoto())

    expect(result.current).toBeDefined()
    expect(typeof result.current.mutate).toBe('function')
    expect(typeof result.current.mutateAsync).toBe('function')
  })

  it('has isPending state', () => {
    const { result } = renderQueryHook(() => useUploadPhoto())

    expect(result.current.isPending).toBe(false)
  })

  it('has isSuccess state', () => {
    const { result } = renderQueryHook(() => useUploadPhoto())

    expect(result.current.isSuccess).toBe(false)
  })

  it('has isError state', () => {
    const { result } = renderQueryHook(() => useUploadPhoto())

    expect(result.current.isError).toBe(false)
  })
})
