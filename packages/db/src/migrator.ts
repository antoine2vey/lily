/**
 * Applies the hand-written SQL files in a migrations folder, in filename
 * order, recording each file name in `__drizzle_migrations`.
 *
 * Safe to start from several containers at once: the whole run holds a
 * session advisory lock, so a second runner waits, then sees the files the
 * first one recorded. Each file and its record commit in one transaction, so
 * a failing file leaves neither partial changes nor a record.
 *
 * A file whose first line is `-- migrate:no-transaction` runs outside a
 * transaction, one `--> statement-breakpoint` chunk at a time. Use it for
 * statements Postgres refuses inside a transaction, such as
 * `CREATE INDEX CONCURRENTLY`. A failure there can leave earlier chunks
 * applied and the file unrecorded, so write those statements to be rerun
 * (`IF NOT EXISTS`, and drop any INVALID index a failed build left behind).
 */

import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { SQL } from 'bun'
import { Array, Order, pipe, String } from 'effect'

// Advisory locks are scoped to one database, so the app and knowledge
// databases can share the key.
const MIGRATION_LOCK_KEY = 7_201_456_311

const NO_TRANSACTION_DIRECTIVE = '-- migrate:no-transaction'
const STATEMENT_BREAKPOINT = '--> statement-breakpoint'

export interface MigrationOptions {
  readonly databaseUrl: string
  readonly migrationsFolder: string
  /** Runs under the lock before the migrations table is touched. */
  readonly setupSql?: string
}

const ensureUniqueHash = async (conn: SQL) => {
  const duplicates: ReadonlyArray<{ hash: string }> = await conn`
    SELECT hash FROM "__drizzle_migrations"
    GROUP BY hash HAVING count(*) > 1
  `
  if (Array.isReadonlyArrayNonEmpty(duplicates)) {
    console.warn(
      `  Not adding the unique hash index: duplicate rows for ${Array.join(
        Array.map(duplicates, (d) => d.hash),
        ', '
      )}`
    )
    return
  }
  await conn`
    CREATE UNIQUE INDEX IF NOT EXISTS "__drizzle_migrations_hash_unique"
    ON "__drizzle_migrations" (hash)
  `
}

const applyInTransaction = (conn: SQL, hash: string, content: string) =>
  conn.begin(async (tx) => {
    await tx.unsafe(content)
    await tx`
      INSERT INTO "__drizzle_migrations" (hash, created_at)
      VALUES (${hash}, ${Date.now()})
    `
  })

const applyWithoutTransaction = async (
  conn: SQL,
  hash: string,
  content: string
) => {
  const statements = pipe(
    String.split(content, STATEMENT_BREAKPOINT),
    Array.map(String.trim),
    Array.filter(String.isNonEmpty)
  )
  for (const statement of statements) {
    await conn.unsafe(statement)
  }
  await conn`
    INSERT INTO "__drizzle_migrations" (hash, created_at)
    VALUES (${hash}, ${Date.now()})
  `
}

/** Returns the number of files applied by this run. */
export const runMigrations = async (
  options: MigrationOptions
): Promise<number> => {
  const sql = new SQL(options.databaseUrl)
  // The lock belongs to one session, so every statement runs on this
  // connection. Closing it releases the lock, including after a crash.
  const conn = await sql.reserve()

  try {
    console.log('Waiting for the migration lock...')
    await conn`SELECT pg_advisory_lock(${MIGRATION_LOCK_KEY})`

    if (options.setupSql !== undefined) {
      await conn.unsafe(options.setupSql)
    }

    await conn`
      CREATE TABLE IF NOT EXISTS "__drizzle_migrations" (
        id SERIAL PRIMARY KEY,
        hash TEXT NOT NULL,
        created_at BIGINT
      )
    `
    await ensureUniqueHash(conn)

    const applied: ReadonlyArray<{ hash: string }> =
      await conn`SELECT hash FROM "__drizzle_migrations"`
    const appliedHashes = new Set(Array.map(applied, (r) => r.hash))

    const files = await readdir(options.migrationsFolder)
    const sqlFiles = pipe(
      Array.filter(files, String.endsWith('.sql')),
      Array.sort(Order.String)
    )

    console.log(`Found ${sqlFiles.length} migration files`)

    let migrationsRun = 0

    for (const file of sqlFiles) {
      const hash = String.replace('.sql', '')(file)

      if (appliedHashes.has(hash)) {
        console.log(`  Skipping ${file} (already applied)`)
        continue
      }

      const content = await readFile(
        join(options.migrationsFolder, file),
        'utf-8'
      )

      if (String.startsWith(NO_TRANSACTION_DIRECTIVE)(content)) {
        console.log(`  Applying ${file} (no transaction)...`)
        await applyWithoutTransaction(conn, hash, content)
      } else {
        console.log(`  Applying ${file}...`)
        await applyInTransaction(conn, hash, content)
      }

      migrationsRun++
    }

    return migrationsRun
  } finally {
    conn.release()
    await sql.close()
  }
}
