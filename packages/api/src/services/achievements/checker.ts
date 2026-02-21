import { type AppEvent, EventBus } from '@lily/api/events'
import { AchievementRepository } from '@lily/api/repositories/achievement.repository'
import { AchievementNotifier } from '@lily/api/services/achievements/notifier'
import type { AchievementKey } from '@lily/shared'
import { ACHIEVEMENTS } from '@lily/shared'
import { Effect, Match, Option, pipe, Queue } from 'effect'

const unlock = (userId: string, key: AchievementKey) =>
  pipe(
    AchievementRepository,
    Effect.flatMap((repo) => repo.unlock(userId, key))
  )

const notify = (userId: string, key: AchievementKey) =>
  pipe(
    AchievementNotifier,
    Effect.flatMap((notifier) => notifier.notify(userId, key))
  )

// Individual event handlers
// Note: unlock() uses onConflictDoNothing() so we don't need to check hasAchievement first

const onPlantCreated = (event: { userId: string }) =>
  Effect.gen(function* () {
    const repo = yield* AchievementRepository

    // Always unlock FIRST_PLANT_ADDED (DB handles duplicates)
    yield* unlock(event.userId, 'FIRST_PLANT_ADDED').pipe(
      Effect.tap((result) =>
        Effect.when(notify(event.userId, 'FIRST_PLANT_ADDED'), () => !!result)
      )
    )

    // Check PLANT_COLLECTOR (5+ plants)
    const plantCount = yield* repo.countPlants(event.userId)
    const plantCollectorThreshold = pipe(
      Option.fromNullable(ACHIEVEMENTS.PLANT_COLLECTOR.threshold),
      Option.getOrElse(() => 5)
    )
    if (plantCount >= plantCollectorThreshold) {
      yield* unlock(event.userId, 'PLANT_COLLECTOR').pipe(
        Effect.tap((result) =>
          Effect.when(notify(event.userId, 'PLANT_COLLECTOR'), () => !!result)
        )
      )
    }
  })

const onCareLogCreated = (event: {
  userId: string
  type: 'watering' | 'fertilization'
}) =>
  Effect.gen(function* () {
    const repo = yield* AchievementRepository

    // Check thresholds, then unlock (DB handles duplicates)
    const careCount = yield* repo.countCareLogsByType(event.userId, event.type)
    if (event.type === 'watering' && careCount >= 10) {
      yield* unlock(event.userId, 'WATERING_NOVICE').pipe(
        Effect.tap((result) =>
          Effect.when(notify(event.userId, 'WATERING_NOVICE'), () => !!result)
        )
      )
    }
    if (event.type === 'fertilization' && careCount >= 10) {
      yield* unlock(event.userId, 'FERTILIZER_GURU').pipe(
        Effect.tap((result) =>
          Effect.when(notify(event.userId, 'FERTILIZER_GURU'), () => !!result)
        )
      )
    }

    // Check DEDICATED_CARETAKER (3-day streak)
    const streak = yield* repo.getCareStreak(event.userId)
    if (streak >= 3) {
      yield* unlock(event.userId, 'DEDICATED_CARETAKER').pipe(
        Effect.tap((result) =>
          Effect.when(
            notify(event.userId, 'DEDICATED_CARETAKER'),
            () => !!result
          )
        )
      )
    }
  })

const onChatMessageSent = (event: { userId: string }) =>
  unlock(event.userId, 'AI_CONVERSATIONALIST').pipe(
    Effect.tap((result) =>
      Effect.when(notify(event.userId, 'AI_CONVERSATIONALIST'), () => !!result)
    )
  )

const onPhotoUploaded = (event: { userId: string; plantId: string }) =>
  Effect.gen(function* () {
    const repo = yield* AchievementRepository

    // Check PHOTO_PRO (10+ photos total)
    const photoCount = yield* repo.countPhotos(event.userId)
    const photoProThreshold = pipe(
      Option.fromNullable(ACHIEVEMENTS.PHOTO_PRO.threshold),
      Option.getOrElse(() => 10)
    )
    if (photoCount >= photoProThreshold) {
      yield* unlock(event.userId, 'PHOTO_PRO').pipe(
        Effect.tap((result) =>
          Effect.when(notify(event.userId, 'PHOTO_PRO'), () => !!result)
        )
      )
    }

    // Check GROWTH_TRACKER (5+ photos of same plant)
    const plantPhotoCount = yield* repo.countPhotosForPlant(
      event.userId,
      event.plantId
    )
    if (plantPhotoCount >= 5) {
      yield* unlock(event.userId, 'GROWTH_TRACKER').pipe(
        Effect.tap((result) =>
          Effect.when(notify(event.userId, 'GROWTH_TRACKER'), () => !!result)
        )
      )
    }
  })

