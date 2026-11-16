import { CARE_TASK_UNDO_TIMEOUT_MS } from '@lily/shared'
import { act, renderHook, waitFor } from '@testing-library/react-native'
import { Result } from 'effect'
import {
  carePlanIds,
  carePlansListKey,
  mockCarePlan,
  plantCarePlansKey,
} from '@/__tests__/fixtures/care-plans'
import {
  createCacheTestQueryClient,
  createQueryWrapper,
} from '@/__tests__/utils/query-helpers'

const fetchMock = jest.spyOn(globalThis, 'fetch')
afterEach(() => fetchMock.mockReset())

jest.mock('sonner-native', () => ({
  toast: { success: jest.fn(), error: jest.fn() },
}))

jest.mock('@/hooks/useSkipWaitingPreference', () => ({
  useSkipWaitingPreference: () => ({
    skipWaiting: false,
    setSkipWaiting: jest.fn(),
    isLoading: false,
  }),
}))

import { useCarePlanStepActions } from '../useCarePlanStepActions'
import { useCarePlans, usePlantCarePlans } from '../useCarePlans'

type Frame = { done: boolean; pending: boolean }

// The Care tab and plant detail each read their plan list in the same
// component that owns the step countdown.
const useStepScreen = (
  useList: () => ReturnType<typeof useCarePlans>,
  frames: Frame[]
) => {
  const { data } = useList()
  const { pendingStepIds, toggleStep } = useCarePlanStepActions()
  const plan = data?.items[0]
  const step = plan?.steps.find(({ id }) => id === carePlanIds.openStep)
  frames.push({
    done: step?.completedAt !== undefined,
    pending: pendingStepIds.has(carePlanIds.openStep),
  })
  return { plan, step, toggleStep }
}

describe('care plan step countdown', () => {
  beforeEach(() => jest.useFakeTimers())
  afterEach(() => jest.useRealTimers())

  it.each([
    ['the Care tab', carePlansListKey, () => useCarePlans()],
    [
      'plant detail',
      plantCarePlansKey,
      () => usePlantCarePlans(carePlanIds.plant),
    ],
  ] as const)(
    'never shows the step open again when the countdown ends on %s',
    async (_, key, useList) => {
      fetchMock.mockReturnValue(new Promise(() => {}))
      const client = createCacheTestQueryClient()
      client.setQueryData(key, Result.succeed({ items: [mockCarePlan] }))
      const frames: Frame[] = []
      const { result } = renderHook(() => useStepScreen(useList, frames), {
        wrapper: createQueryWrapper(client),
      })

      const { plan, step, toggleStep } = result.current
      if (!plan || !step) throw new Error('seeded plan did not render')
      act(() => toggleStep(plan, step))
      const countdownStart = frames.length - 1
      expect(frames[countdownStart]).toEqual({ done: false, pending: true })

      await act(async () => {
        jest.advanceTimersByTime(CARE_TASK_UNDO_TIMEOUT_MS)
      })

      await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
      expect(String(fetchMock.mock.calls[0]?.[0])).toContain(
        `/care-plans/${carePlanIds.plan}/steps/${carePlanIds.openStep}/complete`
      )
      expect(
        frames.slice(countdownStart).filter((f) => !f.done && !f.pending)
      ).toEqual([])
      expect(frames.at(-1)).toEqual({ done: true, pending: false })
    }
  )
})
