import { Array, type DateTime, Match, Option, pipe, String } from 'effect'

export type { StoredObjectRef } from './stored-ref-mint'

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

/** The URL the API stores for an object of the public plant bucket. */
export const publicUrlOf = (bucketName: string, key: string): string =>
  `https://storage.googleapis.com/${bucketName}/${key}`

export type BucketRole = 'plant' | 'ai'

export interface StoredObject {
  readonly bucket: BucketRole
  readonly key: string
}

export const sameObject = (a: StoredObject, b: StoredObject): boolean =>
  a.bucket === b.bucket && a.key === b.key

const decodeKey = Option.liftThrowable(decodeURIComponent)

export const BUCKET_ROLES: ReadonlyArray<BucketRole> = ['plant', 'ai']

/** An object as a bucket listing reports it. */
export interface ListedObject extends StoredObject {
  readonly size: number
  readonly createdAt: DateTime.Utc
}

const VIRTUAL_HOST_SUFFIX = '.storage.googleapis.com'
const USER_INFO = /^.*@/s
const PORT = /:\d*$/
const TRAILING_DOTS = /\.+$/
const JSON_API_PATH = /(?:^|\/)b\/([^/]+)\/o\/(.+)$/s
const HAS_AUTHORITY = /^\s*[a-z][a-z0-9+.-]*:\/\//i
const ESCAPE_RUNS = /((?:%[0-9a-f]{2})+)/i
const QUERY_OR_FRAGMENT = /([?#])/

/** Decodes each run of escapes that decodes, and leaves the rest as written. */
const unescaped = (text: string): string =>
  pipe(
    String.split(text, ESCAPE_RUNS),
    Array.map((piece) => Option.getOrElse(decodeKey(piece), () => piece)),
    Array.join('')
  )

const hostOf = (authority: string): string =>
  pipe(
    authority,
    String.replace(USER_INFO, ''),
    String.replace(PORT, ''),
    (host) => Option.getOrElse(decodeKey(host), () => host),
    String.toLowerCase,
    String.replace(TRAILING_DOTS, '')
  )

const unescapings = (key: string): ReadonlyArray<string> =>
  Array.unfold(key, (current) => {
    const next = unescaped(current)
    return next === current ? Option.none() : Option.some([next, next])
  })

/**
 * The text itself, then the text up to each `?` or `#`. Either character can
 * start a query or a fragment, or belong to the key.
 */
const cuts = (text: string): ReadonlyArray<string> =>
  pipe(
    String.split(text, QUERY_OR_FRAGMENT),
    Array.scan('', (read, piece) => read + piece),
    Array.filter((_, index) => index % 2 === 1),
    Array.reverse
  )

/**
 * Every object a stored reference may name, read generously so a reference
 * is never missed. Naming an object nobody stored costs nothing. Missing one
 * lets the orphan sweep delete a live photo.
 *
 * A reference can be a bare key, a bucket-prefixed key, or a URL of any form
 * GCS serves: path style on any host, virtual-host style, the JSON and
 * Firebase download paths, or `gs://`. A bare key names that key in both
 * buckets, because older rows may store either bucket's key without its URL.
 *
 * The API writes public URLs without encoding the key, and older keys end in
 * the client's file name. So the reference is read twice, once as a URL and
 * once as plain text. The URL parser alone would cut a key at `?` or `#`,
 * drop tabs, resolve dot segments and turn `\` into `/`. Each key then yields
 * every spelling it may be stored under: cut or not at each `?` and `#`,
 * escapes decoded or not, `+` as itself or a space, composed or decomposed
 * accents.
 */
export const namedObjects = (bucketNames: Record<BucketRole, string>) => {
  const roleOf = (name: string): Option.Option<BucketRole> =>
    Array.findFirst(BUCKET_ROLES, (role) => bucketNames[role] === name)

  const spellings = (key: string): ReadonlyArray<string> =>
    pipe(
      cuts(key),
      Array.flatMap((cut) => [cut, ...unescapings(cut)]),
      Array.flatMap((k) => [k, String.replaceAll('+', ' ')(k)]),
      Array.flatMap((k) => [
        k,
        String.normalize('NFC')(k),
        String.normalize('NFD')(k),
      ]),
      Array.filter(String.isNonEmpty),
      Array.dedupe
    )

  const inBucket = (name: string, key: string): ReadonlyArray<StoredObject> =>
    pipe(
      roleOf(name),
      Option.match({
        onNone: () => [],
        onSome: (bucket) =>
          Array.map(spellings(key), (k) => ({ bucket, key: k })),
      })
    )

  const inVirtualHost = (
    authority: string,
    key: string
  ): ReadonlyArray<StoredObject> => {
    const host = hostOf(authority)
    return String.endsWith(VIRTUAL_HOST_SUFFIX)(host)
      ? inBucket(String.slice(0, -VIRTUAL_HOST_SUFFIX.length)(host), key)
      : []
  }

  const afterBucketSegment = (path: string): ReadonlyArray<StoredObject> => {
    const segments = String.split(path, '/')
    return Array.flatMap(segments, (segment, index) => {
      const rest = Array.join(Array.drop(segments, index + 1), '/')
      return [...inBucket(segment, rest), ...inVirtualHost(segment, rest)]
    })
  }

  const jsonApi = (path: string): ReadonlyArray<StoredObject> =>
    pipe(
      path,
      String.match(JSON_API_PATH),
      Option.match({
        onNone: () => [],
        onSome: ([, name = '', key = '']) =>
          inBucket(
            Option.getOrElse(decodeKey(name), () => name),
            key
          ),
      })
    )

  const fromUrl = (url: URL): ReadonlyArray<StoredObject> => {
    const path = String.slice(1)(url.pathname)
    return [
      ...inBucket(url.hostname, path),
      ...inVirtualHost(url.hostname, path),
      ...afterBucketSegment(path),
      ...jsonApi(path),
    ]
  }

  const bareKey = (text: string): ReadonlyArray<StoredObject> =>
    HAS_AUTHORITY.test(text)
      ? []
      : Array.flatMap(BUCKET_ROLES, (bucket) =>
          pipe(
            [text, String.replace(/^\/+/, '')(text)],
            Array.flatMap(spellings),
            Array.map((key) => ({ bucket, key }))
          )
        )

  const fromText = (text: string): ReadonlyArray<StoredObject> => [
    ...bareKey(text),
    ...afterBucketSegment(text),
    ...jsonApi(text),
  ]

  return (ref: string): ReadonlyArray<StoredObject> => {
    const text = String.trim(ref)
    if (String.isEmpty(text)) return []
    return Array.dedupeWith(
      [
        ...(URL.canParse(text) ? fromUrl(new URL(text)) : []),
        ...Array.flatMap(Array.dedupe([text, ref]), fromText),
      ],
      sameObject
    )
  }
}

const READABLE_LENGTH = 2048

/**
 * `namedObjects` for a reference short enough to read. Reading takes time
 * that grows with the square of the length, and a client can write a
 * reference of any length. None means the caller cannot tell what the
 * reference names: the server writes none that long.
 */
export const readStoredRef = (bucketNames: Record<BucketRole, string>) => {
  const named = namedObjects(bucketNames)
  return (ref: string): Option.Option<ReadonlyArray<StoredObject>> =>
    String.length(ref) > READABLE_LENGTH
      ? Option.none()
      : Option.some(named(ref))
}

const SEARCH_RUN = /[A-Za-z0-9-]+/g

/**
 * How to find, with a text search, every reference that `namedObjects` may
 * read a key out of. Such a reference holds the key's search run unless it
 * holds an `unsafe` character or an `escape`. An unsafe character is one the
 * URL parser drops or escapes into hex digits, such as `^`, or one outside
 * ASCII, which NFD can split into a letter. An escape decodes to a run
 * character, to `%`, or to a byte outside ASCII. Revisit both when
 * `namedObjects` reads a key a new way.
 */
export const KEY_DISGUISE = {
  unsafe: '[^!#-;=?-\\]_a-z|~]',
  escape:
    '%(2[5dD]|3[0-9]|4[1-9a-fA-F]|5[0-9aA]|6[1-9a-fA-F]|7[0-9aA]|[89a-fA-F][0-9a-fA-F])',
} as const

/**
 * The longest run of letters, digits and `-` in a key, the first of equals.
 * The first is the scope's ID in a scoped key, so the keys of one scope share
 * a run.
 */
export const searchRunOf = (key: string): string =>
  Array.reduce(
    Array.fromIterable(String.matchAll(SEARCH_RUN)(key)),
    '',
    (longest, [run]) => (run.length > longest.length ? run : longest)
  )

const UNSAFE = new RegExp(KEY_DISGUISE.unsafe)
const ESCAPE = new RegExp(KEY_DISGUISE.escape)

/**
 * Whether `ref` matches the text search for `key` that `KEY_DISGUISE`
 * describes. When it does not, `namedObjects` reads no such key out of `ref`.
 */
export const mayNameKey =
  (ref: string) =>
  (key: string): boolean =>
    String.includes(searchRunOf(key))(ref) ||
    UNSAFE.test(ref) ||
    (String.includes('%')(ref) && ESCAPE.test(ref))

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
 * `namedObjects` still reads the key out of it. The URL parser drops
 * `ignored` characters wherever they are, and a digit may be percent-encoded,
 * with the `%` of its escape encoded again any number of times. Search for
 * the stamp with `ignored` removed, and take any URL that matches `escape` as
 * well. The spellings table in
 * `account-photo-refs-outside.integration.test.ts` holds both sides to this.
 */
export const STAMP_DISGUISE = {
  ignored: '\t\n\r',
  escape: '%(3[0-9]|25)',
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
