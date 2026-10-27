import type * as PgDrizzle from '@lily/db/effect-drizzle'
import { canopyMembers, canopyPlantMutes, plants } from '@lily/db/schema'
import { and, eq, inArray, notExists, or } from 'drizzle-orm'

type Db = PgDrizzle.PgDrizzle['Service']

export const caredForBy = (db: Db, userId: string, includeCanopy: boolean) =>
  includeCanopy
    ? or(
        eq(plants.userId, userId),
        and(
          inArray(
            plants.canopyId,
            db
              .select({ canopyId: canopyMembers.canopyId })
              .from(canopyMembers)
              .where(eq(canopyMembers.userId, userId))
          ),
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
    : eq(plants.userId, userId)
