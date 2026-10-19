import { PgLive } from '@lily/db'
import { ConfigProvider, Effect, Layer, ManagedRuntime, Option } from 'effect'
import { SqlClient } from 'effect/sql/SqlClient'
import { afterAll, describe, expect, it } from 'vitest'

const runtimeWith = (env: Record<string, string>) =>
  ManagedRuntime.make(
    PgLive.pipe(
      Layer.provide(
        ConfigProvider.layer(
          ConfigProvider.fromUnknown({
            DATABASE_URL: Option.getOrElse(
              Option.fromNullishOr(process.env.DATABASE_URL_TEST),
              () => ''
            ),
            ...env,
          })
        )
      )
    )
  )

const show = (setting: string) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient
    const rows = yield* sql<{ value: string }>`
      SELECT current_setting(${setting}) AS value
    `
    return rows
  })

const backendPid = Effect.gen(function* () {
  const sql = yield* SqlClient
  return yield* sql<{ pid: number }>`SELECT pg_backend_pid() AS pid`
})

describe.skipIf(!process.env.DATABASE_URL_TEST)(
  'PgLive pool - Integration',
  () => {
    const defaults = runtimeWith({})
    const tight = runtimeWith({
      DATABASE_POOL_IDLE_TIMEOUT: '500 millis',
      DATABASE_STATEMENT_TIMEOUT: '200 millis',
    })

    afterAll(async () => {
      await defaults.dispose()
      await tight.dispose()
    })

    it('sends the session timeouts in the startup packet', async () => {
      const [statement, idleInTransaction] = await defaults.runPromise(
        Effect.all([
          show('statement_timeout'),
          show('idle_in_transaction_session_timeout'),
        ])
      )

      expect(statement).toEqual([{ value: '30s' }])
      expect(idleInTransaction).toEqual([{ value: '1min' }])
    })

    it('keeps one connection open across an idle period longer than the idle timeout', async () => {
      const first = await tight.runPromise(backendPid)
      await new Promise((resolve) => setTimeout(resolve, 1500))
      const second = await tight.runPromise(backendPid)

      expect(second).toEqual(first)
    })

    it('cancels a statement that runs past the statement timeout', async () => {
      const error = await tight.runPromise(
        Effect.flip(
          Effect.gen(function* () {
            const sql = yield* SqlClient
            return yield* sql`SELECT pg_sleep(2)`
          })
        )
      )

      expect(error.reason._tag).toBe('StatementTimeoutError')
    })
  }
)
