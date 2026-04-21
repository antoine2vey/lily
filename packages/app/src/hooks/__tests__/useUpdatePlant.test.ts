import { act, renderHook } from '@testing-library/react-native'
import { createQueryWrapper } from '@/__tests__/utils/query-helpers'

// Mock upload utility
jest.mock('@/utils/upload', () => ({
  createFileFromUri: jest.fn((uri: string) => ({
    uri,
    name: 'photo.jpg',
    type: 'image/jpeg',
  })),
  isLocalFileUri: (value: unknown): value is string =>
    typeof value === 'string' && value.startsWith('file://'),
  uploadMultipart: jest.fn().mockResolvedValue({}),
}))

import { createFileFromUri, uploadMultipart } from '@/utils/upload'
import { useUpdatePlant } from '../useUpdatePlant'

const mockedUploadMultipart = uploadMultipart as jest.MockedFunction<
  typeof uploadMultipart
>
const mockedCreateFileFromUri = createFileFromUri as jest.MockedFunction<
  typeof createFileFromUri
>

describe('useUpdatePlant', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('returns mutation functions', () => {
    const { result } = renderHook(() => useUpdatePlant(), {
      wrapper: createQueryWrapper(),
    })

    expect(typeof result.current.mutate).toBe('function')
    expect(typeof result.current.mutateAsync).toBe('function')
  })

  it('sends JSON data field via multipart PUT', async () => {
    mockedUploadMultipart.mockResolvedValue({})

    const { result } = renderHook(() => useUpdatePlant(), {
      wrapper: createQueryWrapper(),
    })

    await act(async () => {
      await result.current.mutateAsync({
        path: { id: 'plant-1' },
        payload: { name: 'Updated', wateringFrequencyDays: 7 },
      })
    })

    expect(mockedUploadMultipart).toHaveBeenCalledWith(
      '/api/plants/plant-1',
      [],
      'image',
      { data: JSON.stringify({ name: 'Updated', wateringFrequencyDays: 7 }) },
      'PUT'
    )
  })

  it('uploads local file:// image as multipart file', async () => {
    mockedUploadMultipart.mockResolvedValue({})

    const { result } = renderHook(() => useUpdatePlant(), {
      wrapper: createQueryWrapper(),
    })

    await act(async () => {
      await result.current.mutateAsync({
        path: { id: 'plant-1' },
        payload: {
          name: 'Updated',
          imageUrl: 'file:///var/mobile/photo.jpg',
        },
      })
    })

    expect(mockedCreateFileFromUri).toHaveBeenCalledWith(
      'file:///var/mobile/photo.jpg',
      expect.objectContaining({ type: 'image/jpeg' })
    )
    expect(mockedUploadMultipart).toHaveBeenCalledWith(
      '/api/plants/plant-1',
      [expect.objectContaining({ uri: 'file:///var/mobile/photo.jpg' })],
      'image',
      { data: JSON.stringify({ name: 'Updated' }) },
      'PUT'
    )
  })

  it('passes GCS URL as imageUrl in data field without uploading', async () => {
    mockedUploadMultipart.mockResolvedValue({})

    const { result } = renderHook(() => useUpdatePlant(), {
      wrapper: createQueryWrapper(),
    })

    await act(async () => {
      await result.current.mutateAsync({
        path: { id: 'plant-1' },
        payload: {
          name: 'Updated',
          imageUrl: 'https://storage.googleapis.com/photo.jpg',
        },
      })
    })

    expect(mockedCreateFileFromUri).not.toHaveBeenCalled()
    expect(mockedUploadMultipart).toHaveBeenCalledWith(
      '/api/plants/plant-1',
      [],
      'image',
      {
        data: JSON.stringify({
          name: 'Updated',
          imageUrl: 'https://storage.googleapis.com/photo.jpg',
        }),
      },
      'PUT'
    )
  })
})
