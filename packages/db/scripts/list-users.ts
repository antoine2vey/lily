#!/usr/bin/env bun
import * as PgDrizzle from '@effect/sql-drizzle/Pg'
import { DrizzleLive } from '@lily/db'
import { users } from '@lily/db/schema'
import { Console, Effect } from 'effect'

const listUsers = Effect.gen(function* () {
  const db = yield* PgDrizzle.PgDrizzle

  const allUsers = yield* db
    .select({
      id: users.id,
      email: users.email,
      name: users.name,
      role: users.role,
      status: users.status,
    })
    .from(users)

  yield* Console.log('Existing users:')
  yield* Console.table(allUsers)
})

const program = listUsers.pipe(Effect.provide(DrizzleLive))

Effect.runPromise(program)
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Error listing users:', error)
    process.exit(1)
  })
