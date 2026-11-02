import { act, waitFor } from '@testing-library/react-native'
import { renderQueryHook } from '@/__tests__/utils/query-helpers'
import { useEffectMutation } from '@/utils/client'

const PLANT_ID = '6f1c2a3b-4d5e-4f60-8a7b-9c0d1e2f3a4b'

const COLD_TRANSFORM_TIMEOUT_MS = 30_000

describe('useEffectMutation', () => {
  const originalFetch = global.fetch

  beforeEach(() => {
    global.fetch = jest.fn(
      async () =>
        new Response(
          JSON.stringify({
            _tag: 'AlreadyCaredTodayError',
            careType: 'watering',
            message: 'This care action was already logged today',
          }),
          { status: 409, headers: { 'content-type': 'application/json' } }
        )
    ) as unknown as typeof fetch
  })

  afterEach(() => {
    global.fetch = originalFetch
  })

  it(
    'calls onError with the API error tag and never onSuccess when the API refuses',
    async () => {
      const onSuccess = jest.fn()
      const onError = jest.fn()
      const { result } = renderQueryHook(() =>
        useEffectMutation('plants', 'carePlant')
      )

      act(() => {
        result.current.mutate(
          { params: { id: PLANT_ID }, payload: { careType: 'watering' } },
          { onSuccess, onError }
        )
      })

      await waitFor(() =>
        expect(onSuccess.mock.calls.length + onError.mock.calls.length).toBe(1)
      )
      expect(global.fetch).toHaveBeenCalledTimes(1)
      expect(onSuccess).not.toHaveBeenCalled()
      expect(onError.mock.calls[0]?.[0]).toMatchObject({
        _tag: 'AlreadyCaredTodayError',
      })
    },
    COLD_TRANSFORM_TIMEOUT_MS
  )
})
