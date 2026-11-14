import type { CarePlanRepository } from '@lily/api/repositories/care-plan.repository'
import { ChatRepository } from '@lily/api/repositories/chat.repository'
import { ChatFollowUpRepository } from '@lily/api/repositories/chat-follow-up.repository'
import type { DiagnosisRepository } from '@lily/api/repositories/diagnosis.repository'
import type { PlantRepository } from '@lily/api/repositories/plant.repository'
import { MAX_CHAT_SUGGESTIONS } from '@lily/api/services/ai-chat/chat-suggestions'
import {
  basisHolds,
  loadPlantState,
} from '@lily/api/services/ai-chat/follow-up-facts'
import {
  ageOf,
  type FollowUp,
  type FollowUpSet,
} from '@lily/api/services/ai-chat/follow-up-set'
import { CurrentUser } from '@lily/api/services/auth/middleware.types'
import {
  type PlantAccessContext,
  withPlantKnowledge,
} from '@lily/api/services/plants/helpers/with-plant-access'
import type { LanguageCode } from '@lily/shared'
import type { ChatSuggestions } from '@lily/shared/ai-chat'
import type {
  PlantNotAuthorizedError,
  PlantNotFoundError,
} from '@lily/shared/errors/plant'
import { Array, DateTime, Duration, Effect, Option, pipe } from 'effect'
import type { SqlError } from 'effect/sql/SqlError'

export const FOLLOW_UP_MAX_AGE = Duration.days(3)

interface ServableSet {
  readonly generatedAt: Date
  readonly followUps: ReadonlyArray<FollowUp>
}

const servable =
  (language: LanguageCode, now: DateTime.Utc) =>
  (set: FollowUpSet): Option.Option<ServableSet> =>
    pipe(
      Option.fromNullishOr(set.generatedAt),
      Option.filter(
        () =>
          set.language === language &&
          Option.exists(
            ageOf(set, now),
            Duration.isLessThanOrEqualTo(FOLLOW_UP_MAX_AGE)
          )
      ),
      Option.map((generatedAt) => ({ generatedAt, followUps: set.followUps }))
    )

export const listChatFollowUps = (
  plantId: string,
  language: LanguageCode
): Effect.Effect<
  ChatSuggestions,
  SqlError | PlantNotFoundError | PlantNotAuthorizedError,
  | PlantRepository
  | PlantAccessContext
  | CarePlanRepository
  | DiagnosisRepository
  | ChatRepository
  | ChatFollowUpRepository
> =>
  Effect.gen(function* () {
    const followUpRepo = yield* ChatFollowUpRepository
    const chatRepo = yield* ChatRepository
    const { id: userId } = yield* CurrentUser
    const { plant, view } = yield* withPlantKnowledge(plantId, 'chat')

    const set = pipe(
      yield* followUpRepo.find(userId, plantId),
      Option.filter(() => plant.diedAt === null),
      Option.flatMap(servable(language, DateTime.nowUnsafe()))
    )
    if (Option.isNone(set)) return { suggestions: [] }
    const { generatedAt, followUps } = set.value

    const [state, sent] = yield* Effect.all(
      [
        loadPlantState(plant, view),
        chatRepo.findSentTexts({
          userId,
          plantId,
          since: generatedAt,
          texts: Array.map(followUps, (followUp) => followUp.text),
        }),
      ],
      { concurrency: 'unbounded' }
    )
    const holds = basisHolds(state)

    return {
      suggestions: pipe(
        followUps,
        Array.filter(
          ({ basis, text }) => holds(basis) && !Array.contains(sent, text)
        ),
        Array.take(MAX_CHAT_SUGGESTIONS),
        Array.map(({ id, text }) => ({ id, text }))
      ),
    }
  }).pipe(Effect.withSpan('AIChatService.listChatFollowUps'))
