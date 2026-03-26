import type { SqlError } from '@effect/sql/SqlError'
import * as PgDrizzle from '@effect/sql-drizzle/Pg'
import type { LocalizedText } from '@lily/db/schema'
import { dailyTips } from '@lily/db/schema'
import { desc, eq } from 'drizzle-orm'
import { Context, Effect, Layer, Option } from 'effect'

export type DailyTip = typeof dailyTips.$inferSelect

export interface CreateDailyTipData {
  title: LocalizedText
  body: LocalizedText
  category: string
  tags: string[]
  publishDate: string
}

export interface IDailyTipRepository {
  readonly create: (
    data: CreateDailyTipData
  ) => Effect.Effect<DailyTip | null, SqlError>
  readonly findByDate: (
    date: string
  ) => Effect.Effect<DailyTip | null, SqlError>
  readonly findRecent: (limit: number) => Effect.Effect<DailyTip[], SqlError>
}

export class DailyTipRepository extends Context.Tag('DailyTipRepository')<
  DailyTipRepository,
  IDailyTipRepository
>() {}

export const DailyTipRepositoryLive = Layer.effect(
  DailyTipRepository,
  Effect.gen(function* () {
    const db = yield* PgDrizzle.PgDrizzle

    return {
      create: Effect.fn('DailyTipRepository.create')(function* (
        data: CreateDailyTipData
      ) {
        const [row] = yield* db.insert(dailyTips).values(data).returning()
        return Option.getOrNull(Option.fromNullable(row))
      }),

      findByDate: Effect.fn('DailyTipRepository.findByDate')(function* (
        date: string
      ) {
        const [row] = yield* db
          .select()
          .from(dailyTips)
          .where(eq(dailyTips.publishDate, date))
        return Option.getOrNull(Option.fromNullable(row))
      }),

      findRecent: Effect.fn('DailyTipRepository.findRecent')(function* (
        limit: number
      ) {
        return yield* db
          .select()
          .from(dailyTips)
          .orderBy(desc(dailyTips.publishDate))
          .limit(limit)
      }),
    }
  })
)
