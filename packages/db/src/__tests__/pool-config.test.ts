import { pgPoolConfig } from '@lily/db/pool-config'
import { ConfigProvider, Effect } from 'effect'
import { describe, expect, it } from 'vitest'

const resolve = (
  prefix: Parameters<typeof pgPoolConfig>[0],
  env: Record<string, string>
) => Effect.runSync(pgPoolConfig(prefix).parse(ConfigProvider.fromUnknown(env)))

// Postgres reads a bare statement_timeout as milliseconds, so a value in
// seconds would cancel every statement after a few milliseconds.
describe('pgPoolConfig', () => {
  it('sends the session timeouts in milliseconds, read from its own prefix only', () => {
    const config = resolve('KNOWLEDGE_DATABASE', {
      KNOWLEDGE_DATABASE_URL: 'postgres://u:p@localhost:5432/knowledge',
      KNOWLEDGE_DATABASE_STATEMENT_TIMEOUT: '2 minutes',
      KNOWLEDGE_DATABASE_IDLE_IN_TRANSACTION_TIMEOUT: '5 seconds',
      DATABASE_STATEMENT_TIMEOUT: '1 second',
    })

    expect(config.startupParameters).toEqual({
      statement_timeout: '120000',
      idle_in_transaction_session_timeout: '5000',
    })
  })
})
