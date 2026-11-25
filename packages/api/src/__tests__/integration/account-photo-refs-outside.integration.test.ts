import { MOCK_BUCKET_NAMES } from '@lily/api/__tests__/mocks/gcs.service'
import {
  AccountPhotoRepository,
  AccountPhotoRepositoryLive,
} from '@lily/api/repositories/account-photo.repository'
import {
  legacyStampOf,
  namedObjects,
} from '@lily/api/services/file/stored-object'
import { DrizzleLive, PgLive } from '@lily/db'
import * as schema from '@lily/db/schema'
import { Rating } from '@lily/shared'
import { mintStoredRef } from '@lily/shared/services/file/stored-ref-mint'
import { sql } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/node-postgres'
import { Effect, Layer, ManagedRuntime, Option } from 'effect'
import pg from 'pg'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

const { Pool } = pg

const BaseLive = AccountPhotoRepositoryLive.pipe(
  Layer.provideMerge(DrizzleLive),
  Layer.provideMerge(PgLive)
)

const KEY = '1700000000000-detect/sam-scan.png'
const PLAIN = `https://storage.googleapis.com/${MOCK_BUCKET_NAMES.plant}/${KEY}`
const BUCKET_PATH = `${MOCK_BUCKET_NAMES.plant}/`

/**
 * Every known spelling of one URL. `namedObjects` and the SQL filter of
 * `findRefsOutside` are two readings of the same rule: a spelling that the
 * first resolves and the second misses lets a purge delete a photo that
 * another account holds. A new spelling is one more row here.
 */
const SPELLINGS: readonly (readonly [string, string])[] = [
  ['the plain URL', PLAIN],
  ['a query string', `${PLAIN}?v=1`],
  ['a fragment', `${PLAIN}#x`],
  ['a leading space', ` ${PLAIN}`],
  ['another host', PLAIN.replace('storage.googleapis.com', 'evil.example')],
  [
    'an uppercase scheme and host',
    PLAIN.replace(
      'https://storage.googleapis.com',
      'HTTPS://STORAGE.GOOGLEAPIS.COM'
    ),
  ],
  [
    'backslashes',
    PLAIN.replace(BUCKET_PATH, `${MOCK_BUCKET_NAMES.plant}\\`).replace(
      'detect/',
      'detect\\'
    ),
  ],
  ['a dot segment', PLAIN.replace(BUCKET_PATH, `${BUCKET_PATH}x/../`)],
  [
    'an encoded dot segment',
    PLAIN.replace(BUCKET_PATH, `${BUCKET_PATH}x/%2e%2e/`),
  ],
  ['an encoded dash', PLAIN.replace('000-detect', '000%2Ddetect')],
  ['a lowercase encoded dash', PLAIN.replace('000-detect', '000%2ddetect')],
  ['an encoded slash', PLAIN.replace('detect/', 'detect%2F')],
  ['encoded letters', PLAIN.replace('detect', '%64%65tect')],
  ['an encoded digit', PLAIN.replace('/1700', '/1%3700')],
  ['a digit encoded twice', PLAIN.replace('/1700', '/1%253700')],
  ['a digit encoded three times', PLAIN.replace('/1700', '/1%25253700')],
  ['a tab inside the stamp', PLAIN.replace('17000', '17\t000')],
  ['a line feed inside the stamp', PLAIN.replace('17000', '17\n000')],
  ['a carriage return inside the stamp', PLAIN.replace('17000', '17\r000')],
  ['a tab inside an encoded digit', PLAIN.replace('/1700', '/1%3\t700')],
]

describe.skipIf(!process.env.DATABASE_URL_TEST)(
  'References outside an account, by spelling - Integration',
  () => {
    let pool: pg.Pool
    let db: ReturnType<typeof drizzle>
    let runtime: ManagedRuntime.ManagedRuntime<
      Layer.Success<typeof BaseLive>,
      Layer.Error<typeof BaseLive>
    >
    let alex: string

    const user = async (name: string) => {
      const [row] = await db
        .insert(schema.users)
        .values({
          email: `${name}-${Date.now()}-${Math.random()}@example.com`,
          name,
          emailVerified: true,
          role: 'user',
          status: 'active',
        })
        .returning()
      if (!row) throw new Error(`Failed to create ${name}`)
      return row.id
    }

    beforeAll(async () => {
      pool = new Pool({ connectionString: process.env.DATABASE_URL_TEST })
      db = drizzle(pool, { schema })
      runtime = ManagedRuntime.make(BaseLive)
    })

    beforeEach(async () => {
      for (const table of ['plants', 'users']) {
        await db.execute(
          sql.raw(`TRUNCATE TABLE ${table} RESTART IDENTITY CASCADE`)
        )
      }
      alex = await user('alex')
      const sam = await user('sam')
      await db.insert(schema.plants).values({
        userId: sam,
        createdByUserId: sam,
        name: 'Fern',
        health: 'HEALTHY',
        humidityRating: Rating.make(3),
        lightingRating: Rating.make(3),
        petToxicityRating: Rating.make(1),
        wateringRating: Rating.make(3),
      })
    })

    afterAll(async () => {
      await runtime.dispose()
      await pool.end()
    })

    it.each(SPELLINGS)(
      'finds a reference spelled with %s',
      async (_case, spelling) => {
        await db
          .update(schema.plants)
          .set({ imageUrl: mintStoredRef(spelling) })

        const found = await runtime.runPromise(
          Effect.flatMap(AccountPhotoRepository, (repo) =>
            repo.findRefsOutside(alex, [Option.getOrThrow(legacyStampOf(KEY))])
          )
        )

        expect(namedObjects(MOCK_BUCKET_NAMES)(spelling)).toContainEqual({
          bucket: 'plant',
          key: KEY,
        })
        expect(found).toEqual([spelling])
      }
    )
  }
)
