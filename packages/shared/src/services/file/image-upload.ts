import { Array, Effect, Option, Schema } from 'effect'
import { nowAsEpochMillis } from '../../domains/common/date'
import { MAX_FILE_SIZE_BYTES } from '../../domains/plant/constants'

export class InvalidImageError extends Schema.TaggedError<InvalidImageError>()(
  'InvalidImageError',
  { message: Schema.String },
  { httpApiStatus: 400 }
) {}

interface ImageType {
  readonly contentType: string
  readonly extension: string
  readonly matches: (bytes: Uint8Array) => boolean
}

const hasBytesAt = (
  bytes: Uint8Array,
  offset: number,
  expected: readonly number[]
) => Array.every(expected, (byte, i) => bytes[offset + i] === byte)

const hasAsciiAt = (bytes: Uint8Array, offset: number, text: string) =>
  hasBytesAt(
    bytes,
    offset,
    Array.map(Array.fromIterable(text), (char) => char.charCodeAt(0))
  )

const IMAGE_TYPES: readonly ImageType[] = [
  {
    contentType: 'image/jpeg',
    extension: 'jpg',
    matches: (bytes) => hasBytesAt(bytes, 0, [0xff, 0xd8, 0xff]),
  },
  {
    contentType: 'image/png',
    extension: 'png',
    matches: (bytes) =>
      hasBytesAt(bytes, 0, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  },
  {
    contentType: 'image/webp',
    extension: 'webp',
    matches: (bytes) =>
      hasAsciiAt(bytes, 0, 'RIFF') && hasAsciiAt(bytes, 8, 'WEBP'),
  },
]

export const sniffImageType = (bytes: Uint8Array): Option.Option<ImageType> =>
  Array.findFirst(IMAGE_TYPES, (type) => type.matches(bytes))

/**
 * Object key and stored content type for an upload, both derived from the
 * bytes: the client's file name and declared type never reach the bucket.
 */
export const planImageUpload = (
  bytes: Uint8Array,
  folder: string
): Effect.Effect<
  { readonly key: string; readonly contentType: string },
  InvalidImageError
> => {
  if (bytes.byteLength > MAX_FILE_SIZE_BYTES) {
    return Effect.fail(
      new InvalidImageError({ message: 'Image is larger than 10 MB' })
    )
  }
  return Option.match(sniffImageType(bytes), {
    onNone: () =>
      Effect.fail(
        new InvalidImageError({
          message: 'Only JPEG, PNG and WebP images are accepted',
        })
      ),
    onSome: (type) =>
      Effect.succeed({
        key: `${nowAsEpochMillis()}-${folder}/${crypto.randomUUID()}.${type.extension}`,
        contentType: type.contentType,
      }),
  })
}
