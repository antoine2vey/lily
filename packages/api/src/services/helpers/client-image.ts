import { CurrentUser } from '@lily/api/services/auth/middleware.types'
import { GCSService } from '@lily/shared/services/file/gcs'
import {
  chatFolder,
  scopePrefix,
} from '@lily/shared/services/file/stored-object'
import { Array, Data, Effect, Option, pipe, String } from 'effect'

/**
 * What an image reference sent by a client names. Every endpoint that takes
 * one reads it here, so a row or an AI call only ever gets a reference the
 * server made or one that names no host at all.
 */
export type ClientImage = Data.TaggedEnum<{
  /** A private object in the caller's own folder: a scan, identify or chat photo. */
  OwnUpload: { readonly key: string }
  /** A file on the device that sent it, which other devices cannot load. */
  DeviceFile: { readonly uri: string }
  /** Another host, another account's object, or an object in no account's folder. */
  Untrusted: {}
}>

export const ClientImage = Data.taggedEnum<ClientImage>()

/**
 * The path of a picked photo that the app sends when it has no upload for it:
 * every care log photo, and the plant photo of builds from before March 2026.
 * https://github.com/antoine2vey/lily/issues/235 removes it.
 */
export const deviceFile = (ref: string | undefined): Option.Option<string> =>
  pipe(Option.fromNullishOr(ref), Option.filter(String.startsWith('file:///')))

const SERVER_MADE_SEGMENT = /^[\w.-]+$/

/**
 * The server writes keys of letters, digits, `.`, `-` and `_` between slashes.
 * A `..` segment survives in a key when the URL spelled its slash as `%2F`,
 * and a URL built from that key leaves the folder its prefix names.
 */
const isServerMadeKey = (key: string) =>
  Array.every(
    String.split(key, '/'),
    (segment) =>
      segment !== '.' && segment !== '..' && SERVER_MADE_SEGMENT.test(segment)
  )

export const readClientImage = (
  ref: string
): Effect.Effect<ClientImage, never, GCSService | CurrentUser> =>
  Effect.gen(function* () {
    const gcs = yield* GCSService
    const { id: userId } = yield* CurrentUser
    const ownFolder = scopePrefix({ _tag: 'User', userId })

    return pipe(
      deviceFile(ref),
      Option.map((uri) => ClientImage.DeviceFile({ uri })),
      Option.orElse(() =>
        pipe(
          gcs.locate(ref),
          Option.filter(
            ({ bucket, key }) =>
              bucket === 'ai' &&
              String.startsWith(ownFolder)(key) &&
              isServerMadeKey(key)
          ),
          Option.map(({ key }) => ClientImage.OwnUpload({ key }))
        )
      ),
      Option.getOrElse(() => ClientImage.Untrusted())
    )
  })

/**
 * The key of a photo the caller uploaded to this conversation, from the key
 * the chat upload answered with.
 */
export const readChatImageKey = (
  ref: string,
  conversationId: string
): Effect.Effect<Option.Option<string>, never, GCSService | CurrentUser> =>
  Effect.gen(function* () {
    const { id: userId } = yield* CurrentUser
    const image = yield* readClientImage(ref)

    return pipe(
      Option.liftPredicate(image, ClientImage.$is('OwnUpload')),
      Option.map(({ key }) => key),
      Option.filter(String.startsWith(`${chatFolder(userId, conversationId)}/`))
    )
  })
