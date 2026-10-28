import type * as PgDrizzle from '@lily/db/effect-drizzle'
import { canopyMembers, canopyPlantMutes, plants } from '@lily/db/schema'
import { and, eq, notExists, or, type SQLWrapper, sql } from 'drizzle-orm'
import { Array, Effect, Option, pipe } from 'effect'

type Db = PgDrizzle.PgDrizzle['Service']

export const memberCanopyIdOf = (db: Db, userId: string) =>
  Effect.map(
    db
      .select({ canopyId: canopyMembers.canopyId })
      .from(canopyMembers)
      .where(eq(canopyMembers.userId, userId)),
    (rows) =>
      pipe(
        Array.head(rows),
        Option.map((row) => row.canopyId),
        Option.getOrNull
      )
  )

export const caredForBy = (db: Db, userId: string, canopyId: string | null) =>
  canopyId === null
    ? eq(plants.userId, userId)
    : or(
        eq(plants.userId, userId),
        and(
          eq(plants.canopyId, canopyId),
          notExists(
            db
              .select({ userId: canopyPlantMutes.userId })
              .from(canopyPlantMutes)
              .where(
                and(
                  eq(canopyPlantMutes.userId, userId),
                  eq(canopyPlantMutes.plantId, plants.id)
                )
              )
          )
        )
      )

export const heldBy = (userId: SQLWrapper | string) =>
  sql`(${plants.userId} = ${userId} OR ${plants.canopyId} IN (SELECT ${canopyMembers.canopyId} FROM ${canopyMembers} WHERE ${canopyMembers.userId} = ${userId}))`

export const careScopeOf = (db: Db, userId: string, includeCanopy: boolean) =>
  includeCanopy
    ? Effect.map(memberCanopyIdOf(db, userId), (canopyId) =>
        caredForBy(db, userId, canopyId)
      )
    : Effect.succeed(caredForBy(db, userId, null))
