import { Match, Option, pipe } from 'effect'

/**
 * Who an object is erased with. A user's objects go when the account is
 * purged. A plant's objects go with the plant, so they outlive the uploader
 * when the plant stays in a canopy.
 */
export type ObjectScope =
  | { readonly _tag: 'User'; readonly userId: string }
  | { readonly _tag: 'Plant'; readonly plantId: string }

export const scopePrefix = (scope: ObjectScope): string =>
  Match.value(scope).pipe(
    Match.tag('User', ({ userId }) => `users/${userId}/`),
    Match.tag('Plant', ({ plantId }) => `plants/${plantId}/`),
    Match.exhaustive
  )

export type UserUploadKind = 'avatars' | 'detect' | 'identify' | 'scan-card'

export const userFolder = (userId: string, kind: UserUploadKind): string =>
  `users/${userId}/${kind}`

export const chatFolder = (userId: string, conversationId: string): string =>
  `users/${userId}/chat/${conversationId}`

export const plantFolder = (plantId: string): string => `plants/${plantId}`

export type BucketRole = 'plant' | 'ai'

export interface StoredObject {
  readonly bucket: BucketRole
  readonly key: string
}

/**
 * Reads a stored reference back into an object. The plant bucket is stored as
 * a public URL, the ai bucket as a bare key or a signed URL. A URL outside
 * both buckets, such as an OAuth avatar, is nobody's object.
 */
export const locateStoredObject =
  (bucketNames: Record<BucketRole, string>) =>
  (ref: string): Option.Option<StoredObject> => {
    if (!URL.canParse(ref)) {
      return ref === ''
        ? Option.none()
        : Option.some({ bucket: 'ai', key: ref })
    }
    const [, bucketName, ...segments] = new URL(ref).pathname.split('/')
    const key = decodeURIComponent(segments.join('/'))
    if (key === '') return Option.none()
    return pipe(
      Match.value(bucketName),
      Match.when(bucketNames.plant, () =>
        Option.some<StoredObject>({ bucket: 'plant', key })
      ),
      Match.when(bucketNames.ai, () =>
        Option.some<StoredObject>({ bucket: 'ai', key })
      ),
      Match.orElse(() => Option.none())
    )
  }

/**
 * What a key written before the scoped layout says about its owner. Those
 * keys start with the epoch millis of the upload: `<epoch>-<client file name>`
 * at first, `<epoch>-<folder>/<uuid>.<ext>` later. Only the avatar keys of
 * both forms and the plant keys of the later form name an owner.
 */
export type LegacyOwner =
  | { readonly _tag: 'Avatar'; readonly userId: string }
  | { readonly _tag: 'Plant'; readonly plantId: string }
  | { readonly _tag: 'Unnamed' }

const LEGACY_UPLOAD = /^\d+-/
const LEGACY_NAMED = /^\d+-(avatars|plants)\/(.+?)(?:\/|-\d+\.)/

export const legacyOwnerOf = (key: string): Option.Option<LegacyOwner> => {
  if (!LEGACY_UPLOAD.test(key)) return Option.none()
  return pipe(
    Option.fromNullishOr(LEGACY_NAMED.exec(key)),
    Option.map(
      ([, folder, id = '']): LegacyOwner =>
        folder === 'avatars'
          ? { _tag: 'Avatar', userId: id }
          : { _tag: 'Plant', plantId: id }
    ),
    Option.orElseSome((): LegacyOwner => ({ _tag: 'Unnamed' }))
  )
}
