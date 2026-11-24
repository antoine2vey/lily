import type { CarePlant } from '@lily/api/contexts/care/domain/care-plant'
import type { CareWrite } from '@lily/api/contexts/care/domain/decide'
import {
  type ActedOn,
  makeLocks,
  type PlantingGround,
  type PlantRowLock,
} from '@lily/api/contexts/care/store/lock'
import { makeWrites } from '@lily/api/contexts/care/store/write'
import type { Transaction } from '@lily/api/kernel/transact'
import * as PgDrizzle from '@lily/db/effect-drizzle'
import { careLogs, carePlanSteps } from '@lily/db/schema'
import type { CareType, PlantOwner } from '@lily/shared'
import { eq } from 'drizzle-orm'
import { Array, Context, Effect, Layer, Option } from 'effect'
import type { SqlError } from 'effect/sql/SqlError'

export interface CareLogKey {
  readonly plantId: string
  readonly careType: CareType
}

export class CareStore extends Context.Service<
  CareStore,
  {
    readonly careLogKey: (
      careLogId: string
    ) => Effect.Effect<Option.Option<CareLogKey>, SqlError>
    readonly careTypesOfPlan: (
      planId: string
    ) => Effect.Effect<ReadonlyArray<CareType>, SqlError>
    readonly lockAndLoadForPlanting: (
      userIds: ReadonlyArray<string>,
      owner: PlantOwner
    ) => Effect.Effect<PlantingGround, SqlError, Transaction>
    readonly lockAndLoad: (
      plantIds: ReadonlyArray<string>,
      careTypes: ReadonlyArray<CareType>,
      lock?: PlantRowLock
    ) => Effect.Effect<ReadonlyMap<string, CarePlant>, SqlError, Transaction>
    /**
     * `lockAndLoad`, then the account rows of `actorIds` `FOR KEY SHARE` in id
     * order. A row that names a user takes that lock through its foreign key
     * anyway. Taking it at the load makes a deleted account a fact the
     * command refuses on, where the write would break the constraint.
     */
    readonly lockAndLoadFor: (
      actorIds: ReadonlyArray<string>,
      plantIds: ReadonlyArray<string>,
      careTypes: ReadonlyArray<CareType>
    ) => Effect.Effect<ActedOn, SqlError, Transaction>
    readonly apply: (
      writes: ReadonlyArray<CareWrite>
    ) => Effect.Effect<void, SqlError, Transaction>
    readonly linkPlanToMessage: (
      planId: string,
      chatMessageId: string
    ) => Effect.Effect<void, SqlError>
  }
>()('care/CareStore') {}

export const CareStoreLive = Layer.effect(
  CareStore,
  Effect.gen(function* () {
    const db = yield* PgDrizzle.PgDrizzle

    const locks = yield* makeLocks
    const writes = yield* makeWrites

    return CareStore.of({
      careLogKey: Effect.fn('CareStore.careLogKey')(function* (
        careLogId: string
      ) {
        const rows = yield* db
          .select({ plantId: careLogs.plantId, careType: careLogs.type })
          .from(careLogs)
          .where(eq(careLogs.id, careLogId))
        return Array.head(rows)
      }),

      careTypesOfPlan: Effect.fn('CareStore.careTypesOfPlan')(function* (
        planId: string
      ) {
        const rows = yield* db
          .selectDistinct({ careType: carePlanSteps.careType })
          .from(carePlanSteps)
          .where(eq(carePlanSteps.planId, planId))
        return Array.flatMap(rows, (row) =>
          Option.toArray(Option.fromNullishOr(row.careType))
        )
      }),

      ...locks,

      apply: (decided) =>
        Effect.forEach(decided, writes.write, { discard: true }).pipe(
          Effect.withSpan('CareStore.apply')
        ),

      linkPlanToMessage: writes.linkPlanToMessage,
    })
  })
)
