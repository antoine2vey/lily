import type { SqlError } from '@effect/sql/SqlError'
import * as PgDrizzle from '@effect/sql-drizzle/Pg'
import { plantScans } from '@lily/db'
import { Context, Effect, Layer } from 'effect'

export interface IScanRepository {
  readonly create: (data: {
    userId: string
    scanType: 'card' | 'identify'
  }) => Effect.Effect<typeof plantScans.$inferSelect, SqlError>
}

export class ScanRepository extends Context.Tag('ScanRepository')<
  ScanRepository,
  IScanRepository
>() {}

export const ScanRepositoryLive = Layer.effect(
  ScanRepository,
  Effect.gen(function* () {
    const db = yield* PgDrizzle.PgDrizzle

    return {
      create: (data: { userId: string; scanType: 'card' | 'identify' }) =>
        Effect.gen(function* () {
          const [scan] = yield* db
            .insert(plantScans)
            .values({
              userId: data.userId,
              scanType: data.scanType,
            })
            .returning()
          return scan!
        }),
    }
  })
)
