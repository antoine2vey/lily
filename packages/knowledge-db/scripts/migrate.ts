#!/usr/bin/env bun
/**
 * Production migration script using Bun's native SQL and raw migration files
 * This avoids drizzle-orm subpath resolution issues in Bun production builds
 */

import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { SQL } from 'bun'
import { Array, Order, pipe } from 'effect'

const runMigrations = async () => {
  const databaseUrl = process.env.KNOWLEDGE_DATABASE_URL

  if (!databaseUrl) {
    console.error(
      'Error: KNOWLEDGE_DATABASE_URL environment variable is required'
    )
    process.exit(1)
  }

  console.log('Connecting to knowledge database...')

  const sql = new SQL(databaseUrl)

  // Enable pgvector extension required for vector columns
  await sql`CREATE EXTENSION IF NOT EXISTS vector`

  // Create migrations table if not exists
  await sql`
    CREATE TABLE IF NOT EXISTS "__drizzle_migrations" (
      id SERIAL PRIMARY KEY,
      hash TEXT NOT NULL,
      created_at BIGINT
    )
  `

  // Get already applied migrations
  const applied = await sql`SELECT hash FROM "__drizzle_migrations"`
  const appliedHashes = new Set(
    Array.map(applied as { hash: string }[], (r) => r.hash)
  )

  // Read migration files
  const migrationsFolder = './drizzle'
  const files = await readdir(migrationsFolder)
  const sqlFiles = pipe(
    Array.filter(files, (f) => f.endsWith('.sql')),
    Array.sort(Order.string)
  )

  console.log(`Found ${sqlFiles.length} migration files`)

  let migrationsRun = 0

  for (const file of sqlFiles) {
    const hash = file.replace('.sql', '')

    if (appliedHashes.has(hash)) {
      console.log(`  Skipping ${file} (already applied)`)
      continue
    }

    console.log(`  Applying ${file}...`)

    const filePath = join(migrationsFolder, file)
    const content = await readFile(filePath, 'utf-8')

    // Execute migration
    await sql.unsafe(content)

    // Record migration
    await sql`
      INSERT INTO "__drizzle_migrations" (hash, created_at)
      VALUES (${hash}, ${Date.now()})
    `

    migrationsRun++
  }

  console.log(
    `Knowledge DB migrations completed successfully! (${migrationsRun} new migrations applied)`
  )

  sql.close()
}

runMigrations()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Migration failed:', error)
    process.exit(1)
  })
