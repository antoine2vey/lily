import {
  nowAsDate,
  nowAsEpochMillis,
  type PlantDetail,
  type PlantPhoto,
  type PlantPhotosListResponse,
} from '@lily/shared'
import { Array, Either } from 'effect'
import type { ApiResult } from '@/utils/client'

// Single source of truth for the Growth Journal photo pagination, shared by the
// screen's query and the optimistic cache key so they can never drift.
export const PHOTOS_PAGE = '1'
export const PHOTOS_LIMIT = '100'

// The detail endpoint (find-plant-by-id.ts) returns only the most recent photos.
// Mirror that cap so optimistic prepends match what a refetch returns.
export const DETAIL_PHOTO_CAP = 10

/**
 * Exact React Query keys produced by useEffectQuery (queryKey = [section,
 * method, params]). These MUST match the params objects the screens pass so
 * that optimistic setQueryData writes hit the cached entries.
 */
export const plantDetailKey = (id: string) =>
  ['plants', 'getPlant', { path: { id } }] as const

export const plantPhotosKey = (
  id: string,
  page = PHOTOS_PAGE,
  limit = PHOTOS_LIMIT
) =>
  [
    'plants',
    'getPlantPhotos',
    { path: { id }, urlParams: { page, limit } },
  ] as const

/** Temp photos created optimistically carry this id prefix until the server replies. */
export const TEMP_PHOTO_PREFIX = 'temp-'

export const isTempPhotoId = (id: string): boolean =>
  id.startsWith(TEMP_PHOTO_PREFIX)

/**
 * Build a placeholder photo from a local image uri so it renders instantly.
 * `takenAt` is now so month-grouping buckets it at the top of the current month.
 */
export const makeTempPhoto = (plantId: string, uri: string): PlantPhoto => ({
  id: `${TEMP_PHOTO_PREFIX}${String(nowAsEpochMillis())}`,
  url: uri,
  takenAt: nowAsDate(),
  plantId,
})

type DetailResult = ApiResult<PlantDetail> | undefined
type PhotosResult = ApiResult<PlantPhotosListResponse> | undefined

// --- Pure cache transforms (operate THROUGH the Either wrapper) ---

/**
 * Prepend a photo to the getPlant detail cache, keeping it capped to the same
 * number of photos the detail endpoint returns so the optimistic state matches
 * the eventual refetch (no pop on reconcile).
 */
export const addPhotoToDetail = (
  old: DetailResult,
  photo: PlantPhoto
): DetailResult => {
  if (!old) return undefined
  return Either.map(old, (plant) => ({
    ...plant,
    photos: Array.take(Array.prepend(plant.photos, photo), DETAIL_PHOTO_CAP),
  }))
}

/** Remove a photo from the getPlant detail cache by id. */
export const removePhotoFromDetail = (
  old: DetailResult,
  photoId: string
): DetailResult => {
  if (!old) return undefined
  return Either.map(old, (plant) => ({
    ...plant,
    photos: Array.filter(plant.photos, (p) => p.id !== photoId),
  }))
}

/** Prepend a photo to the paginated getPlantPhotos cache and bump the total. */
export const addPhotoToList = (
  old: PhotosResult,
  photo: PlantPhoto
): PhotosResult => {
  if (!old) return undefined
  return Either.map(old, (response) => ({
    ...response,
    items: Array.prepend(response.items, photo),
    total: response.total + 1,
  }))
}

/** Remove a photo from the paginated getPlantPhotos cache and drop the total. */
export const removePhotoFromList = (
  old: PhotosResult,
  photoId: string
): PhotosResult => {
  if (!old) return undefined
  return Either.map(old, (response) => ({
    ...response,
    items: Array.filter(response.items, (p) => p.id !== photoId),
    total: Math.max(0, response.total - 1),
  }))
}

/**
 * Swap the optimistic temp photo for the persisted one (real id + CDN url),
 * preserving its position. The count is unchanged (already bumped on add).
 */
export const replacePhotoInDetail = (
  old: DetailResult,
  tempId: string,
  real: PlantPhoto
): DetailResult => {
  if (!old) return undefined
  return Either.map(old, (plant) => ({
    ...plant,
    photos: Array.map(plant.photos, (p) => (p.id === tempId ? real : p)),
  }))
}

export const replacePhotoInList = (
  old: PhotosResult,
  tempId: string,
  real: PlantPhoto
): PhotosResult => {
  if (!old) return undefined
  return Either.map(old, (response) => ({
    ...response,
    items: Array.map(response.items, (p) => (p.id === tempId ? real : p)),
  }))
}
