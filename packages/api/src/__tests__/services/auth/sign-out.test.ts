import * as PgDrizzle from '@effect/sql-drizzle/Pg'
import { signOut } from '@lily/api/services/auth/endpoints/sign-out'
import { Effect, Layer } from 'effect'
import { describe, expect, it } from 'vitest'

// Simple mock for PgDrizzle since signOut doesn't actually use it
const MockPgDrizzle = Layer.succeed(
  PgDrizzle.PgDrizzle,
  {} as PgDrizzle.PgDrizzle['Type']
)

describe('signOut', () => {
  it('should return success message', async () => {
    const result = await Effect.runPromise(
      signOut().pipe(Effect.provide(MockPgDrizzle))
    )

    expect(result.message).toBe('Successfully signed out')
  })

  it('should return object with message property', async () => {
    const result = await Effect.runPromise(
      signOut().pipe(Effect.provide(MockPgDrizzle))
    )

    expect(result).toHaveProperty('message')
    expect(typeof result.message).toBe('string')
  })
})
