import { Plant, PlantsListResponse } from '@lily/shared'
import { act, waitFor } from '@testing-library/react-native'
import { Result, Schema } from 'effect'
import { mockPlants } from '@/__tests__/fixtures'
import { ok, type SentRequest, stubApi } from '@/__tests__/utils/fake-api'
import {
  afterApiRequest,
  createCacheTestQueryClient,
  renderQueryHook,
} from '@/__tests__/utils/query-helpers'
import { plantDetailKey } from '@/utils/plant-cache'
import { usePlants } from '../usePlants'
import { useUpdatePlant } from '../useUpdatePlant'

const PLANT_ID = '6f1c2a3b-4d5e-4f60-8a7b-9c0d1e2f3a4b'
const monstera: Plant = { ...mockPlants[0]!, id: PLANT_ID, name: 'Monstera' }

const encodeList = Schema.encodeSync(PlantsListResponse)
const encodePlant = Schema.encodeSync(Plant)

/** One plant row: getPlants lists it and a PUT renames it. */
const fakePlantApi = () => {
  let row = monstera
  return stubApi(({ method, body }: SentRequest) => {
    if (method === 'PUT') {
      const [, data] = (body as Array<[string, unknown]>).find(
        ([field]) => field === 'data'
      )!
      row = { ...row, ...JSON.parse(data as string) }
      return ok(encodePlant(row))
    }
    return ok(
      encodeList({ items: [row], total: 1, page: 1, limit: 20, hasMore: false })
    )
  })
}

const writesOf = (sent: ReadonlyArray<SentRequest>) =>
  sent
    .filter((request) => request.method !== 'GET')
    .map(({ method, path, body }) => ({ method, path, body }))

describe('useUpdatePlant', () => {
  it('sends the edit as a multipart PUT and shows it in the plant list', async () => {
    const api = fakePlantApi()
    const { result } = renderQueryHook(() => ({
      names: usePlants().data?.items.map((row) => row.name),
      update: useUpdatePlant(),
    }))
    await waitFor(
      () => expect(result.current.names).toEqual(['Monstera']),
      afterApiRequest
    )

    await act(() =>
      result.current.update.mutateAsync({
        path: { id: PLANT_ID },
        payload: {
          name: 'Swiss cheese plant',
          imageUrl: 'https://storage.googleapis.com/photo.jpg',
        },
      })
    )

    expect(writesOf(api.sent)).toEqual([
      {
        method: 'PUT',
        path: `/plants/${PLANT_ID}`,
        body: [['data', JSON.stringify({ name: 'Swiss cheese plant' })]],
      },
    ])
    await waitFor(
      () => expect(result.current.names).toEqual(['Swiss cheese plant']),
      afterApiRequest
    )
  })

  it('uploads a picked photo as the image part', async () => {
    const api = fakePlantApi()
    const { result } = renderQueryHook(() => useUpdatePlant())

    await act(() =>
      result.current.mutateAsync({
        path: { id: PLANT_ID },
        payload: { name: 'Monstera', imageUrl: 'file:///var/mobile/photo.jpg' },
      })
    )

    expect(writesOf(api.sent)).toEqual([
      {
        method: 'PUT',
        path: `/plants/${PLANT_ID}`,
        body: [
          ['image', 'file'],
          ['data', JSON.stringify({ name: 'Monstera' })],
        ],
      },
    ])
  })

  it('puts the plant detail back when the API refuses the edit', async () => {
    stubApi(() => ({ status: 403, body: { _tag: 'PlantNotAuthorizedError' } }))
    const detail = Result.succeed({ ...monstera, photos: [] })
    const queryClient = createCacheTestQueryClient()
    queryClient.setQueryData(plantDetailKey(PLANT_ID), detail)
    const { result } = renderQueryHook(() => useUpdatePlant(), { queryClient })

    await act(() =>
      result.current
        .mutateAsync({ path: { id: PLANT_ID }, payload: { name: 'Renamed' } })
        .catch(() => undefined)
    )

    expect(queryClient.getQueryData(plantDetailKey(PLANT_ID))).toEqual(detail)
  })
})
