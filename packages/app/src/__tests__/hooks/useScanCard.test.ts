import { act, renderHook, waitFor } from '@testing-library/react-native'
import { createQueryWrapper } from 'src/__tests__/utils/query-helpers'
import { useScanCard, useScanCardMultiple } from 'src/hooks/useScanCard'

// Mock upload utilities
const mockUploadMultipart = jest.fn()
const mockCreateFileFromUri = jest.fn()

jest.mock('@/utils/upload', () => ({
  uploadMultipart: (...args: unknown[]) => mockUploadMultipart(...args),
  createFileFromUri: (...args: unknown[]) => mockCreateFileFromUri(...args),
}))

// Mock shared utilities
jest.mock('@lily/shared', () => ({
  nowAsEpochMillis: () => 1705312800000,
}))

describe('useScanCard', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockCreateFileFromUri.mockImplementation((uri, options) => ({
      uri,
      name: options?.name ?? 'photo.jpg',
      type: options?.type ?? 'image/jpeg',
    }))
  })

  describe('mutation configuration', () => {
    it('should return mutation object with correct properties', () => {
      const { result } = renderHook(() => useScanCard(), {
        wrapper: createQueryWrapper(),
      })

      expect(result.current).toHaveProperty('mutate')
      expect(result.current).toHaveProperty('mutateAsync')
      expect(result.current).toHaveProperty('isPending')
      expect(result.current).toHaveProperty('isSuccess')
      expect(result.current).toHaveProperty('isError')
      expect(result.current).toHaveProperty('data')
      expect(result.current).toHaveProperty('error')
    })

    it('should start with idle state', () => {
      const { result } = renderHook(() => useScanCard(), {
        wrapper: createQueryWrapper(),
      })

      expect(result.current.isPending).toBe(false)
      expect(result.current.isSuccess).toBe(false)
      expect(result.current.isError).toBe(false)
    })
  })

  describe('mutation execution', () => {
    it('should create file with correct parameters', async () => {
      const mockResult = {
        plantName: 'Monstera',
        scientificName: 'Monstera deliciosa',
        confidence: 0.95,
      }
      mockUploadMultipart.mockResolvedValue(mockResult)

      const { result } = renderHook(() => useScanCard(), {
        wrapper: createQueryWrapper(),
      })

      await act(async () => {
        await result.current.mutateAsync('file://photo.jpg')
      })

      expect(mockCreateFileFromUri).toHaveBeenCalledWith('file://photo.jpg', {
        name: 'scan-card-1705312800000.jpg',
        type: 'image/jpeg',
      })
    })

    it('should call uploadMultipart with correct endpoint', async () => {
      const mockResult = {
        plantName: 'Monstera',
        scientificName: 'Monstera deliciosa',
        confidence: 0.95,
      }
      mockUploadMultipart.mockResolvedValue(mockResult)

      const { result } = renderHook(() => useScanCard(), {
        wrapper: createQueryWrapper(),
      })

      await act(async () => {
        await result.current.mutateAsync('file://photo.jpg')
      })

      expect(mockUploadMultipart).toHaveBeenCalledWith(
        '/api/plants/scan-card',
        expect.any(Array),
        'images',
        expect.objectContaining({ locale: expect.any(String) })
      )
    })

    it('should return identification result on success', async () => {
      const mockResult = {
        name: 'Monstera',
        family: 'Araceae',
        confidence: 0.95,
        alternatives: [],
        wateringFrequencyDays: 7,
        luxNeeded: 2000,
        humidityRating: 3,
        petToxicityRating: 2,
        fertilizationFrequencyDays: 30,
        category: 'Tropical',
        description: 'A beautiful tropical plant',
        imageUrl: 'https://example.com/monstera.jpg',
      }
      mockUploadMultipart.mockResolvedValue(mockResult)

      const { result } = renderHook(() => useScanCard(), {
        wrapper: createQueryWrapper(),
      })

      let returnedData: unknown

      await act(async () => {
        returnedData = await result.current.mutateAsync('file://photo.jpg')
      })

      expect(returnedData).toEqual(mockResult)

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true)
      })
    })

    it('should handle upload error', async () => {
      const mockError = new Error('Upload failed')
      mockUploadMultipart.mockRejectedValue(mockError)

      const { result } = renderHook(() => useScanCard(), {
        wrapper: createQueryWrapper(),
      })

      await act(async () => {
        try {
          await result.current.mutateAsync('file://photo.jpg')
        } catch {
          // Expected error
        }
      })

      await waitFor(() => {
        expect(result.current.isError).toBe(true)
      })
    })
  })
})

