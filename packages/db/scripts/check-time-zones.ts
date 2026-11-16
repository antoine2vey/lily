#!/usr/bin/env bun

/**
 * Fails when the database behind DATABASE_URL_TEST rejects a zone name the api
 * can receive: every zone Bun's Intl knows, plus every alias in the IANA
 * `backward` file. Run with Bun, since Node's Intl lists a different set.
 * Usage: DATABASE_URL_TEST=... bun run --filter=@lily/db db:check-time-zones
 */

import { PgClient } from '@effect/sql-pg'
import {
  Array,
  Config,
  Console,
  Effect,
  Layer,
  Option,
  pipe,
  String,
} from 'effect'
import { FetchHttpClient, HttpClient, HttpClientResponse } from 'effect/http'
import * as SqlClient from 'effect/sql/SqlClient'

const TZDB_RELEASE = '2026f'
const BACKWARD_URL = `https://raw.githubusercontent.com/eggert/tz/${TZDB_RELEASE}/backward`

const backwardAliases = (file: string) =>
  pipe(
    String.split(file, '\n'),
    Array.filter(String.startsWith('Link')),
    Array.map((line) => Array.get(String.split(line, /\s+/), 2)),
    Array.getSomes
  )

const rejection = (zone: string) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    yield* sql`SELECT now() AT TIME ZONE ${zone}`
    return Option.none<string>()
  }).pipe(
    Effect.catchReason('SqlError', 'UnknownError', (reason) =>
      Effect.succeedSome(
        `${zone}: ${reason.cause instanceof Error ? reason.cause.message : 'rejected'}`
      )
    )
  )

const program = Effect.gen(function* () {
  const backward = yield* HttpClient.get(BACKWARD_URL).pipe(
    Effect.flatMap(HttpClientResponse.filterStatusOk),
    Effect.flatMap((response) => response.text)
  )
  const intlZones = Intl.supportedValuesOf('timeZone')
  const aliases = backwardAliases(backward)
  const zones = Array.dedupe([...intlZones, ...aliases])
  yield* Console.log(
    `Checking ${zones.length} zones: ${intlZones.length} from Bun's Intl, ${aliases.length} aliases from tzdb ${TZDB_RELEASE} backward`
  )

  const rejected = Array.getSomes(
    yield* Effect.forEach(zones, rejection, { concurrency: 10 })
  )
  yield* Array.isReadonlyArrayNonEmpty(rejected)
    ? Console.error(
        `The database rejected ${rejected.length} zones:\n${Array.join(rejected, '\n')}`
      )
    : Console.log('The database accepts every zone')
  return rejected
})

Effect.runPromise(
  program.pipe(
    Effect.provide(
      Layer.merge(
        PgClient.layerConfig({ url: Config.Redacted('DATABASE_URL_TEST') }),
        FetchHttpClient.layer
      )
    )
  )
)
  .then((rejected) =>
    process.exit(Array.isReadonlyArrayNonEmpty(rejected) ? 1 : 0)
  )
  .catch((error) => {
    console.error('Time zone check failed:', error)
    process.exit(1)
  })
