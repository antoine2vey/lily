import { mockUser1 } from '@lily/api/__tests__/fixtures/users'
import { createInMemoryCanopy } from '@lily/api/__tests__/mocks/canopy'
import { createMockCanopyRepository } from '@lily/api/__tests__/mocks/canopy.repository'
import { createMockJWTService } from '@lily/api/__tests__/mocks/jwt.service'
import { createMockOutbox } from '@lily/api/__tests__/mocks/outbox'
import { createMockRoomRepository } from '@lily/api/__tests__/mocks/room.repository'
import { createMockSqlClient } from '@lily/api/__tests__/mocks/sql-client'
import { createMockUserRepository } from '@lily/api/__tests__/mocks/user.repository'
import type { Api } from '@lily/api/api'
import { RoomRepository } from '@lily/api/repositories/room.repository'
import { UserRepository } from '@lily/api/repositories/user.repository'
import { AuthenticationBase } from '@lily/api/services/auth/middleware.impl'
import { RoomsApi } from '@lily/api/services/rooms/api'
import { RoomsApiLive } from '@lily/api/services/rooms/handlers'
import type { User } from '@lily/shared'
import {
  Cause,
  Effect,
  FileSystem,
  Layer,
  Logger,
  Path,
  References,
} from 'effect'
import { Etag, HttpPlatform, HttpRouter } from 'effect/http'
import { HttpApi, HttpApiBuilder } from 'effect/http-api'
import { ConstraintError, SqlError, UnknownError } from 'effect/sql/SqlError'
import { describe, expect, it } from 'vitest'

const TestApi = HttpApi.make('accountGoneMidRequest').add(RoomsApi)

const PlatformLive = Layer.mergeAll(
  Path.layer,
  Etag.layer,
  HttpPlatform.layer
).pipe(Layer.provideMerge(FileSystem.layerNoop({})))

const foreignKeyViolation = new SqlError({
  reason: new ConstraintError({
    cause: new Error('violates foreign key constraint "rooms_user_id_fkey"'),
    message: 'violates foreign key constraint "rooms_user_id_fkey"',
  }),
})

const connectionLost = new SqlError({
  reason: new UnknownError({
    cause: new Error('connection terminated unexpectedly'),
    message: 'connection terminated unexpectedly',
  }),
})

type Insert = Effect.Effect<never, SqlError>

const createRoomWhere = async (world: {
  readonly accountIsDeletedUnderTheInsert: boolean
  readonly insert: Insert | 'succeeds'
  readonly lookupAfterTheInsert?: 'fails'
  readonly owner?: 'canopy'
}) => {
  const users: User[] = [mockUser1]
  let lookups = 0
  let inserted = false
  const errorsLogged: Array<{
    readonly message: unknown
    readonly died: unknown
    readonly userId: unknown
  }> = []
  const capture = Logger.make(({ logLevel, message, cause, fiber }) => {
    if (logLevel === 'Error') {
      errorsLogged.push({
        message,
        died: Cause.squash(cause),
        userId: fiber.getRef(References.CurrentLogAnnotations)['user.id'],
      })
    }
  })

  const UsersLive = Layer.effect(
    UserRepository,
    Effect.gen(function* () {
      const repo = yield* UserRepository
      return {
        ...repo,
        findById: (id: string) =>
          Effect.suspend(() => {
            lookups++
            return inserted && world.lookupAfterTheInsert === 'fails'
              ? Effect.fail(connectionLost)
              : repo.findById(id)
          }),
      }
    })
  ).pipe(Layer.provide(createMockUserRepository(users)))

  const RoomsLive = Layer.effect(
    RoomRepository,
    Effect.gen(function* () {
      const repo = yield* RoomRepository
      return {
        ...repo,
        create: (data: Parameters<typeof repo.create>[0]) =>
          Effect.suspend(() => {
            inserted = true
            if (world.accountIsDeletedUnderTheInsert) users.length = 0
            return world.insert === 'succeeds'
              ? repo.create(data)
              : world.insert
          }),
      }
    })
  ).pipe(Layer.provide(createMockRoomRepository([])))

  const web = HttpRouter.toWebHandler(
    HttpApiBuilder.layer(TestApi).pipe(
      Layer.provide(RoomsApiLive(TestApi as unknown as Api)),
      Layer.provide(
        AuthenticationBase.pipe(
          Layer.provide(Layer.merge(createMockJWTService(), UsersLive))
        )
      ),
      Layer.provide(
        Layer.mergeAll(
          RoomsLive,
          createMockCanopyRepository(),
          createInMemoryCanopy().layer,
          createMockSqlClient(),
          createMockOutbox().layer
        )
      ),
      Layer.provide(PlatformLive),
      Layer.provide(Logger.layer([capture]))
    ) as unknown as Layer.Layer<never>,
    { disableLogger: true }
  )
  try {
    const res = await web.handler(
      new Request('http://lily.test/rooms', {
        method: 'POST',
        headers: {
          Authorization: 'Bearer some-token',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ name: 'Living room', owner: world.owner }),
      })
    )
    const body: unknown = await res.json().catch(() => null)
    return { status: res.status, body, lookups, errorsLogged }
  } finally {
    await web.dispose()
  }
}

describe('a request whose account is hard-deleted while its handler runs', () => {
  it('answers the 401 of a request with no account behind it when the handler dies on a database error', async () => {
    expect(
      await createRoomWhere({
        accountIsDeletedUnderTheInsert: true,
        insert: Effect.fail(foreignKeyViolation),
      })
    ).toEqual({
      status: 401,
      body: { _tag: 'UnauthorizedError', message: 'Authentication failed' },
      lookups: 2,
      errorsLogged: [
        {
          message: [
            'Request died on a database error after its account was deleted',
          ],
          died: foreignKeyViolation,
          userId: mockUser1.id,
        },
      ],
    })
  })

  it('still answers 500 for a database error when the account exists', async () => {
    expect(
      await createRoomWhere({
        accountIsDeletedUnderTheInsert: false,
        insert: Effect.fail(foreignKeyViolation),
      })
    ).toMatchObject({ status: 500, lookups: 2, errorsLogged: [] })
  })

  it('still answers 500 for a defect that is not a database error, and does not look the account up', async () => {
    expect(
      await createRoomWhere({
        accountIsDeletedUnderTheInsert: true,
        insert: Effect.die(new Error('not a database error')),
      })
    ).toMatchObject({ status: 500, lookups: 1, errorsLogged: [] })
  })

  it('still answers 500 when it cannot read whether the account exists', async () => {
    expect(
      await createRoomWhere({
        accountIsDeletedUnderTheInsert: true,
        insert: Effect.fail(foreignKeyViolation),
        lookupAfterTheInsert: 'fails',
      })
    ).toMatchObject({ status: 500, lookups: 2, errorsLogged: [] })
  })

  it('does not look the account up again after a typed refusal', async () => {
    expect(
      await createRoomWhere({
        accountIsDeletedUnderTheInsert: false,
        insert: 'succeeds',
        owner: 'canopy',
      })
    ).toMatchObject({
      status: 404,
      body: { _tag: 'CanopyNotFoundError' },
      lookups: 1,
    })
  })

  it('does not look the account up again after a success', async () => {
    expect(
      await createRoomWhere({
        accountIsDeletedUnderTheInsert: false,
        insert: 'succeeds',
      })
    ).toMatchObject({
      status: 201,
      body: { name: 'Living room' },
      lookups: 1,
    })
  })
})
