import { Transaction, transactQuietly } from '@lily/api/kernel/transact'
import { PgLive } from '@lily/db'
import { Data, Effect, Exit, ManagedRuntime } from 'effect'
import * as SqlClient from 'effect/sql/SqlClient'
import pg from 'pg'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

const { Pool } = pg

class BodyFailed extends Data.TaggedError('BodyFailed') {}

describe.skipIf(!process.env.DATABASE_URL_TEST)(
  'Transaction.afterCommit - Integration',
  () => {
    let pool: pg.Pool
    let runtime: ManagedRuntime.ManagedRuntime<SqlClient.SqlClient, unknown>
    let email: string
    let log: string[]

    beforeAll(() => {
      pool = new Pool({ connectionString: process.env.DATABASE_URL_TEST })
      runtime = ManagedRuntime.make(PgLive)
    })

    beforeEach(() => {
      email = `after-commit-${crypto.randomUUID()}@example.com`
      log = []
    })

    afterAll(async () => {
      await pool.query(`DELETE FROM users WHERE email LIKE 'after-commit-%'`)
      await runtime.dispose()
      await pool.end()
    })

    const rowSeenByAnotherSession = async () => {
      const { rowCount } = await pool.query(
        'SELECT 1 FROM users WHERE email = $1',
        [email]
      )
      return rowCount === 1
    }

    const writeTheRow = Effect.flatMap(
      SqlClient.SqlClient,
      (sql) =>
        sql`INSERT INTO users (email, email_verified) VALUES (${email}, true)`
    )

    const noted = (event: string) =>
      Effect.sync(() => {
        log.push(event)
      })

    const registered = (name: string) =>
      Effect.flatMap(Transaction, (transaction) =>
        transaction.afterCommit(
          Effect.flatMap(Effect.promise(rowSeenByAnotherSession), (seen) =>
            noted(`${name} ran, row ${seen ? 'committed' : 'not committed'}`)
          )
        )
      )

    it('runs an effect registered in the outermost transaction once the row is committed', async () => {
      await runtime.runPromise(
        transactQuietly(
          writeTheRow.pipe(
            Effect.andThen(registered('outer')),
            Effect.andThen(noted('body done'))
          )
        )
      )

      expect(log).toEqual(['body done', 'outer ran, row committed'])
    })

    it('runs an effect registered in a nested transaction after the outermost commit, not after the savepoint', async () => {
      await runtime.runPromise(
        transactQuietly(
          transactQuietly(
            Effect.andThen(writeTheRow, registered('nested'))
          ).pipe(Effect.andThen(noted('savepoint released')))
        )
      )

      expect(log).toEqual(['savepoint released', 'nested ran, row committed'])
    })

    it('drops the effects of a nested transaction that fails and keeps those of the outer one', async () => {
      await runtime.runPromise(
        transactQuietly(
          registered('outer').pipe(
            Effect.andThen(
              transactQuietly(
                Effect.andThen(registered('nested'), new BodyFailed())
              )
            ),
            Effect.catchTag('BodyFailed', () => writeTheRow)
          )
        )
      )

      expect(log).toEqual(['outer ran, row committed'])
    })

    it('drops every effect when the outermost transaction fails', async () => {
      const exit = await runtime.runPromiseExit(
        transactQuietly(
          writeTheRow.pipe(
            Effect.andThen(registered('outer')),
            Effect.andThen(transactQuietly(registered('nested'))),
            Effect.andThen(new BodyFailed())
          )
        )
      )

      expect({
        failed: Exit.isFailure(exit),
        log,
        rowKept: await rowSeenByAnotherSession(),
      }).toEqual({ failed: true, log: [], rowKept: false })
    })
  }
)
