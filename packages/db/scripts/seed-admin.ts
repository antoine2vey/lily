#!/usr/bin/env bun
/**
 * Seed script to promote an existing user to admin role
 * Usage: bun run seed:admin --email=user@example.com
 *
 * This script requires the user to already exist in the database.
 * Register via the app first, then run this script to promote to admin.
 */

import * as PgDrizzle from '@effect/sql-drizzle/Pg'
import { DrizzleLive } from '@lily/db'
import { users } from '@lily/db/schema'
import { eq } from 'drizzle-orm'
import { Array, Console, Effect, Option, pipe, String } from 'effect'

const getEmail = (): string => {
  const email = pipe(
    Array.findFirst(process.argv, String.startsWith('--email=')),
    Option.flatMap((arg) => Array.get(String.split(arg, '='), 1)),
    Option.getOrUndefined
  )

  if (!email) {
    console.error('Error: --email parameter is required')
    console.error('Usage: bun run seed:admin --email=user@example.com')
    process.exit(1)
  }

  return email
}

const seedAdmin = Effect.gen(function* () {
  const email = getEmail()
  const db = yield* PgDrizzle.PgDrizzle

  yield* Console.log(`Promoting user ${email} to admin...`)

  const [updated] = yield* db
    .update(users)
    .set({ role: 'admin', updatedAt: new Date() })
    .where(eq(users.email, email))
    .returning()

  if (!updated) {
    yield* Console.error(`Error: User with email ${email} not found`)
    yield* Console.error('Make sure the user has registered first')
    return yield* Effect.fail(new Error('User not found'))
  }

  yield* Console.log(
    `Success! User ${updated.name} (${updated.email}) is now an admin`
  )
  yield* Console.log(`  Role: ${updated.role}`)
  yield* Console.log(`  Status: ${updated.status}`)
})

const program = seedAdmin.pipe(Effect.provide(DrizzleLive))

Effect.runPromise(program)
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Error promoting user to admin:', error)
    process.exit(1)
  })
