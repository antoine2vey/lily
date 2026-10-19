import type { PgClient } from '@effect/sql-pg'
import { Config, Duration } from 'effect'

const sessionTimeout = (duration: Duration.Duration): string =>
  `${Duration.toMillis(duration)}`

/**
 * Pool and session settings for a Postgres client, read from `<prefix>_*`
 * variables next to `<prefix>_URL`.
 *
 * One warm connection survives an idle period longer than the 5-minute
 * scheduler polls, so a tick no longer pays for a fresh connection. The
 * session timeouts stop a runaway statement or an abandoned transaction from
 * holding a pooled connection forever.
 */
export const pgPoolConfig = (
  prefix: 'DATABASE' | 'KNOWLEDGE_DATABASE'
): Config.Config<PgClient.PgPoolConfig> =>
  Config.all({
    url: Config.Redacted(`${prefix}_URL`),
    minConnections: Config.Int(`${prefix}_POOL_MIN_CONNECTIONS`).pipe(
      Config.withDefault(1)
    ),
    idleTimeout: Config.Duration(`${prefix}_POOL_IDLE_TIMEOUT`).pipe(
      Config.withDefault(Duration.minutes(10))
    ),
    connectionTTL: Config.Duration(`${prefix}_POOL_CONNECTION_TTL`).pipe(
      Config.withDefault(Duration.hours(1))
    ),
    statementTimeout: Config.Duration(`${prefix}_STATEMENT_TIMEOUT`).pipe(
      Config.withDefault(Duration.seconds(30))
    ),
    idleInTransactionTimeout: Config.Duration(
      `${prefix}_IDLE_IN_TRANSACTION_TIMEOUT`
    ).pipe(Config.withDefault(Duration.minutes(1))),
  }).pipe(
    Config.map(({ statementTimeout, idleInTransactionTimeout, ...pool }) => ({
      ...pool,
      startupParameters: {
        statement_timeout: sessionTimeout(statementTimeout),
        idle_in_transaction_session_timeout: sessionTimeout(
          idleInTransactionTimeout
        ),
      },
    }))
  )
