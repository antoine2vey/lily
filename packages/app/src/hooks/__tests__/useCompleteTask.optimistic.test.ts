import { QueryClient } from '@tanstack/react-query'
import { act, renderHook } from '@testing-library/react-native'
import { Either } from 'effect'
import { createQueryWrapper } from '@/__tests__/utils/query-helpers'

// Controls how the mocked completion API behaves. Must be `mock`-prefixed to be
// referenceable inside the hoisted jest.mock factory.
let mockShouldThrow = false

// Keep the real client module (types, helpers) but make apiEffectRunner
// controllable. Unlike useEffectMutation, apiEffectRunner THROWS on failure, so
// a thrown error drives the hook's onError rollback path.
jest.mock('@/utils/client', () => {
  const actual = jest.requireActual('@/utils/client')
  return {
    ...actual,
    apiEffectRunner: jest.fn(async () => {
      if (mockShouldThrow) throw new Error('carePlant failed')
      return undefined
    }),
  }
})

// onSuccess forks recordPositiveMoment; stub it to a no-op Effect so the test
// doesn't depend on rating-prompt internals.
jest.mock('@/utils/rating-prompt', () => ({
  recordPositiveMoment: jest.requireActual('effect').Effect.void,
}))

import { useCompleteTask } from '../useCompleteTask'

const CARE_TASKS_QUERY_KEY = ['careTasks', 'getCareTasks', {}]

const task = (id: string) => ({
  id,
  plantId: `plant-${id}`,
  plantName: `Plant ${id}`,
  plantImageUrl: null,
  type: 'watering' as const,
  completed: false,
  dueDate: new Date('2025-01-01T00:00:00Z'),
})

// gcTime: Infinity so the observer-less cache entry survives long enough to assert.
const makeClient = () =>
  new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: Number.POSITIVE_INFINITY },
      mutations: { retry: false },
    },
  })

const seed = (client: QueryClient) =>
  client.setQueryData(
    CARE_TASKS_QUERY_KEY,
    Either.right({
      overdue: [task('1'), task('2')],
      today: [task('3')],
      upcoming: [],
      completedToday: 0,
    })
  )

const snapshot = (client: QueryClient) =>
  Either.getOrThrow(
    client.getQueryData(CARE_TASKS_QUERY_KEY) as Either.Either<
      {
        overdue: Array<{ id: string }>
        today: Array<{ id: string }>
        completedToday: number
      },
      unknown
    >
  )

describe('useCompleteTask optimistic lifecycle', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockShouldThrow = false
  })

  it('removes the completed task from overdue/today instantly and keeps it removed on success', async () => {
    const client = makeClient()
    seed(client)

    const { result } = renderHook(() => useCompleteTask(), {
      wrapper: createQueryWrapper(client),
    })

    await act(async () => {
      await result.current.mutateAsync({
        taskId: '1',
        plantId: 'plant-1',
        type: 'watering',
      })
    })

    const data = snapshot(client)
    expect(data.overdue.map((t) => t.id)).toEqual(['2'])
    expect(data.today.map((t) => t.id)).toEqual(['3'])
    expect(data.completedToday).toBe(1)
  })

  it('rolls back to the original list when the completion API throws', async () => {
    mockShouldThrow = true
    const client = makeClient()
    seed(client)

    const { result } = renderHook(() => useCompleteTask(), {
      wrapper: createQueryWrapper(client),
    })

    await act(async () => {
      await result.current
        .mutateAsync({ taskId: '1', plantId: 'plant-1', type: 'watering' })
        .catch(() => {})
    })

    // Optimistically removed in onMutate, then restored by onError.
    const data = snapshot(client)
    expect(data.overdue.map((t) => t.id)).toEqual(['1', '2'])
    expect(data.today.map((t) => t.id)).toEqual(['3'])
    expect(data.completedToday).toBe(0)
  })
})
