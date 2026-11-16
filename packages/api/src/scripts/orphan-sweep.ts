import {
  type RefSource,
  StoredRefRepository,
} from '@lily/api/repositories/stored-ref.repository'
import { GCSService } from '@lily/shared/server'
import {
  BUCKET_ROLES,
  type BucketRole,
  type ListedObject,
  legacyStampOf,
  namedObjects,
} from '@lily/shared/services/file/stored-object'
import {
  Array,
  Console,
  Data,
  DateTime,
  Duration,
  Effect,
  Match,
  Option,
  pipe,
  Record,
  Schema,
  Stream,
  String,
} from 'effect'

/**
 * Why an object stays or goes. `foreign` is an object whose key matches no
 * layout the API writes, so nothing proves it is a lost upload.
 */
export type Verdict = 'referenced' | 'inside-grace' | 'foreign' | 'orphan'

const VERDICTS: ReadonlyArray<Verdict> = [
  'referenced',
  'inside-grace',
  'foreign',
  'orphan',
]

export interface Decided extends ListedObject {
  readonly verdict: Verdict
}

export interface SweepOptions {
  readonly apply: boolean
  readonly grace: Duration.Duration
  readonly batchSize: number
}

export type Outcome =
  | { readonly _tag: 'Deleted'; readonly object: Decided }
  | {
      readonly _tag: 'Failed'
      readonly object: Decided
      readonly message: string
    }

export interface Tally {
  readonly count: number
  readonly bytes: number
}

export interface SweepResult {
  readonly decided: ReadonlyArray<Decided>
  readonly tallies: Record<BucketRole, Record<Verdict, Tally>>
  readonly refsBySource: ReadonlyArray<readonly [RefSource, number]>
  readonly unread: ReadonlyArray<string>
  readonly blockers: ReadonlyArray<string>
  readonly outcomes: ReadonlyArray<Outcome>
}

export class SweepRefused extends Data.TaggedError('SweepRefused')<{
  readonly blockers: ReadonlyArray<string>
}> {
  override get message() {
    return `nothing was deleted: ${Array.join(this.blockers, '; ')}`
  }
}

/** Some deletes failed. A rerun with `apply` retries them. */
export class DeletesFailed extends Data.TaggedError('DeletesFailed')<{
  readonly count: number
}> {}

export class InvalidFlags extends Data.TaggedError('InvalidFlags')<{
  readonly message: string
}> {}

const USAGE =
  'usage: sweep-orphans [--apply] [--grace=<duration, default "7 days">] [--batch=<objects per batch, default 100>]'

const DEFAULTS: SweepOptions = {
  apply: false,
  grace: Duration.days(7),
  batchSize: 100,
}

const decodeDuration = Schema.decodeUnknownOption(Schema.DurationFromString)

/** Reads `--apply`, `--grace=<duration>` and `--batch=<n>`. */
export const parseFlags = (
  argv: ReadonlyArray<string>
): Effect.Effect<SweepOptions, InvalidFlags> =>
  Effect.reduce(
    argv,
    () => DEFAULTS,
    (options, arg): Effect.Effect<SweepOptions, InvalidFlags> => {
      const [name = '', ...rest] = String.split(arg, '=')
      const value = Array.isReadonlyArrayEmpty(rest)
        ? Option.none<string>()
        : Option.some(Array.join(rest, '='))
      const invalid = (why: string) =>
        Effect.fail(new InvalidFlags({ message: `${why}\n${USAGE}` }))
      return Match.value(name).pipe(
        Match.when('--apply', () =>
          Option.isNone(value)
            ? Effect.succeed({ ...options, apply: true })
            : invalid('--apply takes no value')
        ),
        Match.when('--grace', () =>
          Option.match(Option.flatMap(value, decodeDuration), {
            onNone: () => invalid(`--grace needs a duration such as "7 days"`),
            onSome: (grace) => Effect.succeed({ ...options, grace }),
          })
        ),
        Match.when('--batch', () =>
          Option.match(
            pipe(
              value,
              Option.map(Number),
              Option.filter((n) => Number.isInteger(n) && n > 0)
            ),
            {
              onNone: () => invalid('--batch needs a positive whole number'),
              onSome: (batchSize) => Effect.succeed({ ...options, batchSize }),
            }
          )
        ),
        Match.orElse(() => invalid(`unknown flag ${arg}`))
      )
    }
  )

const idOf = (object: { bucket: BucketRole; key: string }) =>
  `${object.bucket}/${object.key}`

const writtenByApi = (key: string) =>
  String.startsWith('plants/')(key) ||
  String.startsWith('users/')(key) ||
  Option.isSome(legacyStampOf(key))

const SAMPLE_SIZE = 5

const noTally = (): Record<Verdict, Tally> => ({
  referenced: { count: 0, bytes: 0 },
  'inside-grace': { count: 0, bytes: 0 },
  foreign: { count: 0, bytes: 0 },
  orphan: { count: 0, bytes: 0 },
})

const tally = (
  decided: ReadonlyArray<Decided>
): Record<BucketRole, Record<Verdict, Tally>> => {
  const tallies = { plant: noTally(), ai: noTally() }
  for (const { bucket, verdict, size } of decided) {
    const { count, bytes } = tallies[bucket][verdict]
    tallies[bucket][verdict] = { count: count + 1, bytes: bytes + size }
  }
  return tallies
}

