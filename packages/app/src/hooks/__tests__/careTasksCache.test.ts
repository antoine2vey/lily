import { QueryClient } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react-native'
import { Result } from 'effect'
import { createQueryWrapper } from '@/__tests__/utils/query-helpers'

let mockReleaseCare: () => void = () => {}

jest.mock('@/utils/client', () => {
  const actual = jest.requireActual('@/utils/client')
  const { Result: ActualResult } = jest.requireActual('effect')
  return {
    ...actual,
    runApiEffect: jest.fn(async () =>
      ActualResult.succeed({
        overdue: [
          {
            id: 'task-1',
            plantId: 'plant-1',
            plantName: 'Fern',
            plantImageUrl: null,
            type: 'watering',
            completed: false,
            dueDate: new Date('2025-01-01T00:00:00Z'),
          },
        ],
        today: [],
        upcoming: [],
        completedToday: 0,
      })
    ),
    apiEffectRunner: jest.fn(
      () =>
        new Promise<void>((resolve) => {
          mockReleaseCare = resolve
        })
    ),
  }
})

jest.mock('@/utils/rating-prompt', () => ({
  recordPositiveMoment: jest.requireActual('effect').Effect.void,
}))

import { runApiEffect } from '@/utils/client'
import { useCareTabBadge } from '../useCareTabBadge'
import { useCareTasks } from '../useCareTasks'
import { useCompleteTask } from '../useCompleteTask'

const makeClient = () =>
  new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        gcTime: Number.POSITIVE_INFINITY,
        staleTime: Number.POSITIVE_INFINITY,
      },
      mutations: { retry: false },
    },
  })

describe('care tasks cache shared by the task list, the badge and completion', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('fetches the care tasks once for the list and the badge', async () => {
    const wrapper = createQueryWrapper(makeClient())
    const { result } = renderHook(
      () => ({ badge: useCareTabBadge(true), list: useCareTasks() }),
      { wrapper }
    )

    await waitFor(() => expect(result.current.badge.count).toBe(1))
    expect(result.current.list.data?.overdue).toHaveLength(1)
    expect(runApiEffect).toHaveBeenCalledTimes(1)
  })

  it('drops a completed task from the list before the API answers', async () => {
    const wrapper = createQueryWrapper(makeClient())
    const { result } = renderHook(
      () => ({
        badge: useCareTabBadge(true),
        list: useCareTasks(),
        complete: useCompleteTask(),
      }),
      { wrapper }
    )
    await waitFor(() =>
      expect(result.current.list.data?.overdue).toHaveLength(1)
    )

    act(() => {
      result.current.complete.mutate({
        taskId: 'task-1',
        plantId: 'plant-1',
        type: 'watering',
      })
    })

    await waitFor(() => expect(result.current.list.data?.overdue).toEqual([]))
    expect(Result.isSuccess(result.current.list.result!)).toBe(true)
    await act(async () => {
      mockReleaseCare()
    })
  })
})
