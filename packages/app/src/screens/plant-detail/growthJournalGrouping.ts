import { formatMemberSince, type PlantPhoto } from '@lily/shared'
import {
  Array,
  DateTime,
  Option,
  Order,
  pipe,
  Record,
  String as Str,
} from 'effect'

/**
 * A month bucket of photos, newest month first, photos newest-first within it.
 */
export interface PhotoGroup {
  /** "YYYY-MM" sort key */
  key: string
  /** Localized header label, e.g. "Jun 2025" */
  label: string
  photos: ReadonlyArray<PlantPhoto>
}

/** Month bucket key ("YYYY-MM") for a photo's capture date. */
const getMonthKey = (date: Date): string => {
  const parts = DateTime.toParts(DateTime.unsafeMake(date))
  const month = pipe(String(parts.month), Str.padStart(2, '0'))
  return `${String(parts.year)}-${month}`
}

/** Newest photo first within a month. */
const photoTakenAtDesc: Order.Order<PlantPhoto> = Order.mapInput(
  Order.reverse(Order.number),
  (photo) => photo.takenAt.getTime()
)

/** Newest month group first. */
const monthKeyDesc: Order.Order<PhotoGroup> = Order.mapInput(
  Order.reverse(Order.string),
  (group) => group.key
)

/**
 * Bucket photos into month groups, newest month first and newest photo first
 * within each month. Mirrors the care-history grouping idiom (reduce into a
 * Record, then Record.toEntries → Array.sort with Order.mapInput).
 */
export const groupPhotosByMonth = (
  photos: ReadonlyArray<PlantPhoto>,
  locale: string
): PhotoGroup[] => {
  const grouped = pipe(
    photos,
    Array.reduce({} as Record<string, PlantPhoto[]>, (acc, photo) => {
      const key = getMonthKey(photo.takenAt)
      if (!acc[key]) {
        acc[key] = []
      }
      acc[key].push(photo)
      return acc
    })
  )

  const mapped = pipe(
    Record.toEntries(grouped),
    Array.map(([key, groupPhotos]): PhotoGroup => {
      const sortedPhotos = Array.sort(groupPhotos, photoTakenAtDesc)
      const label = pipe(
        Array.head(sortedPhotos),
        Option.map((photo) =>
          formatMemberSince(DateTime.unsafeMake(photo.takenAt), locale)
        ),
        Option.getOrElse(() => key)
      )
      return { key, label, photos: sortedPhotos }
    })
  )

  return Array.sort(mapped, monthKeyDesc)
}
