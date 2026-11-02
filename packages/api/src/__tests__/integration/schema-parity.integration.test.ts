import { readdir } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { Array, Order, pipe, String } from 'effect'
import pg from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const migrationsFolder = fileURLToPath(
  new URL('../../../../db/drizzle/', import.meta.url)
)

describe.skipIf(!process.env.DATABASE_URL_TEST)(
  'Test database built from the production migrations - Integration',
  () => {
    let pool: pg.Pool

    beforeAll(() => {
      pool = new pg.Pool({ connectionString: process.env.DATABASE_URL_TEST })
    })

    afterAll(async () => {
      await pool.end()
    })

    it('records every migration file in __drizzle_migrations', async () => {
      const files = pipe(
        await readdir(migrationsFolder),
        Array.filter(String.endsWith('.sql')),
        Array.map(String.replace('.sql', '')),
        Array.sort(Order.String)
      )
      const result = await pool.query<{ hash: string }>(
        'SELECT hash FROM "__drizzle_migrations" ORDER BY hash'
      )
      expect(Array.map(result.rows, (r) => r.hash)).toEqual(files)
    })

    it('installs the insert triggers the migrations create', async () => {
      const result = await pool.query<{ tgname: string; table: string }>(
        `SELECT t.tgname, c.relname AS "table"
         FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
         WHERE NOT t.tgisinternal
         ORDER BY t.tgname`
      )
      expect(result.rows).toEqual([
        { tgname: 'care_logs_actor_fallback', table: 'care_logs' },
        { tgname: 'plants_creator_fallback', table: 'plants' },
      ])
    })
  }
)
