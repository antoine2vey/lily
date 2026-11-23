import { Plant, PlantsListResponse } from '@lily/shared'
import { act, waitFor } from '@testing-library/react-native'
import { Schema } from 'effect'
import { mockPlants } from '@/__tests__/fixtures'
import {
  ok,
  type Reply,
  type SentRequest,
  stubApi,
} from '@/__tests__/utils/fake-api'
import {
  afterApiRequest,
  renderQueryHook,
} from '@/__tests__/utils/query-helpers'
import { useAchievements } from '../useAchievements'
import { useCareTasks } from '../useCareTasks'
import { useCreatePlant } from '../useCreatePlant'
import { useDeadPlants } from '../useDeadPlants'
import { useDeletePlant } from '../useDeletePlant'
import { useMarkPlantDead } from '../useMarkPlantDead'
import { usePlants } from '../usePlants'
import { useRecentActivities } from '../useRecentActivities'
import { useRevivePlant } from '../useRevivePlant'

const MONSTERA = '6f1c2a3b-4d5e-4f60-8a7b-9c0d1e2f3a4b'
const POTHOS = '0d9e8f7a-6b5c-4d3e-8f2a-1b0c9d8e7f6a'
const FERN = '3a2b1c0d-9e8f-4a7b-8c6d-5e4f3a2b1c0d'

const plant = (
  id: string,
  name: string,
  diedAt: Date | null = null
): Plant => ({
  ...mockPlants[0]!,
  id,
  name,
  diedAt,
  deathCause: diedAt === null ? null : 'overwatering',
})

const encodeList = Schema.encodeSync(PlantsListResponse)
const encodePlant = Schema.encodeSync(Plant)

/**
 * The plants API over a list of rows: `getPlants` answers from the rows and
 * the plant writes change them. Any other request (care tasks, recent
 * activity, achievements) gets an empty answer, and the test only checks
 * that it was sent again after the write.
 */
const fakePlantsApi = (initial: ReadonlyArray<Plant>) => {
  let rows = initial
  const update = (id: string, change: (row: Plant) => Plant | null) => {
    const row = rows.find((candidate) => candidate.id === id)
    if (!row) return { status: 404, body: { _tag: 'PlantNotFoundError' } }
    const next = change(row)
    rows = rows.flatMap((candidate) =>
      candidate.id !== id ? [candidate] : next === null ? [] : [next]
    )
    return ok(encodePlant(next ?? row))
  }
  const page = (items: ReadonlyArray<Plant>) =>
    ok(
      encodeList({
        items,
        total: items.length,
        page: 1,
        limit: 100,
        hasMore: false,
      })
    )

  return stubApi(({ method, path, query, body }: SentRequest): Reply => {
    const id = path.split('/')[2] ?? ''
    if (method === 'GET' && path === '/plants') {
      return page(
        rows.filter(
          (row) => (query.filter === 'dead') === (row.diedAt !== null)
        )
      )
    }
    if (method === 'POST' && path === '/plants') {
      const created = plant(FERN, (body as { name: string }).name)
      rows = [...rows, created]
      return { status: 201, body: encodePlant(created) }
    }
    if (method === 'DELETE' && path === `/plants/${id}`) {
      return update(id, () => null)
    }
    if (method === 'POST' && path === `/plants/${id}/death`) {
      return update(id, (row) => ({ ...row, diedAt: new Date('2026-11-20') }))
    }
    if (method === 'DELETE' && path === `/plants/${id}/death`) {
      return update(id, (row) => ({ ...row, diedAt: null }))
    }
    return ok({})
  })
}

const renderPlantScreens = <M>(useWrite: () => M) =>
  renderQueryHook(() => ({
    alive: usePlants().data?.items.map((row) => row.name),
    dead: useDeadPlants().plants.map((row) => row.name),
    careTasks: useCareTasks(),
    recentActivity: useRecentActivities(),
    achievements: useAchievements(),
    write: useWrite(),
  }))

const isWrite = (request: SentRequest) => request.method !== 'GET'

const writesOf = (sent: ReadonlyArray<SentRequest>) =>
  sent.filter(isWrite).map(({ method, path, body }) => ({ method, path, body }))

