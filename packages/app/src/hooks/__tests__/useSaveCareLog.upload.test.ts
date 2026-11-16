import { act } from '@testing-library/react-native'
import { DateTime } from 'effect'
import { renderQueryHook } from '@/__tests__/utils/query-helpers'
import { apiEffectRunner } from '@/utils/client'
import { useSaveCareLog } from '../useSaveCareLog'

jest.mock('@/utils/client', () => ({
  ...jest.requireActual('@/utils/client'),
  apiEffectRunner: jest.fn(),
}))

const utc = (iso: string) => DateTime.toDateUtc(DateTime.makeUnsafe(iso))
const pickedPhoto = 'file:///var/mobile/Containers/Data/tmp/photo.jpg'

describe('useSaveCareLog through the real upload', () => {
  const originalFetch = global.fetch

  afterEach(() => {
    global.fetch = originalFetch
  })

  const saveAgainst = async (status: number, body: string) => {
    global.fetch = jest.fn(async (url: string) =>
      url.startsWith('file://')
        ? ({ arrayBuffer: async () => new Uint8Array([1]).buffer } as Response)
        : new Response(body, { status })
    ) as unknown as typeof fetch
    jest
      .mocked(apiEffectRunner)
      .mockReset()
      .mockResolvedValue({} as never)
    const { result } = renderQueryHook(() => useSaveCareLog())

    const outcome = await act(() =>
      result.current
        .mutateAsync({
          plantIds: ['plant-1'],
          type: 'watering',
          date: utc('2026-03-14T00:00:00Z'),
          time: utc('2000-01-01T09:45:30Z'),
          photoUri: pickedPhoto,
        })
        .then(
          () => 'saved',
          () => 'failed'
        )
    )
    return {
      outcome,
      sentAsJson: jest.mocked(apiEffectRunner).mock.calls,
    }
  }

  it('sends the path as JSON when the API answers 415 to the upload', async () => {
    expect(
      await saveAgainst(415, 'Unsupported content-type: multipart/form-data')
    ).toEqual({
      outcome: 'saved',
      sentAsJson: [
        [
          'careLogs',
          'createCareLog',
          expect.objectContaining({
            payload: expect.objectContaining({ photoUrl: pickedPhoto }),
          }),
        ],
      ],
    })
  })

  it.each([
    ['a plain 400', ''],
    [
      'a typed 400',
      JSON.stringify({ _tag: 'InvalidImageError', message: 'Not an image' }),
    ],
  ])(
    'fails without a JSON request when the API answers %s',
    async (_case, body) => {
      expect(await saveAgainst(400, body)).toEqual({
        outcome: 'failed',
        sentAsJson: [],
      })
    }
  )
})