const onPlantScanned = (event: { userId: string }) =>
  Effect.gen(function* () {
    const repo = yield* AchievementRepository
    const scanCount = yield* repo.countScans(event.userId)
    const scanChampThreshold = pipe(
      Option.fromNullable(ACHIEVEMENTS.SCAN_CHAMP.threshold),
      Option.getOrElse(() => 5)
    )
    if (scanCount >= scanChampThreshold) {
      yield* unlock(event.userId, 'SCAN_CHAMP').pipe(
        Effect.tap((result) =>
          Effect.when(notify(event.userId, 'SCAN_CHAMP'), () => !!result)
        )
      )
    }
  })

const onAttentionResponded = (event: { userId: string }) =>
  unlock(event.userId, 'ATTENTION_ALERT').pipe(
    Effect.tap((result) =>
      Effect.when(notify(event.userId, 'ATTENTION_ALERT'), () => !!result)
    )
  )

const onCareHistoryViewed = (event: { userId: string }) =>
  Effect.gen(function* () {
    const repo = yield* AchievementRepository

    // Increment view count and check threshold
    const viewCount = yield* repo.incrementHistoryViews(event.userId)
    if (viewCount >= 5) {
      yield* unlock(event.userId, 'HISTORY_HERO').pipe(
        Effect.tap((result) =>
          Effect.when(notify(event.userId, 'HISTORY_HERO'), () => !!result)
        )
      )
    }
  })

const onDiseaseIdentified = (event: { userId: string }) =>
  unlock(event.userId, 'DISEASE_DETECTIVE').pipe(
    Effect.tap((result) =>
      Effect.when(notify(event.userId, 'DISEASE_DETECTIVE'), () => !!result)
    )
  )

const onRarePlantIdentified = (event: { userId: string }) =>
  unlock(event.userId, 'RARE_COLLECTOR').pipe(
    Effect.tap((result) =>
      Effect.when(notify(event.userId, 'RARE_COLLECTOR'), () => !!result)
    )
  )

const onReminderResponded = (event: { userId: string }) =>
  unlock(event.userId, 'REMINDER_RESCUER').pipe(
    Effect.tap((result) =>
      Effect.when(notify(event.userId, 'REMINDER_RESCUER'), () => !!result)
    )
  )

const onPlantShared = (event: { userId: string }) =>
  unlock(event.userId, 'SHARE_SPROUT').pipe(
    Effect.tap((result) =>
      Effect.when(notify(event.userId, 'SHARE_SPROUT'), () => !!result)
    )
  )

// Pattern matching for events (exported for testing)
export const processEvent = (event: AppEvent) =>
  Match.value(event).pipe(
    Match.tag('PlantCreated', onPlantCreated),
    Match.tag('CareLogCreated', onCareLogCreated),
    Match.tag('ChatMessageSent', onChatMessageSent),
    Match.tag('PhotoUploaded', onPhotoUploaded),
    Match.tag('PlantScanned', onPlantScanned),
    Match.tag('AttentionResponded', onAttentionResponded),
    Match.tag('CareHistoryViewed', onCareHistoryViewed),
    Match.tag('DiseaseIdentified', onDiseaseIdentified),
    Match.tag('RarePlantIdentified', onRarePlantIdentified),
    Match.tag('ReminderResponded', onReminderResponded),
    Match.tag('PlantShared', onPlantShared),
    Match.tag('UserFollowed', () => Effect.void),
    Match.exhaustive
  )

// Start the achievement subscriber
export const startAchievementSubscriber = Effect.gen(function* () {
  const eventBus = yield* EventBus
  const queue = yield* eventBus.subscribe

  // Process events in background
  yield* Effect.fork(
    Effect.forever(
      Effect.gen(function* () {
        const event = yield* Queue.take(queue)
        yield* processEvent(event).pipe(
          Effect.tap(() =>
            Effect.annotateCurrentSpan('event._tag', event._tag)
          ),
          Effect.withSpan('achievement-checker.process'),
          Effect.catchAll((error) =>
            Effect.logError('Achievement check failed', error)
          )
        )
      })
    )
  )
})