/**
 * Lists both buckets, reads every stored reference, and decides each object.
 * With `apply`, deletes the orphans in batches, refusing first when the
 * references look unreadable. A rerun lists only what is left, so it deletes
 * nothing twice.
 */
export const sweepOrphans = Effect.fn('sweepOrphans')(function* (
  options: SweepOptions
) {
  const gcs = yield* GCSService
  const refs = yield* StoredRefRepository
  const named = namedObjects(gcs.bucketNames)

  const listed = new Map<string, ListedObject>()
  for (const bucket of BUCKET_ROLES) {
    yield* Stream.runForEach(gcs.listObjects(bucket), (object) =>
      Effect.sync(() => listed.set(idOf(object), object))
    )
  }

  const referenced = new Set<string>()
  const refsBySource = new Map<RefSource, number>()
  const unread: string[] = []
  yield* Stream.runForEach(refs.everyRef, ({ source, ref }) =>
    Effect.sync(() => {
      refsBySource.set(source, (refsBySource.get(source) ?? 0) + 1)
      const objects = named(ref)
      for (const object of objects) {
        if (listed.has(idOf(object))) referenced.add(idOf(object))
      }
      const namesBucket = Array.some(Record.values(gcs.bucketNames), (name) =>
        String.includes(name)(ref)
      )
      if (Array.isReadonlyArrayEmpty(objects) && namesBucket) unread.push(ref)
    })
  )

  const now = DateTime.nowUnsafe()
  const decided = Array.map(
    Array.fromIterable(listed.values()),
    (object): Decided => ({
      ...object,
      verdict: pipe(
        Match.value(object),
        Match.when(
          (o) => referenced.has(idOf(o)),
          (): Verdict => 'referenced'
        ),
        Match.when(
          (o) =>
            Duration.isLessThan(
              DateTime.distance(o.createdAt, now),
              options.grace
            ),
          (): Verdict => 'inside-grace'
        ),
        Match.when(
          (o) => !writtenByApi(o.key),
          (): Verdict => 'foreign'
        ),
        Match.orElse((): Verdict => 'orphan')
      ),
    })
  )
  const tallies = tally(decided)

  const refCount = Array.reduce(
    Array.fromIterable(refsBySource.values()),
    0,
    (sum, n) => sum + n
  )
  const blockers: ReadonlyArray<string> = [
    ...(refCount === 0 && listed.size > 0
      ? ['no stored reference was read, yet the buckets hold objects']
      : []),
    ...Array.flatMap(BUCKET_ROLES, (bucket) => {
      const held = Array.reduce(
        VERDICTS,
        0,
        (n, v) => n + tallies[bucket][v].count
      )
      return held > 0 && tallies[bucket].referenced.count === 0
        ? [
            `bucket ${gcs.bucketNames[bucket]} holds ${held} objects and no reference names any of them`,
          ]
        : []
    }),
    ...(Array.isReadonlyArrayNonEmpty(unread)
      ? [
          `${unread.length} references mention a bucket but name no object, e.g. ${Array.join(Array.take(unread, SAMPLE_SIZE), ', ')}`,
        ]
      : []),
  ]

  const orphans = Array.filter(decided, (o) => o.verdict === 'orphan')
  if (options.apply && Array.isReadonlyArrayNonEmpty(blockers)) {
    return yield* new SweepRefused({ blockers })
  }

  const outcomes: Outcome[] = []
  if (options.apply) {
    for (const batch of Array.chunksOf(orphans, options.batchSize)) {
      const done = yield* Effect.forEach(
        batch,
        (object) =>
          gcs.deleteObjects([object]).pipe(
            Effect.as<Outcome>({ _tag: 'Deleted', object }),
            Effect.catchTag('GCSDeleteError', (error) =>
              Effect.succeed<Outcome>({
                _tag: 'Failed',
                object,
                message: error.message,
              })
            )
          ),
        { concurrency: 10 }
      )
      yield* Effect.forEach(
        done,
        (outcome) => Console.log(outcomeLine(outcome)),
        {
          discard: true,
        }
      )
      outcomes.push(...done)
    }
  }

  return {
    decided,
    tallies,
    refsBySource: Array.fromIterable(refsBySource),
    unread,
    blockers,
    outcomes,
  } satisfies SweepResult
})

export const decisionLine = (object: Decided) =>
  `${object.verdict}\t${object.bucket}\t${object.key}\t${object.size}\t${DateTime.formatIso(object.createdAt)}`

export const outcomeLine = (outcome: Outcome) =>
  Match.value(outcome).pipe(
    Match.tag(
      'Deleted',
      ({ object }) => `deleted\t${object.bucket}\t${object.key}\t${object.size}`
    ),
    Match.tag(
      'Failed',
      ({ object, message }) =>
        `failed\t${object.bucket}\t${object.key}\t${object.size}\t${message}`
    ),
    Match.exhaustive
  )

export const summaryLines = (
  result: SweepResult,
  bucketNames: Record<BucketRole, string>
): ReadonlyArray<string> => [
  ...Array.map(result.refsBySource, ([source, n]) => `refs\t${source}\t${n}`),
  ...Array.flatMap(BUCKET_ROLES, (bucket) =>
    Array.map(VERDICTS, (verdict) => {
      const { count, bytes } = result.tallies[bucket][verdict]
      return `total\t${bucketNames[bucket]}\t${verdict}\t${count} objects\t${bytes} bytes`
    })
  ),
  ...Array.map(result.blockers, (blocker) => `blocker\t${blocker}`),
]
