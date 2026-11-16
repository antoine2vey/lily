import type { CarePlanListResponse } from '@lily/shared/care-plan'
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

// Stubbed at the network so the hook runs through the real API client.
const fetchMock = jest.spyOn(globalThis, 'fetch')
afterEach(() => fetchMock.mockReset())

import type { ApiResult } from '@/utils/client'
import {
  useCompleteCarePlanStep,
  useUncompleteCarePlanStep,
} from '../useCarePlanMutations'

const keys = [carePlansListKey, plantCarePlansKey]

const seed = () => {
  const client = createCacheTestQueryClient()
  for (const key of keys) {
    client.setQueryData(key, Result.succeed({ items: [mockCarePlan] }))
  }
  return client
}

const plansIn = (client: ReturnType<typeof seed>, key: unknown[]) =>
  Result.getOrThrow(client.getQueryData(key) as ApiResult<CarePlanListResponse>)
    .items

const stepIn = (
  client: ReturnType<typeof seed>,
  key: unknown[],
  stepId: string
) => plansIn(client, key)[0]?.steps.find((step) => step.id === stepId)

const render = <T>(useHook: () => T, client: ReturnType<typeof seed>) =>
  renderHook(useHook, { wrapper: createQueryWrapper(client) })

describe('care plan step mutations', () => {
  it('marks the step done in every cached plan list before the API answers', () => {
    fetchMock.mockReturnValue(new Promise(() => {}))
    const client = seed()
    const { result } = render(useCompleteCarePlanStep, client)

    act(() =>
      result.current.mutate({
        params: { planId: carePlanIds.plan, stepId: carePlanIds.openStep },
      })
    )

    for (const key of keys) {
      expect(
        stepIn(client, key, carePlanIds.openStep)?.completedAt
      ).toBeInstanceOf(Date)
    }
  })

  it('reopens the step in every cached plan list before the API answers', () => {
    fetchMock.mockReturnValue(new Promise(() => {}))
    const client = seed()
    const { result } = render(useUncompleteCarePlanStep, client)

    act(() =>
      result.current.mutate({
        params: { planId: carePlanIds.plan, stepId: carePlanIds.doneStep },
      })
    )

    for (const key of keys) {
      expect(stepIn(client, key, carePlanIds.doneStep)).not.toHaveProperty(
        'completedAt'
      )
    }
  })

  it.each([
    ['complete', useCompleteCarePlanStep, carePlanIds.openStep],
    ['uncomplete', useUncompleteCarePlanStep, carePlanIds.doneStep],
  ] as const)(
    'restores both plan lists when %s fails',
    async (_, useHook, stepId) => {
      fetchMock.mockRejectedValue(new TypeError('Network request failed'))
      const client = seed()
      const { result } = render(useHook, client)

      act(() =>
        result.current.mutate({ params: { planId: carePlanIds.plan, stepId } })
      )

      await waitFor(() => expect(result.current.isError).toBe(true))
      expect(fetchMock).toHaveBeenCalled()
      for (const key of keys) {
        expect(plansIn(client, key)).toEqual([mockCarePlan])
      }
    }
  )
})
