import { execFile } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
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
