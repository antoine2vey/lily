import type { CareTask, CareTasksResponse, CareType } from '@lily/shared'
import { act, renderHook, waitFor } from '@testing-library/react-native'
import { Result } from 'effect'
import {
  createCacheTestQueryClient,
  createQueryWrapper,
} from '@/__tests__/utils/query-helpers'

// Stubbed at the network so the hook runs through the real API client.
const fetchMock = jest.spyOn(globalThis, 'fetch')
afterEach(() => fetchMock.mockReset())

import type { ApiResult } from '@/utils/client'
import { useCarePlant } from '../useCarePlant'
import { CARE_TASKS_QUERY_KEY } from '../useCareTasks'

// The API client rejects ids that are not UUIDs before sending a request.
const plantId = '7c1e9a3b-5d2f-4b6a-9e0c-1f3a5c7e9b21'
const otherPlantId = '2a4c6e8b-0d1f-4e3a-8c5b-7d9f1b3d5e64'

const task = (id: string, plant: string, type: CareType): CareTask => ({
  id,
  plantId: plant,
  plantName: 'Monstera',
  plantImageUrl: null,
  roomName: null,
  roomIcon: null,
  type,
  dueDate: new Date('2026-11-15T09:00:00Z'),
  dueDayOffset: 0,
  localDueDate: '2026-11-15',
  completed: false,
})

const tasks: CareTasksResponse = {
  overdue: [
    task('overdue-water', plantId, 'watering'),
    task('overdue-other', otherPlantId, 'watering'),
  ],
  today: [
    task('today-water', plantId, 'watering'),
    task('today-feed', plantId, 'fertilization'),
  ],
  upcoming: [task('upcoming-water', plantId, 'watering')],
  completedToday: 2,
  windowDays: ['2026-11-16'],
}

const seed = () => {
  const client = createCacheTestQueryClient()
  client.setQueryData(CARE_TASKS_QUERY_KEY, Result.succeed(tasks))
  return client
}

const cachedTasks = (client: ReturnType<typeof seed>) =>
  Result.getOrThrow(
    client.getQueryData(CARE_TASKS_QUERY_KEY) as ApiResult<CareTasksResponse>
  )

const ids = (list: ReadonlyArray<CareTask>) => list.map((t) => t.id)

describe('useCarePlant optimistic update', () => {
  it("removes the plant's due tasks of that care type before the API answers", () => {
    fetchMock.mockReturnValue(new Promise(() => {}))
    const client = seed()
    const { result } = renderHook(useCarePlant, {
      wrapper: createQueryWrapper(client),
    })

    act(() =>
      result.current.mutate({
        params: { id: plantId },
        payload: { careType: 'watering' },
      })
    )

    const cached = cachedTasks(client)
    expect(ids(cached.overdue)).toEqual(['overdue-other'])
    expect(ids(cached.today)).toEqual(['today-feed'])
    expect(ids(cached.upcoming)).toEqual(['upcoming-water'])
    expect(cached.completedToday).toBe(4)
  })

  it('leaves the tasks alone for a backdated log', () => {
    fetchMock.mockReturnValue(new Promise(() => {}))
    const client = seed()
    const { result } = renderHook(useCarePlant, {
      wrapper: createQueryWrapper(client),
    })

    act(() =>
      result.current.mutate({
        params: { id: plantId },
        payload: {
          careType: 'watering',
          date: new Date('2026-11-14T09:00:00Z'),
        },
      })
    )

    expect(cachedTasks(client)).toEqual(tasks)
  })

  it('restores the tasks when the API answers AlreadyCaredTodayError', async () => {
    fetchMock.mockImplementation(
      async () =>
        new Response(
          JSON.stringify({
            _tag: 'AlreadyCaredTodayError',
            careType: 'watering',
            message: 'This care action was already logged today',
          }),
          { status: 409, headers: { 'content-type': 'application/json' } }
        )
    )
    const client = seed()
    const { result } = renderHook(useCarePlant, {
      wrapper: createQueryWrapper(client),
    })

    act(() =>
      result.current.mutate({
        params: { id: plantId },
        payload: { careType: 'watering' },
      })
    )

    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(result.current.error?._tag).toBe('AlreadyCaredTodayError')
    expect(cachedTasks(client)).toEqual(tasks)
  })
})