describe('useScanCardMultiple', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockCreateFileFromUri.mockImplementation((uri, options) => ({
      uri,
      name: options?.name ?? 'photo.jpg',
      type: options?.type ?? 'image/jpeg',
    }))
  })

  describe('mutation execution', () => {
    it('should create files for each photo URI', async () => {
      const mockResult = {
        plantName: 'Monstera',
        scientificName: 'Monstera deliciosa',
      }
      mockUploadMultipart.mockResolvedValue(mockResult)

      const { result } = renderHook(() => useScanCardMultiple(), {
        wrapper: createQueryWrapper(),
      })

      const photoUris = [
        'file://photo1.jpg',
        'file://photo2.jpg',
        'file://photo3.jpg',
      ]

      await act(async () => {
        await result.current.mutateAsync(photoUris)
      })

      expect(mockCreateFileFromUri).toHaveBeenCalledTimes(3)
      expect(mockCreateFileFromUri).toHaveBeenCalledWith('file://photo1.jpg', {
        name: 'scan-card-1705312800000-0.jpg',
        type: 'image/jpeg',
      })
      expect(mockCreateFileFromUri).toHaveBeenCalledWith('file://photo2.jpg', {
        name: 'scan-card-1705312800000-1.jpg',
        type: 'image/jpeg',
      })
      expect(mockCreateFileFromUri).toHaveBeenCalledWith('file://photo3.jpg', {
        name: 'scan-card-1705312800000-2.jpg',
        type: 'image/jpeg',
      })
    })

    it('should call uploadMultipart with multiple files endpoint', async () => {
      const mockResult = {
        plantName: 'Monstera',
        scientificName: 'Monstera deliciosa',
      }
      mockUploadMultipart.mockResolvedValue(mockResult)

      const { result } = renderHook(() => useScanCardMultiple(), {
        wrapper: createQueryWrapper(),
      })

      await act(async () => {
        await result.current.mutateAsync([
          'file://photo1.jpg',
          'file://photo2.jpg',
        ])
      })

      expect(mockUploadMultipart).toHaveBeenCalledWith(
        '/api/plants/scan-card-multiple',
        expect.any(Array),
        'images',
        expect.objectContaining({ locale: expect.any(String) })
      )

      // Verify all files are passed
      const filesArg = mockUploadMultipart.mock.calls[0][1]
      expect(filesArg).toHaveLength(2)
    })

    it('should handle empty array', async () => {
      const mockResult = {
        plantName: 'Unknown',
      }
      mockUploadMultipart.mockResolvedValue(mockResult)

      const { result } = renderHook(() => useScanCardMultiple(), {
        wrapper: createQueryWrapper(),
      })

      await act(async () => {
        await result.current.mutateAsync([])
      })

      expect(mockCreateFileFromUri).not.toHaveBeenCalled()
      expect(mockUploadMultipart).toHaveBeenCalledWith(
        '/api/plants/scan-card-multiple',
        [],
        'images',
        expect.objectContaining({ locale: expect.any(String) })
      )
    })

    it('should return combined identification result', async () => {
      const mockResult = {
        name: 'Monstera',
        family: 'Araceae',
        confidence: 0.98,
        alternatives: [],
        wateringFrequencyDays: 7,
        luxNeeded: 2000,
        humidityRating: 3,
        petToxicityRating: 2,
        fertilizationFrequencyDays: 30,
        category: 'Tropical',
        description: 'A beautiful tropical plant',
        imageUrl: 'https://example.com/monstera.jpg',
      }
      mockUploadMultipart.mockResolvedValue(mockResult)

      const { result } = renderHook(() => useScanCardMultiple(), {
        wrapper: createQueryWrapper(),
      })

      let returnedData: unknown

      await act(async () => {
        returnedData = await result.current.mutateAsync([
          'file://front.jpg',
          'file://back.jpg',
        ])
      })

      expect(returnedData).toEqual(mockResult)

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true)
      })
    })
  })
})
