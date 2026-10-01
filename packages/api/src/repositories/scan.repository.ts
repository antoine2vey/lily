import { EntityMutationDefect } from '@lily/api/errors/defects'
import * as PgDrizzle from '@lily/db/effect-drizzle'
import { plantScans } from '@lily/db/schema'
import { Array, Context, Effect, Layer, Option, pipe } from 'effect'
import type { SqlError } from 'effect/sql/SqlError'

export interface IScanRepository {
  readonly create: (data: {
    userId: string
    scanType: 'card' | 'identify'
  }) => Effect.Effect<typeof plantScans.$inferSelect, SqlError>
}

export class ScanRepository extends Context.Service<
  ScanRepository,
  IScanRepository
>()('ScanRepository') {}

export const ScanRepositoryLive = Layer.effect(
  ScanRepository,
  Effect.gen(function* () {
    const db = yield* PgDrizzle.PgDrizzle

    return {
      create: Effect.fn('ScanRepository.create')(function* (data: {
        userId: string
        scanType: 'card' | 'identify'
      }) {
        const results = yield* db
          .insert(plantScans)
          .values({
            userId: data.userId,
            scanType: data.scanType,
          })
          .returning()
        const scan = pipe(Array.head(results), Option.getOrNull)
        if (!scan) {
          return yield* Effect.die(
            new EntityMutationDefect({
              message: 'Scan insert returned null',
              entity: 'scan',
              operation: 'create',
            })
          )
        }
        return scan
      }),
    }
  })
)
