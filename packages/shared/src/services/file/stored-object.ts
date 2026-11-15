import { Array, Match, Option, pipe, String } from 'effect'

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

export const sameObject = (a: StoredObject, b: StoredObject): boolean =>
  a.bucket === b.bucket && a.key === b.key

const decodeKey = Option.liftThrowable(decodeURIComponent)

/**
 * Reads a stored reference back into an object. The plant bucket is stored as
 * a public URL, the ai bucket as a bare key or a signed URL. A URL outside
 * both buckets, such as an OAuth avatar, is nobody's object, and so is a URL
 * whose path does not decode.
 */
export const locateStoredObject =
  (bucketNames: Record<BucketRole, string>) =>
  (ref: string): Option.Option<StoredObject> => {
    if (!URL.canParse(ref)) {
      return String.isEmpty(ref)
        ? Option.none()
        : Option.some({ bucket: 'ai', key: ref })
    }
    const [, bucketName, ...segments] = pipe(
      new URL(ref).pathname,
      String.split('/')
    )
    const bucket = pipe(
      Match.value(bucketName),
      Match.when(bucketNames.plant, () => Option.some<BucketRole>('plant')),
      Match.when(bucketNames.ai, () => Option.some<BucketRole>('ai')),
      Match.orElse(() => Option.none<BucketRole>())
    )
    return pipe(
      Option.all({ bucket, key: decodeKey(Array.join(segments, '/')) }),
      Option.filter(({ key }) => String.isNonEmpty(key))
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

const LEGACY_STAMP = /^(\d{13,})-/
const LEGACY_NAMED = /^\d+-(avatars|plants)\/(.+?)(?:\/|-\d+\.)/

/**
 * How a URL can hide the stamp of an older key from a text search, although
 * `locateStoredObject` still reads the key out of it. The URL parser drops
 * `ignored` characters wherever they are, and a digit may be percent-encoded.
 * Search for the stamp with `ignored` removed, and take any URL that matches
 * `encodedDigit` as well. The spellings table in
 * `account-photo-refs-outside.integration.test.ts` holds both sides to this.
 */
export const STAMP_DISGUISE = {
  ignored: '\t\n\r',
  encodedDigit: '%3[0-9]',
} as const

/** The epoch millis an older key starts with. */
export const legacyStampOf = (key: string): Option.Option<string> =>
  pipe(
    key,
    String.match(LEGACY_STAMP),
    Option.flatMapNullishOr((match) => match[1])
  )

export const legacyOwnerOf = (key: string): Option.Option<LegacyOwner> =>
  Option.map(legacyStampOf(key), () =>
    pipe(
      key,
      String.match(LEGACY_NAMED),
      Option.map(
        ([, folder, id = '']): LegacyOwner =>
          folder === 'avatars'
            ? { _tag: 'Avatar', userId: id }
            : { _tag: 'Plant', plantId: id }
      ),
      Option.getOrElse((): LegacyOwner => ({ _tag: 'Unnamed' }))
    )
  )
