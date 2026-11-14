import { CanopyRepository } from '@lily/api/repositories/canopy.repository'
import { ChatRepository } from '@lily/api/repositories/chat.repository'
import { ChatFollowUpRepository } from '@lily/api/repositories/chat-follow-up.repository'
import {
  PlantRepository,
  type PlantWithRoom,
} from '@lily/api/repositories/plant.repository'
import {
  factsOf,
  loadPlantState,
} from '@lily/api/services/ai-chat/follow-up-facts'
import type { FollowUpSet } from '@lily/api/services/ai-chat/follow-up-set'
import {
  FOLLOW_UP_CALL_TIMEOUT,
  writeFollowUps,
} from '@lily/api/services/ai-chat/follow-up-writer'
import { createDrainableScheduler } from '@lily/api/services/helpers/create-scheduler'
import {
  allows,
  type KnowledgeView,
  knowledgeView,
} from '@lily/api/services/plants/helpers/plant-access'
import { plantRoleFor } from '@lily/api/services/plants/helpers/with-plant-access'
import {
  Array,
  Clock,
  DateTime,
  Duration,
  Effect,
  Option,
  pipe,
  Record,
} from 'effect'
import type { SqlError } from 'effect/sql/SqlError'

const NAME = 'chat-follow-up-worker'
const CLAIM_BATCH = 4
const CONCURRENT_CALLS = 2
const RECENT_QUESTIONS = 12

const WAVES_PER_BATCH = CLAIM_BATCH / CONCURRENT_CALLS
const LEASE_SLACK = 2
const CLAIM_LEASE = Duration.times(
  FOLLOW_UP_CALL_TIMEOUT,
  WAVES_PER_BATCH * LEASE_SLACK
)

interface Subject {
  readonly plant: PlantWithRoom
  readonly view: KnowledgeView
  readonly recentQuestions: ReadonlyArray<string>
}

const chatViewOf = (userId: string, plant: PlantWithRoom) =>
  Effect.gen(function* () {
    const canopyRepo = yield* CanopyRepository
    const role = yield* plantRoleFor(
      { userId, membership: canopyRepo.findMembershipByUser(userId) },
      plant
    )
    return pipe(
      role,
      Option.filter(allows('chat')),
      Option.map((allowed) => knowledgeView(allowed, userId))
    )
  })

const subjectOf = ({ userId, plantId }: FollowUpSet) =>
  Effect.gen(function* () {
    const plantRepo = yield* PlantRepository
    const chatRepo = yield* ChatRepository

    const living = pipe(
      Option.fromNullishOr(yield* plantRepo.findById(plantId)),
      Option.filter((plant) => plant.diedAt === null)
    )
    if (Option.isNone(living)) return Option.none<Subject>()
    const plant = living.value

    const view = yield* chatViewOf(userId, plant)
    if (Option.isNone(view)) return Option.none<Subject>()

    const recentQuestions = yield* chatRepo.findRecentQuestions({
      userId,
      plantId,
      limit: RECENT_QUESTIONS,
    })
    return Array.isReadonlyArrayNonEmpty(recentQuestions)
      ? Option.some<Subject>({ plant, view: view.value, recentQuestions })
      : Option.none<Subject>()
  })

const release = (set: FollowUpSet) =>
  Effect.flatMap(ChatFollowUpRepository, (repo) => repo.release(set))

const write = (set: FollowUpSet, { plant, view, recentQuestions }: Subject) =>
  Effect.gen(function* () {
    const repo = yield* ChatFollowUpRepository
    const state = yield* loadPlantState(plant, view)
    const startedAt = yield* Clock.currentTimeMillis

    const written = yield* writeFollowUps({
      language: set.language,
      plant: {
        name: plant.name,
        category: plant.category,
        addedOn: state.situation.addedOn,
        today: state.situation.today,
        careEveryDays: Record.fromEntries(
          Array.map(plant.schedules, (schedule) => [
            schedule.careType,
            schedule.frequencyDays,
          ])
        ),
      },
      facts: factsOf(state),
      recentQuestions,
    })
    const measured = {
      plantId: set.plantId,
      followUps: written.followUps.length,
      inputTokens: written.inputTokens,
      outputTokens: written.outputTokens,
      durationMs: (yield* Clock.currentTimeMillis) - startedAt,
    }

    if (Array.isReadonlyArrayEmpty(written.followUps)) {
      yield* Effect.logWarning(
        `[${NAME}] The model wrote no usable follow-up, kept the previous set`,
        measured
      )
      return yield* repo.release(set)
    }
    yield* repo.store({
      userId: set.userId,
      plantId: set.plantId,
      followUps: written.followUps,
      at: DateTime.toDateUtc(DateTime.nowUnsafe()),
    })
    yield* Effect.log(`[${NAME}] Wrote follow-ups`, measured)
  }).pipe(
    Effect.catchTag('OpenAIError', (error) =>
      Effect.logWarning(
        `[${NAME}] Could not write follow-ups, kept the previous set`,
        { plantId: set.plantId, code: error.code, message: error.message }
      ).pipe(Effect.andThen(release(set)))
    )
  )

const releaseAfterFailure = (set: FollowUpSet, error: SqlError) =>
  Effect.logWarning(`[${NAME}] Could not write follow-ups, releasing the set`, {
    plantId: set.plantId,
    error: String(error),
  }).pipe(
    Effect.andThen(release(set)),
    Effect.catchTag('SqlError', (releaseError) =>
      Effect.logWarning(
        `[${NAME}] Could not release the set, it waits for its lease to expire`,
        { plantId: set.plantId, error: String(releaseError) }
      )
    )
  )

const writeSet = (set: FollowUpSet) =>
  Effect.flatMap(
    subjectOf(set),
    Option.match({
      onNone: () => release(set),
      onSome: (subject) => write(set, subject),
    })
  ).pipe(
    Effect.catchTag('SqlError', (error) => releaseAfterFailure(set, error)),
    Effect.withSpan(`${NAME}.writeSet`, {
      attributes: { 'plant.id': set.plantId, 'user.id': set.userId },
    })
  )

export const pollFollowUpRequests = Effect.gen(function* () {
  const repo = yield* ChatFollowUpRepository
  const now = DateTime.nowUnsafe()
  const claimed = yield* repo.claim({
    limit: CLAIM_BATCH,
    at: DateTime.toDateUtc(now),
    until: DateTime.toDateUtc(DateTime.addDuration(now, CLAIM_LEASE)),
  })
  yield* Effect.forEach(claimed, writeSet, {
    concurrency: CONCURRENT_CALLS,
    discard: true,
  })
  return claimed.length === CLAIM_BATCH
})

export const startChatFollowUpWorker = createDrainableScheduler({
  name: NAME,
  interval: '15 seconds',
  runOnStartup: false,
  task: pollFollowUpRequests,
})
