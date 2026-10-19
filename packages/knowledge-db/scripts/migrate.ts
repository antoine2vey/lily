#!/usr/bin/env bun
/**
 * Production migration script using Bun's native SQL and raw migration files
 * This avoids drizzle-orm subpath resolution issues in Bun production builds
 */

import { runMigrations } from '@lily/db/migrator'

const databaseUrl = process.env.KNOWLEDGE_DATABASE_URL

if (!databaseUrl) {
  console.error(
    'Error: KNOWLEDGE_DATABASE_URL environment variable is required'
  )
  process.exit(1)
}

console.log('Connecting to knowledge database...')

runMigrations({
  databaseUrl,
  migrationsFolder: './drizzle',
  // pgvector backs the vector columns
  setupSql: 'CREATE EXTENSION IF NOT EXISTS vector',
})
  .then((migrationsRun) => {
    console.log(
      `Knowledge DB migrations completed successfully! (${migrationsRun} new migrations applied)`
    )
    process.exit(0)
  })
  .catch((error) => {
    console.error('Migration failed:', error)
    process.exit(1)
  })
