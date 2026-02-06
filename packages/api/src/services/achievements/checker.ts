import { type AppEvent, EventBus } from '@lily/api/events'
import { AchievementRepository } from '@lily/api/repositories/achievement.repository'
import { ACHIEVEMENTS } from '@lily/shared'
import { Effect, Match, Option, pipe, Queue } from 'effect'

// Individual event handlers
// Note: unlock() uses onConflictDoNothing() so we don't need to check hasAchievement first

const onPlantCreated = (event: { userId: string }) =>
  Effect.gen(function* () {
    const repo = yield* AchievementRepository

    // Always unlock FIRST_PLANT_ADDED (DB handles duplicates)
    yield* repo.unlock(event.userId, 'FIRST_PLANT_ADDED')

    // Check PLANT_COLLECTOR (5+ plants)
    const plantCount = yield* repo.countPlants(event.userId)
    const plantCollectorThreshold = pipe(
      Option.fromNullable(ACHIEVEMENTS.PLANT_COLLECTOR.threshold),
      Option.getOrElse(() => 5)
    )
    if (plantCount >= plantCollectorThreshold) {
      yield* repo.unlock(event.userId, 'PLANT_COLLECTOR')
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
      yield* repo.unlock(event.userId, 'WATERING_NOVICE')
    }
    if (event.type === 'fertilization' && careCount >= 10) {
      yield* repo.unlock(event.userId, 'FERTILIZER_GURU')
    }

    // Check DEDICATED_CARETAKER (3-day streak)
    const streak = yield* repo.getCareStreak(event.userId)
    if (streak >= 3) {
      yield* repo.unlock(event.userId, 'DEDICATED_CARETAKER')
    }
  })

const onChatMessageSent = (event: { userId: string }) =>
  Effect.gen(function* () {
    const repo = yield* AchievementRepository
    yield* repo.unlock(event.userId, 'AI_CONVERSATIONALIST')
  })

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
      yield* repo.unlock(event.userId, 'PHOTO_PRO')
    }

    // Check GROWTH_TRACKER (5+ photos of same plant)
    const plantPhotoCount = yield* repo.countPhotosForPlant(
      event.userId,
      event.plantId
    )
    if (plantPhotoCount >= 5) {
      yield* repo.unlock(event.userId, 'GROWTH_TRACKER')
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
      yield* repo.unlock(event.userId, 'SCAN_CHAMP')
    }
  })

const onAttentionResponded = (event: { userId: string }) =>
  Effect.gen(function* () {
    const repo = yield* AchievementRepository
    yield* repo.unlock(event.userId, 'ATTENTION_ALERT')
  })

const onCareHistoryViewed = (event: { userId: string }) =>
  Effect.gen(function* () {
    const repo = yield* AchievementRepository

    // Increment view count and check threshold
    const viewCount = yield* repo.incrementHistoryViews(event.userId)
    if (viewCount >= 5) {
      yield* repo.unlock(event.userId, 'HISTORY_HERO')
    }
  })

const onDiseaseIdentified = (event: { userId: string }) =>
  Effect.gen(function* () {
    const repo = yield* AchievementRepository
    yield* repo.unlock(event.userId, 'DISEASE_DETECTIVE')
  })

const onRarePlantIdentified = (event: { userId: string }) =>
  Effect.gen(function* () {
    const repo = yield* AchievementRepository
    yield* repo.unlock(event.userId, 'RARE_COLLECTOR')
  })

const onReminderResponded = (event: { userId: string }) =>
  Effect.gen(function* () {
    const repo = yield* AchievementRepository
    yield* repo.unlock(event.userId, 'REMINDER_RESCUER')
  })

const onPlantShared = (event: { userId: string }) =>
  Effect.gen(function* () {
    const repo = yield* AchievementRepository
    yield* repo.unlock(event.userId, 'SHARE_SPROUT')
  })

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
          Effect.catchAll((error) =>
            Effect.logError('Achievement check failed', error)
          )
        )
      })
    )
  )
})
