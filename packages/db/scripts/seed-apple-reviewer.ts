#!/usr/bin/env bun
/**
 * Seed script to create an Apple reviewer test account with demo data
 * Usage: bun run seed:apple-reviewer
 *
 * This creates:
 * 1. A test user for Apple App Store reviewers
 * 2. A magic link with extended expiry for verification
 * 3. Demo plants with various health states
 * 4. Care history (watering, fertilization)
 * 5. Achievements
 * 6. Sample chat messages
 * 7. Sample notifications
 *
 * Run this once in production before App Store submission.
 */

import * as PgDrizzle from '@effect/sql-drizzle/Pg'
import {
  careLogs,
  chatMessages,
  DrizzleLive,
  magicLinks,
  notifications,
  plantPhotos,
  plants,
  userAchievements,
  users,
} from '@lily/db'
import { eq } from 'drizzle-orm'
import { Array as A, Console, Effect, pipe } from 'effect'

const APPLE_REVIEWER_EMAIL = 'apple-reviewer@lily.app'
const APPLE_REVIEWER_USERNAME = 'AppleReviewer'
const APPLE_REVIEWER_TOKEN = 'apple-review-2024-lily-app'

const getExpiryDate = (): Date => {
  const date = new Date()
  date.setFullYear(date.getFullYear() + 1)
  return date
}

const daysAgo = (days: number): Date => {
  const date = new Date()
  date.setDate(date.getDate() - days)
  return date
}

const daysFromNow = (days: number): Date => {
  const date = new Date()
  date.setDate(date.getDate() + days)
  return date
}

const hoursAgo = (hours: number): Date => {
  const date = new Date()
  date.setHours(date.getHours() - hours)
  return date
}

// Sample plant data
const DEMO_PLANTS = [
  {
    name: 'Monstera Deliciosa',
    description:
      'Beautiful Swiss cheese plant with fenestrated leaves. Loves humidity and indirect light.',
    category: 'Tropical',
    humidityRating: 4,
    lightingRating: 3,
    petToxicityRating: 2,
    wateringRating: 3,
    health: 'THRIVING' as const,
    wateringFrequencyDays: 7,
    fertilizationFrequencyDays: 30,
    lastWateredAt: daysAgo(2),
    nextWateringAt: daysFromNow(5),
    lastFertilizedAt: daysAgo(15),
    nextFertilizationAt: daysFromNow(15),
    isFavorite: true,
  },
  {
    name: 'Snake Plant',
    description:
      'Low-maintenance air purifier. Perfect for beginners and forgetful plant parents.',
    category: 'Succulent',
    humidityRating: 2,
    lightingRating: 2,
    petToxicityRating: 3,
    wateringRating: 1,
    health: 'HEALTHY' as const,
    wateringFrequencyDays: 14,
    fertilizationFrequencyDays: 60,
    lastWateredAt: daysAgo(10),
    nextWateringAt: daysFromNow(4),
    lastFertilizedAt: daysAgo(45),
    nextFertilizationAt: daysFromNow(15),
    isFavorite: false,
  },
  {
    name: 'Fiddle Leaf Fig',
    description:
      'Statement plant with large violin-shaped leaves. Needs consistent care.',
    category: 'Tropical',
    humidityRating: 4,
    lightingRating: 4,
    petToxicityRating: 2,
    wateringRating: 4,
    health: 'NEEDS_ATTENTION' as const,
    wateringFrequencyDays: 7,
    fertilizationFrequencyDays: 14,
    lastWateredAt: daysAgo(10),
    nextWateringAt: daysAgo(3), // Overdue!
    lastFertilizedAt: daysAgo(20),
    nextFertilizationAt: daysAgo(6), // Overdue!
    isFavorite: true,
  },
  {
    name: 'Pothos',
    description:
      'Hardy trailing vine that thrives on neglect. Great for shelves and hanging baskets.',
    category: 'Vine',
    humidityRating: 3,
    lightingRating: 2,
    petToxicityRating: 3,
    wateringRating: 2,
    health: 'HEALTHY' as const,
    wateringFrequencyDays: 10,
    fertilizationFrequencyDays: 30,
    lastWateredAt: daysAgo(5),
    nextWateringAt: daysFromNow(5),
    lastFertilizedAt: daysAgo(20),
    nextFertilizationAt: daysFromNow(10),
    isFavorite: false,
  },
  {
    name: 'Peace Lily',
    description:
      'Elegant white flowers and dark green leaves. Tells you when it needs water!',
    category: 'Flowering',
    humidityRating: 4,
    lightingRating: 2,
    petToxicityRating: 3,
    wateringRating: 4,
    health: 'RECOVERING' as const,
    wateringFrequencyDays: 5,
    fertilizationFrequencyDays: 30,
    lastWateredAt: daysAgo(1),
    nextWateringAt: daysFromNow(4),
    lastFertilizedAt: daysAgo(25),
    nextFertilizationAt: daysFromNow(5),
    isFavorite: false,
  },
  {
    name: 'Rubber Plant',
    description:
      'Sturdy plant with thick, glossy leaves. Great air purifier for the home.',
    category: 'Tropical',
    humidityRating: 3,
    lightingRating: 3,
    petToxicityRating: 2,
    wateringRating: 3,
    health: 'HEALTHY' as const,
    wateringFrequencyDays: 10,
    fertilizationFrequencyDays: 30,
    lastWateredAt: daysAgo(7),
    nextWateringAt: daysFromNow(3),
    lastFertilizedAt: daysAgo(28),
    nextFertilizationAt: daysFromNow(2),
    isFavorite: false,
  },
]

