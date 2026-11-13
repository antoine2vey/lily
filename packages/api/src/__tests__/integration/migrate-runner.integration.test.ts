import { execFile } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Array, Option, Record, String } from 'effect'
import pg from 'pg'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

const runnerScript = fileURLToPath(
  new URL('../../../../db/scripts/migrate.ts', import.meta.url)
)

const lines = (...parts: ReadonlyArray<string>) => Array.join(parts, '\n')

const runRunner = (cwd: string, databaseUrl: string) =>
  new Promise<{ code: number; output: string }>((resolve) => {
    execFile(
      'bun',
      [runnerScript],
      { cwd, env: { ...process.env, DATABASE_URL: databaseUrl } },
      (error, stdout, stderr) =>
        resolve({
          code: Option.match(Option.fromNullishOr(error), {
            onNone: () => 0,
            onSome: (e) => (typeof e.code === 'number' ? e.code : -1),
          }),
          output: `${stdout}${stderr}`,
        })
    )
  })

describe.skipIf(!process.env.DATABASE_URL_TEST)(
  'Production migration runner - Integration',
  () => {
    const adminUrl = Option.getOrElse(
      Option.fromNullishOr(process.env.DATABASE_URL_TEST),
      () => ''
    )
    let databaseName: string
    let databaseUrl: string
    let workDir: string
    let pool: pg.Pool

    const writeMigrations = async (files: Record<string, string>) => {
      await mkdir(join(workDir, 'drizzle'), { recursive: true })
      await Promise.all(
        Array.map(Record.toEntries(files), ([name, content]) =>
          writeFile(join(workDir, 'drizzle', name), content)
        )
      )
    }

    const recordedHashes = async () => {
      const result = await pool.query<{ hash: string }>(
        'SELECT hash FROM "__drizzle_migrations" ORDER BY hash'
      )
      return Array.map(result.rows, (r) => r.hash)
    }

    const loggedFiles = async () => {
      const result = await pool.query<{ file: string }>(
        'SELECT file FROM applied_log ORDER BY file'
      )
      return Array.map(result.rows, (r) => r.file)
    }

    const hashIndexExists = async () => {
      const result = await pool.query(
        `SELECT 1 FROM pg_indexes WHERE indexname = '__drizzle_migrations_hash_unique'`
      )
      return result.rowCount === 1
    }

    beforeEach(async () => {
      databaseName = `lily_migrate_${String.replaceAll('-', '')(randomUUID())}`
      const admin = new pg.Client({ connectionString: adminUrl })
      await admin.connect()
      await admin.query(`CREATE DATABASE "${databaseName}"`)
      await admin.end()

      const url = new URL(adminUrl)
      url.pathname = `/${databaseName}`
      databaseUrl = url.toString()
      pool = new pg.Pool({ connectionString: databaseUrl })
      workDir = await mkdtemp(join(tmpdir(), 'lily-migrate-'))
    })

    afterEach(async () => {
      await pool.end()
      await rm(workDir, { recursive: true, force: true })
      const admin = new pg.Client({ connectionString: adminUrl })
      await admin.connect()
      await admin.query(`DROP DATABASE "${databaseName}" WITH (FORCE)`)
      await admin.end()
    })

    it('applies each pending file exactly once when two runners start together', async () => {
      await writeMigrations({
        '0000_init.sql': 'CREATE TABLE applied_log (file text NOT NULL);',
        '0001_slow.sql': lines(
          'SELECT pg_sleep(0.5);',
          '--> statement-breakpoint',
          "INSERT INTO applied_log VALUES ('0001');"
        ),
      })

      const [first, second] = await Promise.all([
        runRunner(workDir, databaseUrl),
        runRunner(workDir, databaseUrl),
      ])

      expect(first.code, first.output).toBe(0)
      expect(second.code, second.output).toBe(0)
      expect(await loggedFiles()).toEqual(['0001'])
      expect(await recordedHashes()).toEqual(['0000_init', '0001_slow'])
      expect(await hashIndexExists()).toBe(true)
    }, 30_000)

    it('leaves no changes and no record when a file fails', async () => {
      await writeMigrations({
        '0000_init.sql': 'CREATE TABLE applied_log (file text NOT NULL);',
        '0001_broken.sql': lines(
          "INSERT INTO applied_log VALUES ('0001');",
          '--> statement-breakpoint',
          'SELECT 1 / 0;'
        ),
        '0002_after.sql': "INSERT INTO applied_log VALUES ('0002');",
      })

      const result = await runRunner(workDir, databaseUrl)

      expect(result.code).toBe(1)
      expect(await loggedFiles()).toEqual([])
      expect(await recordedHashes()).toEqual(['0000_init'])
    }, 30_000)

    it('runs a no-transaction file statement by statement', async () => {
      await writeMigrations({
        '0000_init.sql': 'CREATE TABLE applied_log (file text NOT NULL);',
        '0001_indexes.sql': lines(
          '-- migrate:no-transaction',
          'CREATE INDEX CONCURRENTLY IF NOT EXISTS applied_log_a_idx ON applied_log (file);',
          '--> statement-breakpoint',
          'CREATE INDEX CONCURRENTLY IF NOT EXISTS applied_log_b_idx ON applied_log (file);'
        ),
      })

      const result = await runRunner(workDir, databaseUrl)

      expect(result.code, result.output).toBe(0)
      const indexes = await pool.query<{ indexname: string }>(
        `SELECT indexname FROM pg_indexes WHERE tablename = 'applied_log' ORDER BY indexname`
      )
      expect(Array.map(indexes.rows, (r) => r.indexname)).toEqual([
        'applied_log_a_idx',
        'applied_log_b_idx',
      ])
      expect(await recordedHashes()).toEqual(['0000_init', '0001_indexes'])
    }, 30_000)

    it('stops the reminder occasion index on rows that share a key, deletes none, and builds once they differ', async () => {
      const occasionIndex = await readFile(
        fileURLToPath(
          new URL(
            '../../../../db/drizzle/0076_reminder_occasion_unique.sql',
            import.meta.url
          )
        ),
        'utf-8'
      )
      const [user, plant] = [randomUUID(), randomUUID()]
      await pool.query(
        'CREATE TABLE notifications (id serial PRIMARY KEY, user_id uuid NOT NULL, plant_id uuid, type text NOT NULL, occasion_day date)'
      )
      await pool.query(
        `INSERT INTO notifications (user_id, plant_id, type, occasion_day) VALUES
          ($1, $2, 'watering_reminder', '2026-11-12'),
          ($1, $2, 'watering_reminder', '2026-11-12'),
          ($1, $2, 'watering_reminder', NULL),
          ($1, $2, 'watering_reminder', NULL)`,
        [user, plant]
      )
      await pool
        .query(
          'CREATE UNIQUE INDEX CONCURRENTLY notifications_occasion_unique ON notifications (user_id, plant_id, type, occasion_day) WHERE occasion_day IS NOT NULL'
        )
        .catch(() => undefined)
      const indexIsValid = async () => {
        const result = await pool.query<{ valid: boolean }>(
          `SELECT i.indisvalid AS valid FROM pg_index i JOIN pg_class c ON c.oid = i.indexrelid WHERE c.relname = 'notifications_occasion_unique'`
        )
        return Array.map(result.rows, (r) => r.valid)
      }
      const rowCount = async () =>
        (await pool.query('SELECT 1 FROM notifications')).rowCount
      await writeMigrations({
        '0076_reminder_occasion_unique.sql': occasionIndex,
      })
      expect(await indexIsValid()).toEqual([false])

      const refused = await runRunner(workDir, databaseUrl)

      expect(refused.code).toBe(1)
      expect(refused.output).toContain('2 rows share user')
      expect(await rowCount()).toBe(4)
      expect(await recordedHashes()).toEqual([])

      await pool.query(
        `UPDATE notifications SET occasion_day = '2026-11-13' WHERE id = 2`
      )
      const built = await runRunner(workDir, databaseUrl)

      expect(built.code, built.output).toBe(0)
      expect(await rowCount()).toBe(4)
      expect(await indexIsValid()).toEqual([true])
      expect(await recordedHashes()).toEqual(['0076_reminder_occasion_unique'])
    }, 30_000)

    it('builds the due day index over an invalid one a failed build left, and writes no row', async () => {
      const dueDayIndex = await readFile(
        fileURLToPath(
          new URL(
            '../../../../db/drizzle/0077_schedule_due_day_index.sql',
            import.meta.url
          )
        ),
        'utf-8'
      )
      await pool.query(
        'CREATE TABLE plant_care_schedules (id serial PRIMARY KEY, next_care_at timestamptz NOT NULL, due_day date)'
      )
      await pool.query(
        `INSERT INTO plant_care_schedules (next_care_at, due_day) VALUES
          ('2026-11-12T00:00:00Z', '2026-11-12'),
          ('2026-11-13T00:00:00Z', NULL)`
      )
      await pool.query(
        'CREATE INDEX plant_care_schedules_due_day_idx ON plant_care_schedules (id)'
      )
      await pool.query(
        `UPDATE pg_index SET indisvalid = false WHERE indexrelid = 'plant_care_schedules_due_day_idx'::regclass`
      )
      const index = async () => {
        const result = await pool.query<{ valid: boolean; definition: string }>(
          `SELECT i.indisvalid AS valid, pg_get_indexdef(i.indexrelid) AS definition FROM pg_index i JOIN pg_class c ON c.oid = i.indexrelid WHERE c.relname = 'plant_care_schedules_due_day_idx'`
        )
        return result.rows
      }
      const rows = async () =>
        (
          await pool.query<{ id: number; day: string | null }>(
            'SELECT id, due_day::text AS day FROM plant_care_schedules ORDER BY id'
          )
        ).rows
      const before = await rows()
      await writeMigrations({ '0077_schedule_due_day_index.sql': dueDayIndex })

      const built = await runRunner(workDir, databaseUrl)

      expect(built.code, built.output).toBe(0)
      expect(await index()).toEqual([
        {
          valid: true,
          definition:
            'CREATE INDEX plant_care_schedules_due_day_idx ON public.plant_care_schedules USING btree (due_day)',
        },
      ])
      expect(await rows()).toEqual(before)
      expect(before).toEqual([
        { id: 1, day: '2026-11-12' },
        { id: 2, day: null },
      ])
      expect(await recordedHashes()).toEqual(['0077_schedule_due_day_index'])
    }, 30_000)

    it('keeps running against a migrations table that already holds duplicate hashes', async () => {
      await pool.query(
        'CREATE TABLE "__drizzle_migrations" (id SERIAL PRIMARY KEY, hash TEXT NOT NULL, created_at BIGINT)'
      )
      await pool.query('CREATE TABLE applied_log (file text NOT NULL)')
      await pool.query(
        `INSERT INTO "__drizzle_migrations" (hash, created_at) VALUES ('0000_init', 1), ('0000_init', 2)`
      )
      await writeMigrations({
        '0000_init.sql': 'CREATE TABLE applied_log (file text NOT NULL);',
        '0001_next.sql': "INSERT INTO applied_log VALUES ('0001');",
      })

      const result = await runRunner(workDir, databaseUrl)

      expect(result.code, result.output).toBe(0)
      expect(await loggedFiles()).toEqual(['0001'])
      expect(await recordedHashes()).toEqual([
        '0000_init',
        '0000_init',
        '0001_next',
      ])
      expect(await hashIndexExists()).toBe(false)
    }, 30_000)
  }
)
