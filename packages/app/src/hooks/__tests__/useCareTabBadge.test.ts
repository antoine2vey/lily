import { QueryClient } from '@tanstack/react-query'
import { renderHook } from '@testing-library/react-native'
import { Either } from 'effect'
import { createQueryWrapper } from '@/__tests__/utils/query-helpers'

// Stub the fetcher so an unseeded mount doesn't hit the network.
jest.mock('@/utils/client', () => {
  const actual = jest.requireActual('@/utils/client')
  const { Either: ActualEither } = jest.requireActual('effect')
  return {
    ...actual,
    runApiEffect: jest.fn(async () =>
      ActualEither.right({
        overdue: [],
        today: [],
        upcoming: [],
        completedToday: 0,
      })
    ),
  }
})

import { useCareTabBadge } from '../useCareTabBadge'

const CARE_TASKS_QUERY_KEY = ['careTasks', 'getCareTasks', {}]

const task = (id: string) => ({ id })

// staleTime: Infinity so seeded data is treated as fresh (no refetch overwrites it).
const makeClient = () =>
  new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        gcTime: Number.POSITIVE_INFINITY,
        staleTime: Number.POSITIVE_INFINITY,
      },
    },
  })

const seed = (client: QueryClient, overdue: number, today: number) =>
  client.setQueryData(
    CARE_TASKS_QUERY_KEY,
    Either.right({
      overdue: Array.from({ length: overdue }, (_, i) => task(`o${i}`)),
      today: Array.from({ length: today }, (_, i) => task(`t${i}`)),
      upcoming: [],
      completedToday: 0,
    })
  )

describe('useCareTabBadge', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe('numeric mode (withCount: true) — Android / non-Liquid-Glass iOS', () => {
    it('returns the exact count when there are tasks', () => {
      const client = makeClient()
      seed(client, 2, 1)

      const { result } = renderHook(() => useCareTabBadge(true), {
        wrapper: createQueryWrapper(client),
      })

      expect(result.current).toEqual({ visible: true, count: 3 })
    })

    it('is not visible when there are no overdue/today tasks', () => {
      const client = makeClient()
      seed(client, 0, 0)

      const { result } = renderHook(() => useCareTabBadge(true), {
        wrapper: createQueryWrapper(client),
      })

      expect(result.current).toEqual({ visible: false, count: 0 })
    })

    it('falls back to count 0 / not visible on a Left (error)', () => {
      const client = makeClient()
      client.setQueryData(CARE_TASKS_QUERY_KEY, Either.left({ _tag: 'Err' }))

      const { result } = renderHook(() => useCareTabBadge(true), {
        wrapper: createQueryWrapper(client),
      })

      expect(result.current).toEqual({ visible: false, count: 0 })
    })
  })

  describe('dot mode (withCount: false) — iOS Liquid Glass', () => {
    it('is visible with a null count (dot only) when there are tasks', () => {
      const client = makeClient()
      seed(client, 5, 0)

      const { result } = renderHook(() => useCareTabBadge(false), {
        wrapper: createQueryWrapper(client),
      })

      expect(result.current).toEqual({ visible: true, count: null })
    })

    it('is not visible (and count stays null) when there are no tasks', () => {
      const client = makeClient()
      seed(client, 0, 0)

      const { result } = renderHook(() => useCareTabBadge(false), {
        wrapper: createQueryWrapper(client),
      })

      expect(result.current).toEqual({ visible: false, count: null })
    })

    it('never exposes a count even with tasks present', () => {
      const client = makeClient()
      seed(client, 24, 3)

      const { result } = renderHook(() => useCareTabBadge(false), {
        wrapper: createQueryWrapper(client),
      })

      expect(result.current.count).toBeNull()
      expect(result.current.visible).toBe(true)
    })
  })

  it('defaults to not visible before any data is available', () => {
    const client = makeClient()

    const numeric = renderHook(() => useCareTabBadge(true), {
      wrapper: createQueryWrapper(client),
    })
    expect(numeric.result.current).toEqual({ visible: false, count: 0 })

    const dot = renderHook(() => useCareTabBadge(false), {
      wrapper: createQueryWrapper(makeClient()),
    })
    expect(dot.result.current).toEqual({ visible: false, count: null })
  })
})
