import type {
  PlantDetail,
  PlantPhoto,
  PlantPhotosListResponse,
} from '@lily/shared'
import { Either } from 'effect'
import type { ApiResult } from '@/utils/client'
import {
  addPhotoToDetail,
  addPhotoToList,
  DETAIL_PHOTO_CAP,
  isTempPhotoId,
  makeTempPhoto,
  plantDetailKey,
  plantPhotosKey,
  removePhotoFromDetail,
  removePhotoFromList,
  replacePhotoInDetail,
  replacePhotoInList,
} from '../plant-cache'

const photo = (id: string, takenAtIso: string): PlantPhoto => ({
  id,
  url: `https://example.com/${id}.jpg`,
  takenAt: new Date(takenAtIso),
  plantId: 'plant-1',
})

const detailResult = (photos: PlantPhoto[]): ApiResult<PlantDetail> =>
  Either.right({ id: 'plant-1', photos } as unknown as PlantDetail)

const listResult = (
  items: PlantPhoto[],
  total: number
): ApiResult<PlantPhotosListResponse> =>
  Either.right({ items, total, page: 1, limit: 100, hasMore: false })

const unwrap = <T>(result: ApiResult<T> | undefined): T => {
  if (!result) throw new Error('expected a defined cache value')
  return Either.getOrThrow(result)
}

describe('plant-cache keys', () => {
  it('builds the exact getPlant key', () => {
    expect(plantDetailKey('abc')).toEqual([
      'plants',
      'getPlant',
      { path: { id: 'abc' } },
    ])
  })

  it('builds the exact getPlantPhotos key with string page/limit', () => {
    expect(plantPhotosKey('abc')).toEqual([
      'plants',
      'getPlantPhotos',
      { path: { id: 'abc' }, urlParams: { page: '1', limit: '100' } },
    ])
  })
})

describe('makeTempPhoto / isTempPhotoId', () => {
  it('creates a temp photo from a local uri', () => {
    const temp = makeTempPhoto('plant-1', 'file:///local/photo.jpg')
    expect(temp.url).toBe('file:///local/photo.jpg')
    expect(temp.plantId).toBe('plant-1')
    expect(isTempPhotoId(temp.id)).toBe(true)
  })

  it('does not flag server ids as temp', () => {
    expect(isTempPhotoId('real-uuid-123')).toBe(false)
  })
})

describe('detail cache transforms', () => {
  it('prepends a photo to the detail cache', () => {
    const result = addPhotoToDetail(
      detailResult([photo('a', '2025-01-01T00:00:00Z')]),
      photo('new', '2025-02-01T00:00:00Z')
    )
    expect(unwrap(result).photos.map((p) => p.id)).toEqual(['new', 'a'])
  })

  it('caps the detail cache so a full list stays at the cap with the new photo first', () => {
    const full = Array.from({ length: DETAIL_PHOTO_CAP }, (_, i) =>
      photo(`p${i}`, `2025-01-${String(i + 1).padStart(2, '0')}T00:00:00Z`)
    )
    const result = addPhotoToDetail(
      detailResult(full),
      photo('new', '2025-06-01T00:00:00Z')
    )
    const photos = unwrap(result).photos
    expect(photos).toHaveLength(DETAIL_PHOTO_CAP)
    expect(photos[0]?.id).toBe('new')
    // The formerly-oldest photo is dropped to keep the cap.
    expect(photos.map((p) => p.id)).not.toContain(`p${DETAIL_PHOTO_CAP - 1}`)
  })

  it('removes a photo from the detail cache by id', () => {
    const result = removePhotoFromDetail(
      detailResult([
        photo('a', '2025-01-01T00:00:00Z'),
        photo('b', '2025-01-02T00:00:00Z'),
      ]),
      'a'
    )
    expect(unwrap(result).photos.map((p) => p.id)).toEqual(['b'])
  })

  it('returns undefined when there is no cached detail', () => {
    expect(
      addPhotoToDetail(undefined, photo('x', '2025-01-01T00:00:00Z'))
    ).toBeUndefined()
    expect(removePhotoFromDetail(undefined, 'x')).toBeUndefined()
  })
})

describe('photos list cache transforms', () => {
  it('prepends a photo and bumps the total', () => {
    const result = addPhotoToList(
      listResult([photo('a', '2025-01-01T00:00:00Z')], 1),
      photo('new', '2025-02-01T00:00:00Z')
    )
    const response = unwrap(result)
    expect(response.items.map((p) => p.id)).toEqual(['new', 'a'])
    expect(response.total).toBe(2)
  })

  it('removes a photo and decrements the total', () => {
    const result = removePhotoFromList(
      listResult(
        [
          photo('a', '2025-01-01T00:00:00Z'),
          photo('b', '2025-01-02T00:00:00Z'),
        ],
        2
      ),
      'a'
    )
    const response = unwrap(result)
    expect(response.items.map((p) => p.id)).toEqual(['b'])
    expect(response.total).toBe(1)
  })

  it('never lets the total go below zero', () => {
    const result = removePhotoFromList(
      listResult([photo('a', '2025-01-01T00:00:00Z')], 0),
      'a'
    )
    expect(unwrap(result).total).toBe(0)
  })
})

describe('replace transforms (flash-free reconcile)', () => {
  const real = photo('real-1', '2025-06-01T00:00:00Z')

  it('swaps the temp photo for the persisted one in the detail cache, preserving position', () => {
    const result = replacePhotoInDetail(
      detailResult([
        photo('temp-9', '2025-06-01T00:00:00Z'),
        photo('a', '2025-01-01T00:00:00Z'),
      ]),
      'temp-9',
      real
    )
    const photos = unwrap(result).photos
    expect(photos.map((p) => p.id)).toEqual(['real-1', 'a'])
  })

  it('swaps the temp photo in the list cache without changing the total', () => {
    const result = replacePhotoInList(
      listResult(
        [
          photo('temp-9', '2025-06-01T00:00:00Z'),
          photo('a', '2025-01-01T00:00:00Z'),
        ],
        2
      ),
      'temp-9',
      real
    )
    const response = unwrap(result)
    expect(response.items.map((p) => p.id)).toEqual(['real-1', 'a'])
    expect(response.total).toBe(2)
  })

  it('leaves the caches untouched when the temp id is absent', () => {
    const result = replacePhotoInList(
      listResult([photo('a', '2025-01-01T00:00:00Z')], 1),
      'temp-missing',
      real
    )
    expect(unwrap(result).items.map((p) => p.id)).toEqual(['a'])
  })
})
