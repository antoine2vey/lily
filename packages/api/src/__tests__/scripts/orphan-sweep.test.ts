import {
  createInMemoryGCS,
  MOCK_BUCKET_NAMES,
} from '@lily/api/__tests__/mocks/gcs.service'
import { createMockStoredRefRepository } from '@lily/api/__tests__/mocks/stored-ref.repository'
import type { StoredRef } from '@lily/api/repositories/stored-ref.repository'
import {
  InvalidFlags,
  parseFlags,
  type SweepOptions,
  SweepRefused,
  summaryLines,
  sweepOrphans,
} from '@lily/api/scripts/orphan-sweep'
import type { BucketRole } from '@lily/api/services/file/stored-object'
import { Array, DateTime, Duration, Effect, Layer, Stream } from 'effect'
import { SqlError, UnknownError } from 'effect/sql/SqlError'
import { describe, expect, it } from 'vitest'

const daysAgo = (days: number) =>
  DateTime.subtract(DateTime.nowUnsafe(), { days })

const DRY: SweepOptions = {
  apply: false,
  grace: Duration.days(7),
  batchSize: 100,
}
const APPLY: SweepOptions = { ...DRY, apply: true }

const LEGACY_KEY = '1690000000000-plants/p2/photo-1690000000000.jpg'
const HASH_KEY = '1690000000000-my#pic.jpg'
const QUERY_KEY = '1690000000000-what?.jpg'
const BARE_KEY = '1690000000000-scan#2?.jpg'

const OBJECTS: ReadonlyArray<
  readonly [BucketRole, string, { size: number; age: number }]
> = [
  ['plant', 'plants/p1/kept.jpg', { size: 100, age: 30 }],
  ['plant', LEGACY_KEY, { size: 200, age: 400 }],
  ['ai', 'users/u1/chat/kept.jpg', { size: 300, age: 30 }],
  ['plant', 'plants/p3/fresh.jpg', { size: 400, age: 1 }],
  ['plant', 'plants/p4/old.jpg', { size: 500, age: 30 }],
  ['ai', 'users/u2/chat/old.jpg', { size: 600, age: 30 }],
  ['plant', 'exports/backup.csv', { size: 700, age: 30 }],
  ['plant', HASH_KEY, { size: 800, age: 400 }],
  ['plant', QUERY_KEY, { size: 900, age: 400 }],
  ['ai', BARE_KEY, { size: 1000, age: 400 }],
]

const REFS: ReadonlyArray<StoredRef> = [
  {
    source: 'plants.image_url',
    ref: `https://storage.googleapis.com/${MOCK_BUCKET_NAMES.plant}/plants/p1/kept.jpg`,
  },
  {
    source: 'plant_photos.url',
    ref: `https://${MOCK_BUCKET_NAMES.plant}.storage.googleapis.com/${LEGACY_KEY}?X-Goog-Signature=abc`,
  },
  { source: 'chat_messages.image_key', ref: 'users/u1/chat/kept.jpg' },
  {
    source: 'plant_photos.url',
    ref: `https://storage.googleapis.com/${MOCK_BUCKET_NAMES.plant}/${HASH_KEY}`,
  },
  {
    source: 'care_logs.photo_url',
    ref: `https://storage.googleapis.com/${MOCK_BUCKET_NAMES.plant}/${QUERY_KEY}`,
  },
  { source: 'diagnoses.image_key', ref: BARE_KEY },
]

const setUp = (
  refs: Stream.Stream<StoredRef, SqlError> = Stream.fromIterable(REFS)
) => {
  const gcs = createInMemoryGCS()
  for (const [bucket, key, { size, age }] of OBJECTS) {
    gcs.put(bucket, key, { size, createdAt: daysAgo(age) })
  }
  const run = (options: SweepOptions) =>
    sweepOrphans(options).pipe(
      Effect.provide(
        Layer.mergeAll(
          gcs.layer,
          createMockStoredRefRepository({ everyRef: refs })
        )
      )
    )
  return { gcs, run }
}

const verdicts = (decided: ReadonlyArray<{ key: string; verdict: string }>) =>
  Object.fromEntries(Array.map(decided, ({ key, verdict }) => [key, verdict]))

const held = (objects: Record<BucketRole, Set<string>>) => ({
  plant: [...objects.plant].sort(),
  ai: [...objects.ai].sort(),
})

describe('parseFlags', () => {
  it('reads a dry run with a 7 day grace when no flag is given', async () => {
    expect(await Effect.runPromise(parseFlags([]))).toEqual(DRY)
  })

  it('reads --apply, --grace and --batch', async () => {
    const options = await Effect.runPromise(
      parseFlags(['--apply', '--grace=2 hours', '--batch=5'])
    )
    expect(options).toEqual({
      apply: true,
      grace: Duration.hours(2),
      batchSize: 5,
    })
  })

  it.each([
    ['--grace=soon'],
    ['--grace'],
    ['--batch=0'],
    ['--batch=1.5'],
    ['--apply=yes'],
    ['--force'],
  ])('refuses %s', async (flag) => {
    const error = await Effect.runPromise(Effect.flip(parseFlags([flag])))
    expect(error).toBeInstanceOf(InvalidFlags)
  })
})

