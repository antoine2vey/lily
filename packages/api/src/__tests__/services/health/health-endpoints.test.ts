import { HealthApiGroup } from '@lily/api/services/health/api'
import { healthHandlers } from '@lily/api/services/health/handlers'
import { RedisClient } from '@lily/api/services/message-queue/redis.provider'
import * as PgDrizzle from '@lily/db/effect-drizzle'
import { Effect, FileSystem, Layer, Match, Path } from 'effect'
import { Etag, HttpPlatform, HttpRouter } from 'effect/http'
import { HttpApi, HttpApiBuilder } from 'effect/http-api'
import { SqlError, UnknownError } from 'effect/sql/SqlError'
import { describe, expect, it } from 'vitest'

const TestApi = HttpApi.make('Test').add(HealthApiGroup)

const PlatformLive = Layer.mergeAll(
  Path.layer,
  Etag.layer,
  HttpPlatform.layer
).pipe(Layer.provideMerge(FileSystem.layerNoop({})))

type Behaviour = 'ok' | 'fails' | 'hangs'

const databaseStub = (behaviour: Behaviour) =>
  Layer.succeed(PgDrizzle.PgDrizzle, {
    execute: () =>
      Match.value(behaviour).pipe(
        Match.when('ok', () => Effect.succeed({ rows: [] })),
        Match.when('fails', () =>
          Effect.fail(
            new SqlError({
              reason: new UnknownError({
                cause: new Error('connection refused'),
                message: 'connection refused',
              }),
            })
          )
        ),
        Match.when('hangs', () => Effect.never),
        Match.exhaustive
      ),
  } as unknown as PgDrizzle.PgDrizzle['Service'])

const redisStub = (behaviour: Behaviour) =>
  Layer.succeed(RedisClient, {
    ping: () =>
      Match.value(behaviour).pipe(
        Match.when('ok', () => Promise.resolve('PONG')),
        Match.when('fails', () => Promise.reject(new Error('ECONNREFUSED'))),
        Match.when('hangs', () => new Promise(() => {})),
        Match.exhaustive
      ),
  } as unknown as RedisClient['Service'])

const request = async (
  path: string,
  dependencies: { database: Behaviour; redis: Behaviour }
) => {
  const web = HttpRouter.toWebHandler(
    HttpApiBuilder.layer(TestApi).pipe(
      Layer.provide(
        HttpApiBuilder.group(TestApi, 'health', healthHandlers).pipe(
          Layer.provide(databaseStub(dependencies.database)),
          Layer.provide(redisStub(dependencies.redis))
        )
      ),
      Layer.provide(PlatformLive)
    ),
    { disableLogger: true }
  )
  const startedAt = performance.now()
  const response = await web.handler(new Request(`http://localhost${path}`))
  const elapsedMs = performance.now() - startedAt
  const body: unknown = await response.json()
  await web.dispose()
  return { status: response.status, body, elapsedMs }
}

describe('health endpoints', () => {
  it('reports live without touching dependencies', async () => {
    const result = await request('/health/live', {
      database: 'hangs',
      redis: 'hangs',
    })

    expect(result.status).toBe(200)
    expect(result.body).toEqual({ status: 'ok' })
    expect(result.elapsedMs).toBeLessThan(500)
  })

  it.each(['/health/ready', '/health'])(
    '%s answers 200 when Postgres and Redis respond',
    async (path) => {
      const result = await request(path, { database: 'ok', redis: 'ok' })

      expect(result.status).toBe(200)
      expect(result.body).toEqual({
        status: 'ok',
        database: 'ok',
        redis: 'ok',
      })
    }
  )

  it.each(['/health/ready', '/health'])(
    '%s answers 503 when Postgres is down',
    async (path) => {
      const result = await request(path, { database: 'fails', redis: 'ok' })

      expect(result.status).toBe(503)
      expect(result.body).toMatchObject({
        status: 'degraded',
        database: 'error',
        redis: 'ok',
      })
    }
  )

  it('answers 503 when Redis rejects the ping', async () => {
    const result = await request('/health/ready', {
      database: 'ok',
      redis: 'fails',
    })

    expect(result.status).toBe(503)
    expect(result.body).toMatchObject({ database: 'ok', redis: 'error' })
  })

  it('answers 503 within about a second when both dependencies hang', async () => {
    const result = await request('/health/ready', {
      database: 'hangs',
      redis: 'hangs',
    })

    expect(result.status).toBe(503)
    expect(result.body).toMatchObject({ database: 'error', redis: 'error' })
    expect(result.elapsedMs).toBeLessThan(1_800)
  })
})
