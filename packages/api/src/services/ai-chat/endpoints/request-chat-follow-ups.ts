import {
  type AskedPlant,
  ChatRepository,
} from '@lily/api/repositories/chat.repository'
import { ChatFollowUpRepository } from '@lily/api/repositories/chat-follow-up.repository'
import {
  PlantRepository,
  type PlantWithRoom,
} from '@lily/api/repositories/plant.repository'
import { needsHelpFirst } from '@lily/api/services/ai-chat/endpoints/list-chat-starters'
import {
  ageOf,
  type FollowUpSet,
  lifecycleOf,
} from '@lily/api/services/ai-chat/follow-up-set'
import { CurrentUser } from '@lily/api/services/auth/middleware.types'
import type { LanguageCode } from '@lily/shared'
import { Array, DateTime, Duration, Effect, Option, Order, pipe } from 'effect'
import type { SqlError } from 'effect/sql/SqlError'

export const FOLLOW_UP_COOLDOWN = Duration.hours(20)
export const FOLLOW_UP_DAILY_BUDGET = 12

const usedTodaysGeneration =
  (now: DateTime.Utc) =>
  (set: FollowUpSet): boolean =>
    lifecycleOf(set, now) !== 'idle' ||
    Option.exists(ageOf(set, now), Duration.isLessThan(FOLLOW_UP_COOLDOWN))

interface Candidate {
  readonly plant: PlantWithRoom
  readonly lastAskedAt: Date
}

const mostUsefulFirst: Order.Order<Candidate> = Order.combine(
  Order.mapInput(needsHelpFirst, ({ plant }) => plant),
  Order.combine(
    Order.mapInput(Order.flip(Order.Date), ({ lastAskedAt }) => lastAskedAt),
    Order.mapInput(Order.String, ({ plant }) => plant.id)
  )
)

const candidatesAmong = (
  asked: ReadonlyArray<AskedPlant>,
  livingPlants: ReadonlyArray<PlantWithRoom>
): ReadonlyArray<Candidate> =>
  Array.flatMap(asked, ({ plantId, lastAskedAt }) =>
    pipe(
      Array.findFirst(livingPlants, (plant) => plant.id === plantId),
      Option.map((plant) => ({ plant, lastAskedAt })),
      Option.toArray
    )
  )

export const requestChatFollowUps = (
  language: LanguageCode
): Effect.Effect<
  void,
  SqlError,
  ChatRepository | ChatFollowUpRepository | PlantRepository | CurrentUser
> =>
  Effect.gen(function* () {
    const chatRepo = yield* ChatRepository
    const followUpRepo = yield* ChatFollowUpRepository
    const plantRepo = yield* PlantRepository
    const { id: userId } = yield* CurrentUser
    const now = DateTime.nowUnsafe()

    const [asked, sets] = yield* Effect.all(
      [chatRepo.findAskedPlants(userId), followUpRepo.findByUser(userId)],
      { concurrency: 'unbounded' }
    )
    const used = pipe(
      Array.filter(sets, usedTodaysGeneration(now)),
      Array.map((set) => set.plantId)
    )
    const slots = FOLLOW_UP_DAILY_BUDGET - used.length
    const due = Array.filter(
      asked,
      ({ plantId }) => !Array.contains(used, plantId)
    )
    if (slots <= 0 || Array.isReadonlyArrayEmpty(due)) return

    const { items: livingPlants } = yield* plantRepo.findAll({
      userId,
      filter: 'all',
      includeCaretaking: true,
      includeCanopy: true,
      limit: Number.MAX_SAFE_INTEGER,
    })
    yield* followUpRepo.request({
      userId,
      plantIds: pipe(
        candidatesAmong(due, livingPlants),
        Array.sort(mostUsefulFirst),
        Array.take(slots),
        Array.map(({ plant }) => plant.id)
      ),
      language,
      at: DateTime.toDateUtc(now),
    })
  }).pipe(Effect.withSpan('AIChatService.requestChatFollowUps'))
