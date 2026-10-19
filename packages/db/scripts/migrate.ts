#!/usr/bin/env bun
/**
 * Production migration script using Bun's native SQL and raw migration files
 * This avoids drizzle-orm subpath resolution issues in Bun production builds
 */

import { runMigrations } from '../src/migrator'

const databaseUrl = process.env.DATABASE_URL

if (!databaseUrl) {
  console.error('Error: DATABASE_URL environment variable is required')
  process.exit(1)
}

console.log('Connecting to database...')

runMigrations({ databaseUrl, migrationsFolder: './drizzle' })
  .then((migrationsRun) => {
    console.log(
      `Migrations completed successfully! (${migrationsRun} new migrations applied)`
    )
    process.exit(0)
  })
  .catch((error) => {
    console.error('Migration failed:', error)
    process.exit(1)
  })
