import type { CareType } from '@lily/shared'
import { QueryClient } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react-native'
import { Result } from 'effect'
import { mockCareTask, mockCareTasksResponse } from '@/__tests__/fixtures'
import { createQueryWrapper } from '@/__tests__/utils/query-helpers'

// The request the mocked careMultiplePlants sends. Pending unless a test
// replaces it.
const pendingRequest = () => new Promise(() => {})
let mockRequest: () => Promise<unknown> = pendingRequest
afterEach(() => {
  mockRequest = pendingRequest
})

jest.mock('@/utils/client', () => {
  const actual = jest.requireActual('@/utils/client')
  const rq = jest.requireActual('@tanstack/react-query')
  return {
    ...actual,
    useEffectMutation: (_section: string, _method: string, options: object) =>
      rq.useMutation({
        mutationFn: () => mockRequest(),
        ...options,
      }),
  }
})

import { useCareAll } from '../useCareAll'
import { CARE_TASKS_QUERY_KEY, useCareTasks } from '../useCareTasks'

const task = (id: string, plantId: string, type: CareType) =>
  mockCareTask(id, { plantId, type })

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
      Result.succeed(
        mockCareTasksResponse({
          overdue: [
            task('1', 'a', 'watering'),
            task('2', 'b', 'fertilization'),
          ],
          today: [task('3', 'b', 'watering')],
        })
      )
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

  it('restores the tasks when the request fails', async () => {
    mockRequest = () => Promise.reject(new Error('careMultiplePlants failed'))
    const seeded = Result.succeed(
      mockCareTasksResponse({
        overdue: [task('1', 'a', 'watering')],
        today: [task('3', 'b', 'watering')],
      })
    )
    const client = makeClient()
    client.setQueryData(CARE_TASKS_QUERY_KEY, seeded)
    const { result: careAll } = renderHook(() => useCareAll(), {
      wrapper: createQueryWrapper(client),
    })

    act(() => {
      careAll.current.mutate({
        payload: { plantIds: ['a', 'b'], careType: 'watering' },
      })
    })

    await waitFor(() => expect(careAll.current.isError).toBe(true))
    expect(client.getQueryData(CARE_TASKS_QUERY_KEY)).toEqual(seeded)
  })
})
