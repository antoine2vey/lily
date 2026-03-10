import {
  type CreateDailyTipData,
  type DailyTip,
  DailyTipRepository,
  type IDailyTipRepository,
} from '@lily/api/repositories/daily-tip.repository'
import { Array, Effect, Layer, Option, Order, pipe } from 'effect'

const byPublishDateDesc = Order.reverse(
  Order.mapInput(Order.string, (t: DailyTip) => t.publishDate)
)

export const createMockDailyTipRepository = (
  tips: DailyTip[]
): Layer.Layer<DailyTipRepository> => {
  const data = Array.map(tips, (t) => ({ ...t }))

  const repo: IDailyTipRepository = {
    create: (createData: CreateDailyTipData) => {
      const tip: DailyTip = {
        id: `tip-${crypto.randomUUID()}`,
        ...createData,
        createdAt: new Date(),
      }
      data.push(tip)
      return Effect.succeed(tip)
    },

    findByDate: (date: string) =>
      Effect.succeed(
        pipe(
          Array.findFirst(data, (t) => t.publishDate === date),
          Option.getOrNull
        )
      ),

    findRecent: (limit: number) =>
      Effect.succeed(
        pipe(Array.sortBy(byPublishDateDesc)(data), Array.take(limit))
      ),
  }

  return Layer.succeed(DailyTipRepository, repo)
}
