#!/usr/bin/env bun

/**
 * Fails when the database behind DATABASE_URL_TEST, or Bun's Intl, rejects a
 * zone in CANONICAL_TIME_ZONES, the names users.timezone and canopies.timezone
 * hold. Bun alone applies zone rules, so offsets are not compared. A rejection
 * usually means IANA demoted a canonical zone to a link that the image's
 * tzdata no longer ships. packages/db/CLAUDE.md has the playbook.
 * Usage: DATABASE_URL_TEST=... bun run --filter=@lily/db db:check-time-zones
 */

import { PgClient } from '@effect/sql-pg'
import { CANONICAL_TIME_ZONES, TZDATA_VERSION } from '@lily/shared'
import { Array, Config, Console, DateTime, Effect, Option } from 'effect'
import * as SqlClient from 'effect/sql/SqlClient'

const postgresRejection = (zone: string) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    yield* sql`SELECT now() AT TIME ZONE ${zone}`
    return Option.none<string>()
  }).pipe(
    Effect.catchReason('SqlError', 'UnknownError', (reason) =>
      Effect.succeedSome(
        `Postgres ${zone}: ${reason.cause instanceof Error ? reason.cause.message : 'rejected'}`
      )
    )
  )

const program = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient
  const version = Option.match(
    Array.head(yield* sql<{ readonly version: string }>`SELECT version()`),
    { onNone: () => 'unknown', onSome: (row) => row.version }
  )
  yield* Console.log(
    `Checking the ${CANONICAL_TIME_ZONES.length} canonical zones of tzdata ${TZDATA_VERSION} against ${version} and Bun ${Bun.version}`
  )
  const bunRejections = Array.map(
    Array.filter(CANONICAL_TIME_ZONES, (zone) =>
      Option.isNone(DateTime.zoneMakeNamed(zone))
    ),
    (zone) => `Bun ${zone}: Intl rejects it`
  )
  const postgresRejections = Array.getSomes(
    yield* Effect.forEach(CANONICAL_TIME_ZONES, postgresRejection, {
      concurrency: 10,
    })
  )
  const rejections = [...postgresRejections, ...bunRejections]
  yield* Array.isReadonlyArrayNonEmpty(rejections)
    ? Console.error(
        `${rejections.length} canonical zones rejected:\n${Array.join(rejections, '\n')}`
      )
    : Console.log('Postgres and Bun accept every canonical zone')
  return rejections.length
})

Effect.runPromise(
  program.pipe(
    Effect.provide(
      PgClient.layerConfig({ url: Config.Redacted('DATABASE_URL_TEST') })
    )
  )
)
  .then((failures) => process.exit(failures > 0 ? 1 : 0))
  .catch((error) => {
    console.error('Time zone check failed:', error)
    process.exit(1)
  })