describe('sweepOrphans', () => {
  it('decides each object and deletes nothing on a dry run', async () => {
    const { gcs, run } = setUp()
    const before = held(gcs.objects)

    const result = await Effect.runPromise(run(DRY))

    expect(verdicts(result.decided)).toEqual({
      'plants/p1/kept.jpg': 'referenced',
      [LEGACY_KEY]: 'referenced',
      'users/u1/chat/kept.jpg': 'referenced',
      'plants/p3/fresh.jpg': 'inside-grace',
      'plants/p4/old.jpg': 'orphan',
      'users/u2/chat/old.jpg': 'orphan',
      'exports/backup.csv': 'foreign',
      [HASH_KEY]: 'referenced',
      [QUERY_KEY]: 'referenced',
      [BARE_KEY]: 'referenced',
    })
    expect(result.outcomes).toEqual([])
    expect(result.blockers).toEqual([])
    expect(held(gcs.objects)).toEqual(before)
  })

  it('totals objects and bytes per bucket and verdict', async () => {
    const { run } = setUp()

    const result = await Effect.runPromise(run(DRY))

    expect(result.tallies.plant).toEqual({
      referenced: { count: 4, bytes: 2000 },
      'inside-grace': { count: 1, bytes: 400 },
      foreign: { count: 1, bytes: 700 },
      orphan: { count: 1, bytes: 500 },
    })
    expect(result.tallies.ai).toEqual({
      referenced: { count: 2, bytes: 1300 },
      'inside-grace': { count: 0, bytes: 0 },
      foreign: { count: 0, bytes: 0 },
      orphan: { count: 1, bytes: 600 },
    })
    expect(summaryLines(result, MOCK_BUCKET_NAMES)).toContain(
      `total\t${MOCK_BUCKET_NAMES.ai}\torphan\t1 objects\t600 bytes`
    )
  })

  it('deletes only the orphans with apply, and a rerun deletes nothing', async () => {
    const { gcs, run } = setUp()

    const first = await Effect.runPromise(run({ ...APPLY, batchSize: 1 }))
    const second = await Effect.runPromise(run(APPLY))

    expect(
      Array.map(first.outcomes, ({ _tag, object }) => [_tag, object.key])
    ).toEqual([
      ['Deleted', 'plants/p4/old.jpg'],
      ['Deleted', 'users/u2/chat/old.jpg'],
    ])
    expect(held(gcs.objects)).toEqual({
      plant: [
        HASH_KEY,
        LEGACY_KEY,
        QUERY_KEY,
        'exports/backup.csv',
        'plants/p1/kept.jpg',
        'plants/p3/fresh.jpg',
      ],
      ai: [BARE_KEY, 'users/u1/chat/kept.jpg'],
    })
    expect(second.outcomes).toEqual([])
  })

  it('deletes an orphan once it is older than the grace', async () => {
    const { gcs, run } = setUp()

    await Effect.runPromise(run({ ...APPLY, grace: Duration.hours(1) }))

    expect(gcs.objects.plant.has('plants/p3/fresh.jpg')).toBe(false)
  })

  it('records a failed delete and keeps the object', async () => {
    const { gcs, run } = setUp()
    gcs.outage.deletes = true

    const result = await Effect.runPromise(run(APPLY))

    expect(
      Array.map(result.outcomes, ({ _tag, object }) => [_tag, object.key])
    ).toEqual([
      ['Failed', 'plants/p4/old.jpg'],
      ['Failed', 'users/u2/chat/old.jpg'],
    ])
    expect(gcs.objects.plant.has('plants/p4/old.jpg')).toBe(true)
  })

  it.each<readonly [string, ReadonlyArray<StoredRef>, string]>([
    ['no reference was read', [], 'no stored reference was read'],
    [
      'a bucket has no referenced object',
      Array.take(REFS, 2),
      `bucket ${MOCK_BUCKET_NAMES.ai} holds 3 objects`,
    ],
    [
      'a reference mentions a bucket but names no object',
      [
        ...REFS,
        {
          source: 'users.image',
          ref: `https://storage.googleapis.com/${MOCK_BUCKET_NAMES.plant}`,
        },
      ],
      '1 references mention a bucket but name no object',
    ],
    [
      'a reference is too long to read',
      [
        ...REFS,
        {
          source: 'plants.image_url',
          ref: `https://storage.googleapis.com/${MOCK_BUCKET_NAMES.plant}/plants/p4/old.jpg?${'a'.repeat(2100)}`,
        },
      ],
      '1 references are too long to read',
    ],
  ])('refuses to delete when %s', async (_, refs, blocker) => {
    const { gcs, run } = setUp(Stream.fromIterable(refs))
    const before = held(gcs.objects)

    const dry = await Effect.runPromise(run(DRY))
    const refused = await Effect.runPromise(Effect.flip(run(APPLY)))

    expect(dry.blockers).toEqual(
      expect.arrayContaining([expect.stringContaining(blocker)])
    )
    expect(refused).toBeInstanceOf(SweepRefused)
    expect(refused.message).toContain(blocker)
    expect(held(gcs.objects)).toEqual(before)
  })

  it('fails and deletes nothing when the references cannot be read', async () => {
    const databaseDown = new SqlError({
      reason: new UnknownError({
        cause: new Error('database unreachable'),
        message: 'database unreachable',
      }),
    })
    const { gcs, run } = setUp(
      Stream.concat(Stream.fromIterable(REFS), Stream.fail(databaseDown))
    )
    const before = held(gcs.objects)

    const error = await Effect.runPromise(Effect.flip(run(APPLY)))

    expect(error).toBe(databaseDown)
    expect(held(gcs.objects)).toEqual(before)
  })
})
