import { CurrentUser } from '@lily/api/services/auth/middleware.types'
import { GCSService } from '@lily/shared/services/file/gcs'
import { scopePrefix } from '@lily/shared/services/file/stored-object'
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

/**
 * A `..` segment survives in a key when the URL spelled its slash as `%2F`,
 * and a URL built from that key leaves the folder its prefix names.
 */
const staysInFolder = (key: string) =>
  !Array.some(
    String.split(key, '/'),
    (segment) => segment === '.' || segment === '..'
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
              staysInFolder(key)
          ),
          Option.map(({ key }) => ClientImage.OwnUpload({ key }))
        )
      ),
      Option.getOrElse(() => ClientImage.Untrusted())
    )
  })
