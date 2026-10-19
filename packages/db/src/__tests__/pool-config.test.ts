import { pgPoolConfig } from '@lily/db/pool-config'
import { ConfigProvider, Duration, Effect, Option, Redacted } from 'effect'
import { describe, expect, it } from 'vitest'

const resolve = (
  prefix: Parameters<typeof pgPoolConfig>[0],
  env: Record<string, string>
) => Effect.runSync(pgPoolConfig(prefix).parse(ConfigProvider.fromUnknown(env)))

describe('pgPoolConfig', () => {
  it('keeps a warm connection and bounds sessions by default', () => {
    const config = resolve('DATABASE', {
      DATABASE_URL: 'postgres://u:p@localhost:5432/lily',
    })

    expect(
      Option.map(Option.fromUndefinedOr(config.url), Redacted.value)
    ).toEqual(Option.some('postgres://u:p@localhost:5432/lily'))
    expect(config.minConnections).toBe(1)
    expect(config.maxConnections).toBeUndefined()
    expect(config.idleTimeout).toEqual(Duration.minutes(10))
    expect(config.connectionTTL).toEqual(Duration.hours(1))
    expect(config.startupParameters).toEqual({
      statement_timeout: '30000',
      idle_in_transaction_session_timeout: '60000',
    })
  })

  it('reads overrides from the prefixed variables only', () => {
    const config = resolve('KNOWLEDGE_DATABASE', {
      KNOWLEDGE_DATABASE_URL: 'postgres://u:p@localhost:5432/knowledge',
      KNOWLEDGE_DATABASE_POOL_MIN_CONNECTIONS: '2',
      KNOWLEDGE_DATABASE_POOL_IDLE_TIMEOUT: '15 minutes',
      KNOWLEDGE_DATABASE_POOL_CONNECTION_TTL: '2 hours',
      KNOWLEDGE_DATABASE_STATEMENT_TIMEOUT: '2 minutes',
      KNOWLEDGE_DATABASE_IDLE_IN_TRANSACTION_TIMEOUT: '5 seconds',
      DATABASE_STATEMENT_TIMEOUT: '1 second',
    })

    expect(config.minConnections).toBe(2)
    expect(config.idleTimeout).toEqual(Duration.minutes(15))
    expect(config.connectionTTL).toEqual(Duration.hours(2))
    expect(config.startupParameters).toEqual({
      statement_timeout: '120000',
      idle_in_transaction_session_timeout: '5000',
    })
  })
})
