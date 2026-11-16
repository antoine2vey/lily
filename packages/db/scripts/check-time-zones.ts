#!/usr/bin/env bun

/**
 * Fails when the database behind DATABASE_URL_TEST rejects a zone name the api
 * can receive (every zone Bun's Intl knows, plus every alias in the IANA
 * `backward` file), or gives a zone Bun's Intl knows a different UTC offset
 * than Bun does at any sampled instant from the start of this year to the end
 * of the next. Aliases stay out of the offset comparison because Postgres reads
 * CET, EET, MET and WET as fixed-offset abbreviations. Run with Bun, since
 * Node's Intl lists a different set and carries different zone data.
 * Usage: DATABASE_URL_TEST=... bun run --filter=@lily/db db:check-time-zones
 */

import { PgClient } from '@effect/sql-pg'
import {
  Array,
  Config,
  Console,
  DateTime,
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
    return Option.none<{ readonly zone: string; readonly message: string }>()
  }).pipe(
    Effect.catchReason('SqlError', 'UnknownError', (reason) =>
      Effect.succeedSome({
        zone,
        message: `${zone}: ${reason.cause instanceof Error ? reason.cause.message : 'rejected'}`,
      })
    )
  )

const offsetDisagreement = ([zone, timeZone]: readonly [
  string,
  DateTime.TimeZone.Named,
]) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    const samples = yield* sql<{
      readonly epochMs: number
      readonly offsetSeconds: number
    }>`
      SELECT (extract(epoch FROM t) * 1000)::float8 AS "epochMs",
        extract(epoch FROM (t AT TIME ZONE ${zone}) - (t AT TIME ZONE 'UTC'))::int AS "offsetSeconds"
      FROM generate_series(
        date_trunc('year', now(), 'UTC'),
        date_trunc('year', now(), 'UTC') + interval '2 years',
        interval '6 hours'
      ) AS t`
    const disagreeing = Array.getSomes(
      Array.map(samples, ({ epochMs, offsetSeconds }) => {
        const bun = DateTime.makeZonedUnsafe(epochMs, { timeZone })
        return DateTime.zonedOffset(bun) === offsetSeconds * 1000
          ? Option.none()
          : Option.some({
              bun,
              postgres: DateTime.makeZonedUnsafe(epochMs, {
                timeZone: DateTime.zoneMakeOffset(offsetSeconds * 1000),
              }),
            })
      })
    )
    return Option.map(
      Array.head(disagreeing),
      ({ bun, postgres }) =>
        `${zone}: ${disagreeing.length} of ${samples.length} instants, first ${DateTime.formatIso(bun)} Postgres ${DateTime.zonedOffsetIso(postgres)} Bun ${DateTime.zonedOffsetIso(bun)}`
    )
  })

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
        `The database rejected ${rejected.length} zones:\n${Array.join(
          Array.map(rejected, ({ message }) => message),
          '\n'
        )}`
      )
    : Console.log('The database accepts every zone')

  const rejectedZones = new Set(Array.map(rejected, ({ zone }) => zone))
  const comparable = Array.getSomes(
    Array.map(intlZones, (zone) =>
      rejectedZones.has(zone)
        ? Option.none()
        : Option.map(
            DateTime.zoneMakeNamed(zone),
            (timeZone) => [zone, timeZone] as const
          )
    )
  )
  const disagreements = Array.getSomes(
    yield* Effect.forEach(comparable, offsetDisagreement, { concurrency: 10 })
  )
  yield* Array.isReadonlyArrayNonEmpty(disagreements)
    ? Console.error(
        `Bun and the database disagree on the offset of ${disagreements.length} zones:\n${Array.join(disagreements, '\n')}\nThe newer side holds the current IANA data. If it is the database, update Bun's zone data with scripts/update-icu-tzdata.sh <release>.`
      )
    : Console.log(
        `Bun and the database agree on the offset of ${comparable.length} zones`
      )
  return rejected.length + disagreements.length
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
  .then((failures) => process.exit(failures > 0 ? 1 : 0))
  .catch((error) => {
    console.error('Time zone check failed:', error)
    process.exit(1)
  })
