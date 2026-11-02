import { QueryClient } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react-native'
import { Result } from 'effect'
import { createQueryWrapper } from '@/__tests__/utils/query-helpers'

// Never resolves, so the test observes the cache while the request is in flight.
jest.mock('@/utils/client', () => {
  const actual = jest.requireActual('@/utils/client')
  const rq = jest.requireActual('@tanstack/react-query')
  return {
    ...actual,
    useEffectMutation: (_section: string, _method: string, options: object) =>
      rq.useMutation({
        mutationFn: () => new Promise(() => {}),
        ...options,
      }),
  }
})

import { useCareAll } from '../useCareAll'
import { CARE_TASKS_QUERY_KEY, useCareTasks } from '../useCareTasks'

const task = (id: string, plantId: string, type: string) => ({
  id,
  plantId,
  plantName: `Plant ${plantId}`,
  plantImageUrl: null,
  type,
  completed: false,
  dueDate: new Date('2025-01-01T00:00:00Z'),
})

const makeClient = () =>
  new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        gcTime: Number.POSITIVE_INFINITY,
        staleTime: Number.POSITIVE_INFINITY,
      },
      mutations: { retry: false, gcTime: Number.POSITIVE_INFINITY },
    },
  })

describe('useCareAll optimistic update', () => {
  it('removes the cared-for tasks from the list useCareTasks reads before the request settles', async () => {
    const client = makeClient()
    client.setQueryData(
      CARE_TASKS_QUERY_KEY,
      Result.succeed({
        overdue: [task('1', 'a', 'watering'), task('2', 'b', 'fertilizing')],
        today: [task('3', 'b', 'watering')],
        upcoming: [],
        completedToday: 0,
      })
    )
    const wrapper = createQueryWrapper(client)
    const { result: tasks } = renderHook(() => useCareTasks(), { wrapper })

    const { result: careAll } = renderHook(() => useCareAll(), { wrapper })
    await act(async () => {
      careAll.current.mutate({
        payload: { plantIds: ['a', 'b'], careType: 'watering' },
      })
    })

    await waitFor(() => {
      expect(tasks.current.data?.overdue.map((t) => t.id)).toEqual(['2'])
    })
    expect(tasks.current.data?.today).toEqual([])
    expect(tasks.current.data?.completedToday).toBe(2)
  })
})
