import { API_PREFIX } from '@lily/shared'
import { act } from '@testing-library/react-native'
import { DateTime } from 'effect'
import { renderQueryHook } from '@/__tests__/utils/query-helpers'
import { apiEffectRunner } from '@/utils/client'
import { UploadError, uploadMultipart } from '@/utils/upload'
import { useSaveCareLog } from '../useSaveCareLog'

// Mock the client
jest.mock('@/utils/client', () => ({
  apiEffectRunner: jest.fn(),
}))

jest.mock('@/utils/upload', () => ({
  ...jest.requireActual('@/utils/upload'),
  uploadMultipart: jest.fn(),
}))

const utc = (iso: string) => DateTime.toDateUtc(DateTime.makeUnsafe(iso))
const pickedPhoto = 'file:///var/mobile/Containers/Data/tmp/photo.jpg'
const careWithPhoto = {
  plantIds: ['plant-1', 'plant-2'],
  type: 'watering' as const,
  date: utc('2026-03-14T00:00:00Z'),
  time: utc('2000-01-01T09:45:30Z'),
  notes: 'Deep soak',
  photoUri: pickedPhoto,
}

describe('useSaveCareLog', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('logs on the picked day at the picked time of day', async () => {
    jest.mocked(apiEffectRunner).mockResolvedValue({} as never)
    const { result } = renderQueryHook(() => useSaveCareLog())

    await act(async () => {
      await result.current.mutateAsync({
        plantIds: ['plant-1'],
        type: 'watering',
        date: utc('2026-03-14T00:00:00Z'),
        time: utc('2000-01-01T09:45:30Z'),
      })
    })

    expect(apiEffectRunner).toHaveBeenCalledWith('careLogs', 'createCareLog', {
      params: { plantId: 'plant-1' },
      payload: expect.objectContaining({
        date: utc('2026-03-14T09:45:00Z'),
      }),
    })
  })

  it('uploads the picked photo with each care log', async () => {
    jest.mocked(uploadMultipart).mockResolvedValue({})
    const { result } = renderQueryHook(() => useSaveCareLog())

    await act(async () => {
      await result.current.mutateAsync(careWithPhoto)
    })

    const fields = {
      data: JSON.stringify({
        type: 'watering',
        notes: 'Deep soak',
        date: utc('2026-03-14T09:45:00Z'),
      }),
    }
    const file = [expect.objectContaining({ uri: pickedPhoto })]
    expect(jest.mocked(uploadMultipart).mock.calls).toEqual([
      [`${API_PREFIX}/plants/plant-1/logs`, file, 'image', fields],
      [`${API_PREFIX}/plants/plant-2/logs`, file, 'image', fields],
    ])
    expect(apiEffectRunner).not.toHaveBeenCalled()
  })

  it('fails when the API refuses the photo', async () => {
    jest
      .mocked(uploadMultipart)
      .mockRejectedValue(new UploadError('Not an image', undefined, 400))
    const { result } = renderQueryHook(() => useSaveCareLog())

    await expect(
      act(() =>
        result.current.mutateAsync({ ...careWithPhoto, plantIds: ['plant-1'] })
      )
    ).rejects.toBeDefined()
    expect(apiEffectRunner).not.toHaveBeenCalled()
  })
})