// Achievements to unlock for demo
const DEMO_ACHIEVEMENTS = [
  { achievement: 'FIRST_PLANT_ADDED' as const, daysAgo: 30 },
  { achievement: 'WATERING_NOVICE' as const, daysAgo: 25 },
  { achievement: 'PLANT_COLLECTOR' as const, daysAgo: 20 },
  { achievement: 'DEDICATED_CARETAKER' as const, daysAgo: 15 },
  { achievement: 'PHOTO_PRO' as const, daysAgo: 10 },
] as const

const seedAppleReviewer = Effect.gen(function* () {
  const db = yield* PgDrizzle.PgDrizzle

  yield* Console.log('Seeding Apple reviewer test account with demo data...')
  yield* Console.log('')

  // 1. Create or update user
  const existingUsers = yield* db
    .select()
    .from(users)
    .where(eq(users.email, APPLE_REVIEWER_EMAIL))

  const existingUser = existingUsers[0]
  const user = existingUser
    ? yield* Effect.gen(function* () {
        yield* Console.log(`User already exists: ${existingUser.email}`)

        const updated = yield* db
          .update(users)
          .set({
            emailVerified: true,
            status: 'active',
            name: APPLE_REVIEWER_USERNAME,
            updatedAt: new Date(),
            language: 'en',
          })
          .where(eq(users.id, existingUser.id))
          .returning()

        return updated[0]!
      })
    : yield* Effect.gen(function* () {
        const created = yield* db
          .insert(users)
          .values({
            email: APPLE_REVIEWER_EMAIL,
            name: APPLE_REVIEWER_USERNAME,
            emailVerified: true,
            status: 'active',
            role: 'user',
            language: 'en',
          })
          .returning()

        yield* Console.log(`Created new user: ${created[0]!.email}`)
        return created[0]!
      })

  // 2. Create magic link
  yield* db.delete(magicLinks).where(eq(magicLinks.email, APPLE_REVIEWER_EMAIL))
  const expiryDate = getExpiryDate()
  yield* db.insert(magicLinks).values({
    email: APPLE_REVIEWER_EMAIL,
    token: APPLE_REVIEWER_TOKEN,
    expiresAt: expiryDate,
  })
  yield* Console.log('Created magic link')

  // 3. Clean up existing demo data for this user
  yield* db.delete(plants).where(eq(plants.userId, user.id))
  yield* db.delete(userAchievements).where(eq(userAchievements.userId, user.id))
  yield* db.delete(notifications).where(eq(notifications.userId, user.id))
  yield* Console.log('Cleaned up existing demo data')

  // 4. Create demo plants
  const createdPlants = yield* db
    .insert(plants)
    .values(
      pipe(
        DEMO_PLANTS,
        A.map((plant) => ({
          ...plant,
          userId: user.id,
          dateAdded: daysAgo(30),
        }))
      )
    )
    .returning()

  yield* Console.log(`Created ${createdPlants.length} demo plants`)

  // 5. Create care logs for each plant
  const careLogEntries = pipe(
    createdPlants,
    A.flatMap((plant) => {
      const logs = []

      // Add watering history
      for (let i = 0; i < 8; i++) {
        logs.push({
          type: 'watering' as const,
          plantId: plant.id,
          date: daysAgo(i * plant.wateringFrequencyDays),
          notes: i === 0 ? 'Soil was quite dry' : undefined,
        })
      }

      // Add fertilization history
      if (plant.fertilizationFrequencyDays) {
        for (let i = 0; i < 3; i++) {
          logs.push({
            type: 'fertilization' as const,
            plantId: plant.id,
            date: daysAgo(i * plant.fertilizationFrequencyDays),
            notes: i === 0 ? 'Used balanced 10-10-10 fertilizer' : undefined,
          })
        }
      }

      return logs
    })
  )

  yield* db.insert(careLogs).values(careLogEntries)
  yield* Console.log(`Created ${careLogEntries.length} care log entries`)

  // 6. Create plant photos for some plants
  const photoEntries = pipe(
    A.take(createdPlants, 3),
    A.flatMap((plant, index) => [
      {
        plantId: plant.id,
        url: `https://images.unsplash.com/photo-${1600000000000 + index}?w=800`,
        takenAt: daysAgo(20),
      },
      {
        plantId: plant.id,
        url: `https://images.unsplash.com/photo-${1600000000001 + index}?w=800`,
        takenAt: daysAgo(10),
      },
    ])
  )

  yield* db.insert(plantPhotos).values(photoEntries)
  yield* Console.log(`Created ${photoEntries.length} plant photos`)

  // 7. Create achievements
  const achievementEntries = pipe(
    DEMO_ACHIEVEMENTS,
    A.map((a) => ({
      userId: user.id,
      achievement: a.achievement,
      unlockedAt: daysAgo(a.daysAgo),
    }))
  )

  yield* db.insert(userAchievements).values(achievementEntries)
  yield* Console.log(`Unlocked ${achievementEntries.length} achievements`)

  // 8. Create sample chat messages for first plant
  const firstPlant = createdPlants[0]!
  const chatEntries = [
    {
      userId: user.id,
      plantId: firstPlant.id,
      role: 'user',
      content: 'Why are the leaves on my Monstera turning yellow?',
      createdAt: hoursAgo(48),
    },
    {
      userId: user.id,
      plantId: firstPlant.id,
      role: 'assistant',
      content:
        'Yellow leaves on a Monstera can have several causes: overwatering (most common), underwatering, insufficient light, or natural aging of older leaves. Check if the soil is staying wet too long between waterings. The soil should dry out about 2 inches deep before watering again.',
      createdAt: hoursAgo(47),
    },
    {
      userId: user.id,
      plantId: firstPlant.id,
      role: 'user',
      content: 'How often should I water it?',
      createdAt: hoursAgo(24),
    },
    {
      userId: user.id,
      plantId: firstPlant.id,
      role: 'assistant',
      content:
        'For your Monstera, water every 7-10 days during growing season (spring/summer) and every 2-3 weeks in winter. Always check the soil first - stick your finger 2 inches deep. If it feels dry, water thoroughly until it drains from the bottom. Empty the saucer after 30 minutes.',
      createdAt: hoursAgo(23),
    },
  ]

  yield* db.insert(chatMessages).values(chatEntries)
  yield* Console.log(`Created ${chatEntries.length} chat messages`)

  // 9. Create sample notifications
  const notificationEntries = [
    {
      userId: user.id,
      plantId: createdPlants[2]!.id, // Fiddle Leaf Fig (needs attention)
      type: 'watering_reminder',
      title: 'Water your Fiddle Leaf Fig',
      body: 'Your Fiddle Leaf Fig is overdue for watering by 3 days.',
      scheduledAt: daysAgo(1),
      sentAt: daysAgo(1),
      status: 'sent' as const,
      isRead: false,
    },
    {
      userId: user.id,
      plantId: createdPlants[0]!.id,
      type: 'watering_reminder',
      title: 'Water your Monstera Deliciosa',
      body: 'Time to water your Monstera! The soil should be ready.',
      scheduledAt: daysFromNow(5),
      status: 'pending' as const,
      isRead: false,
    },
    {
      userId: user.id,
      plantId: createdPlants[5]!.id, // Rubber Plant
      type: 'fertilization_reminder',
      title: 'Fertilize your Rubber Plant',
      body: 'Your Rubber Plant is due for fertilization in 2 days.',
      scheduledAt: daysFromNow(2),
      status: 'pending' as const,
      isRead: false,
    },
  ]

  yield* db.insert(notifications).values(notificationEntries)
  yield* Console.log(`Created ${notificationEntries.length} notifications`)

  // Print summary
  yield* Console.log('')
  yield* Console.log('='.repeat(60))
  yield* Console.log('Apple Reviewer Account Created Successfully!')
  yield* Console.log('='.repeat(60))
  yield* Console.log('')
  yield* Console.log('Account Details:')
  yield* Console.log(`  Email:    ${APPLE_REVIEWER_EMAIL}`)
  yield* Console.log(`  Username: ${APPLE_REVIEWER_USERNAME}`)
  yield* Console.log(`  User ID:  ${user.id}`)
  yield* Console.log('')
  yield* Console.log('Demo Data:')
  yield* Console.log(
    `  Plants:       ${createdPlants.length} (various health states)`
  )
  yield* Console.log(`  Care logs:    ${careLogEntries.length} entries`)
  yield* Console.log(`  Photos:       ${photoEntries.length}`)
  yield* Console.log(`  Achievements: ${achievementEntries.length} unlocked`)
  yield* Console.log(`  Chat history: ${chatEntries.length} messages`)
  yield* Console.log(`  Notifications: ${notificationEntries.length}`)
  yield* Console.log('')
  yield* Console.log('Magic Link Details:')
  yield* Console.log(`  Token:   ${APPLE_REVIEWER_TOKEN}`)
  yield* Console.log(`  Expires: ${expiryDate.toISOString()}`)
  yield* Console.log('')
  yield* Console.log('Deep Link URL (for App Store Connect):')
  yield* Console.log(`  lily://verify?code=${APPLE_REVIEWER_TOKEN}`)
  yield* Console.log('')
  yield* Console.log('='.repeat(60))
})

const program = seedAppleReviewer.pipe(Effect.provide(DrizzleLive))

Effect.runPromise(program)
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Error seeding Apple reviewer account:', error)
    process.exit(1)
  })
