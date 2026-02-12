import { GCSService, type GCSUploadError } from '@lily/shared/services/file/gcs'
import type { UIMessage } from 'ai'
import { Array, Effect, Option, pipe } from 'effect'

type MessagePart = UIMessage['parts'][number]

const isFilePartWithUrl = (
  part: MessagePart
): part is MessagePart & { type: 'file'; url: string } =>
  part.type === 'file' && 'url' in part && typeof part.url === 'string'

/**
 * Resolve all GCS key references in UIMessage parts to signed URLs.
 * Collects all keys first, signs them in batch, then maps back.
 */
export const resolveMessageImageUrls = (
  messages: UIMessage[]
): Effect.Effect<UIMessage[], GCSUploadError, GCSService> =>
  Effect.gen(function* () {
    const keys = pipe(
      messages,
      Array.flatMap((msg) => msg.parts),
      Array.filterMap((part) =>
        isFilePartWithUrl(part) ? Option.some(part.url) : Option.none()
      )
    )

    if (Array.isEmptyArray(keys)) return messages

    const gcs = yield* GCSService
    const urlMap = yield* gcs.getSignedUrls(keys)

    return Array.map(messages, (msg) => ({
      ...msg,
      parts: Array.map(msg.parts, (part) =>
        isFilePartWithUrl(part)
          ? {
              ...part,
              url: Option.getOrElse(
                Option.fromNullable(urlMap.get(part.url)),
                () => part.url
              ),
            }
          : part
      ) as UIMessage['parts'],
    }))
  })

/**
 * Resolve raw GCS keys to signed URLs for a list of items.
 * Signs all unique keys in batch, then maps them back.
 */
export const resolveImageUrls = <T extends { imageUrl?: string | undefined }>(
  items: readonly T[]
): Effect.Effect<T[], GCSUploadError, GCSService> =>
  Effect.gen(function* () {
    const keys = Array.filterMap(items, (item) =>
      Option.fromNullable(item.imageUrl)
    )

    if (Array.isEmptyArray(keys)) return [...items]

    const gcs = yield* GCSService
    const urlMap = yield* gcs.getSignedUrls(keys)

    return Array.map(items, (item) =>
      pipe(
        Option.fromNullable(item.imageUrl),
        Option.match({
          onNone: () => item,
          onSome: (key) => ({
            ...item,
            imageUrl: Option.getOrElse(
              Option.fromNullable(urlMap.get(key)),
              () => key
            ),
          }),
        })
      )
    )
  })

/**
 * Resolve a single raw GCS key to a signed URL.
 */
export const resolveImageUrl = (
  imageUrl: string | undefined
): Effect.Effect<string | undefined, GCSUploadError, GCSService> =>
  pipe(
    Option.fromNullable(imageUrl),
    Option.match({
      onNone: (): Effect.Effect<
        string | undefined,
        GCSUploadError,
        GCSService
      > => Effect.succeed(undefined),
      onSome: (key) =>
        Effect.flatMap(GCSService, (gcs) => gcs.getSignedUrl(key)),
    })
  )
