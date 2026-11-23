import { CurrentUser } from '@lily/api/services/auth/middleware.types'
import { GCSService } from '@lily/shared/services/file/gcs'
import { isPlannedKey } from '@lily/shared/services/file/image-upload'
import {
  chatFolder,
  publicUrlOf,
  type StoredObject,
  type StoredObjectRef,
  scopePrefix,
  userFolder,
} from '@lily/shared/services/file/stored-object'
import { mintStoredRef } from '@lily/shared/services/file/stored-ref-mint'
import { Array, Data, Effect, Option, pipe, String } from 'effect'

/**
 * What an image reference sent by a client names. Every endpoint that takes
 * one reads it here, so a row or an AI call only ever gets a reference the
 * server made or one that names no host at all.
 */
export type ClientImage = Data.TaggedEnum<{
  /** A private object in the caller's own folder: a scan, identify or chat photo. */
  OwnUpload: { readonly key: StoredObjectRef }
  /** Another host, another account's object, or an object in no account's folder. */
  Untrusted: {}
}>

export const ClientImage = Data.taggedEnum<ClientImage>()

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

    const owned = pipe(
      Option.getOrElse(gcs.readRef(ref), Array.empty<StoredObject>),
      Array.filter(
        ({ bucket, key }) =>
          bucket === 'ai' &&
          String.startsWith(ownFolder)(key) &&
          isServerMadeKey(key)
      ),
      Array.map(({ key }) => key),
      Array.dedupe
    )
    return Array.match(owned, {
      onEmpty: () => ClientImage.Untrusted(),
      onNonEmpty: ([key, ...others]) =>
        Array.isReadonlyArrayEmpty(others)
          ? ClientImage.OwnUpload({ key: mintStoredRef(key) })
          : ClientImage.Untrusted(),
    })
  })

/**
 * The key of a photo the caller uploaded to this conversation, from the key
 * the chat upload answered with.
 */
export const readChatImageKey = (
  ref: string,
  conversationId: string
): Effect.Effect<
  Option.Option<StoredObjectRef>,
  never,
  GCSService | CurrentUser
> =>
  Effect.gen(function* () {
    const { id: userId } = yield* CurrentUser
    const image = yield* readClientImage(ref)

    return pipe(
      Option.liftPredicate(image, ClientImage.$is('OwnUpload')),
      Option.map(({ key }) => key),
      Option.filter(String.startsWith(`${chatFolder(userId, conversationId)}/`))
    )
  })

/**
 * The avatar `image` names, when it is the URL the avatar upload stores for
 * `userId`.
 */
export const readIssuedAvatar = (
  image: string,
  userId: string
): Effect.Effect<Option.Option<StoredObjectRef>, never, GCSService> =>
  Effect.gen(function* () {
    const gcs = yield* GCSService
    const base = publicUrlOf(gcs.bucketNames.plant, '')
    return pipe(
      Option.liftPredicate(image, String.startsWith(base)),
      Option.filter((url) =>
        isPlannedKey(
          userFolder(userId, 'avatars'),
          String.slice(base.length)(url)
        )
      ),
      Option.map(mintStoredRef)
    )
  })