const rereadAfterWrite = (sent: ReadonlyArray<SentRequest>) =>
  sent
    .slice(sent.findIndex(isWrite) + 1)
    .filter((request) => request.method === 'GET' && request.path !== '/plants')
    .map((request) => request.path)

const CARE_SCREENS = ['/care-tasks', '/care-logs/recent']

describe('plant lifecycle writes', () => {
  it('creates the plant and shows it in the plant list', async () => {
    const api = fakePlantsApi([plant(MONSTERA, 'Monstera')])
    const { result } = renderPlantScreens(useCreatePlant)
    await waitFor(
      () => expect(result.current.alive).toEqual(['Monstera']),
      afterApiRequest
    )

    const payload = {
      name: 'Fern',
      wateringFrequencyDays: 5,
      luxNeeded: 1000,
      petToxicityRating: 1,
    }
    await act(() => result.current.write.mutateAsync({ payload }))

    expect(writesOf(api.sent)).toEqual([
      { method: 'POST', path: '/plants', body: payload },
    ])
    await waitFor(
      () => expect(result.current.alive).toEqual(['Monstera', 'Fern']),
      afterApiRequest
    )
    expect(rereadAfterWrite(api.sent)).toEqual(
      expect.arrayContaining(CARE_SCREENS)
    )
  })

  it('deletes the plant and drops it from every screen that lists it', async () => {
    const api = fakePlantsApi([
      plant(MONSTERA, 'Monstera'),
      plant(POTHOS, 'Pothos'),
    ])
    const { result } = renderPlantScreens(useDeletePlant)
    await waitFor(
      () => expect(result.current.alive).toEqual(['Monstera', 'Pothos']),
      afterApiRequest
    )

    await act(() =>
      result.current.write.mutateAsync({ params: { id: MONSTERA } })
    )

    expect(writesOf(api.sent)).toEqual([
      { method: 'DELETE', path: `/plants/${MONSTERA}`, body: undefined },
    ])
    await waitFor(
      () => expect(result.current.alive).toEqual(['Pothos']),
      afterApiRequest
    )
    expect(rereadAfterWrite(api.sent)).toEqual(
      expect.arrayContaining([...CARE_SCREENS, '/achievements'])
    )
  })

  it('moves a plant marked dead from the plant list to the cemetery', async () => {
    const api = fakePlantsApi([
      plant(MONSTERA, 'Monstera'),
      plant(POTHOS, 'Pothos'),
    ])
    const { result } = renderPlantScreens(useMarkPlantDead)
    await waitFor(
      () => expect(result.current.alive).toEqual(['Monstera', 'Pothos']),
      afterApiRequest
    )

    await act(() =>
      result.current.write.mutateAsync({
        params: { id: MONSTERA },
        payload: { cause: 'overwatering' },
      })
    )

    expect(writesOf(api.sent)).toEqual([
      {
        method: 'POST',
        path: `/plants/${MONSTERA}/death`,
        body: { cause: 'overwatering' },
      },
    ])
    await waitFor(() => {
      expect(result.current.alive).toEqual(['Pothos'])
      expect(result.current.dead).toEqual(['Monstera'])
    }, afterApiRequest)
    expect(rereadAfterWrite(api.sent)).toEqual(
      expect.arrayContaining(CARE_SCREENS)
    )
  })

  it('brings a revived plant back from the cemetery to the plant list', async () => {
    const api = fakePlantsApi([
      plant(MONSTERA, 'Monstera', new Date('2026-11-01')),
      plant(POTHOS, 'Pothos'),
    ])
    const { result } = renderPlantScreens(useRevivePlant)
    await waitFor(
      () => expect(result.current.dead).toEqual(['Monstera']),
      afterApiRequest
    )

    await act(() =>
      result.current.write.mutateAsync({ params: { id: MONSTERA } })
    )

    expect(writesOf(api.sent)).toEqual([
      { method: 'DELETE', path: `/plants/${MONSTERA}/death`, body: undefined },
    ])
    await waitFor(() => {
      expect(result.current.alive).toEqual(['Monstera', 'Pothos'])
      expect(result.current.dead).toEqual([])
    }, afterApiRequest)
    expect(rereadAfterWrite(api.sent)).toEqual(
      expect.arrayContaining(CARE_SCREENS)
    )
  })
})
