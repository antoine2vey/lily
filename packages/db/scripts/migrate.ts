#!/usr/bin/env bun
/**
 * Production migration script using drizzle-orm (not drizzle-kit)
 * This script can run in production without devDependencies
 */

import { drizzle } from 'drizzle-orm/node-postgres'
import { migrate } from 'drizzle-orm/node-postgres/migrator'
import pg from 'pg'

const runMigrations = async () => {
  const databaseUrl = process.env.DATABASE_URL

  if (!databaseUrl) {
    console.error('Error: DATABASE_URL environment variable is required')
    process.exit(1)
  }

  console.log('Connecting to database...')

  const client = new pg.Client({
    connectionString: databaseUrl,
  })

  await client.connect()

  const db = drizzle(client)

  console.log('Running migrations...')

  await migrate(db, {
    migrationsFolder: './drizzle',
  })

  console.log('Migrations completed successfully!')

  await client.end()
}

runMigrations()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Migration failed:', error)
    process.exit(1)
  })
