#!/usr/bin/env bun
/**
 * Seed script to create demo data for visual testing
 * Usage: bun run seed:demo
 *
 * Creates:
 * - Demo user "Alex"
 * - 12 plants (10 healthy, 2 need attention)
 * - 3 plants needing water today
 * - Recent care log activities
 */

import * as PgDrizzle from '@effect/sql-drizzle/Pg'
import { careLogs, DrizzleLive, plants, users } from '@lily/db'
import { Console, Effect } from 'effect'

// Demo plant data based on design mockup
const DEMO_PLANTS = [
  // Plants needing water (shown in Hydration Card)
  {
    name: 'Snake Plant',
    description: 'Hardy succulent with sword-shaped leaves',
    category: 'Succulent',
    imageUrl:
      'https://images.unsplash.com/photo-1593482892290-f54927ae1bb6?w=400',
    humidityRating: 2,
    lightingRating: 3,
    petToxicityRating: 3,
    wateringRating: 2,
    health: 'HEALTHY' as const,
    wateringFrequencyDays: 14,
    lastWateredAt: new Date(Date.now() - 15 * 24 * 60 * 60 * 1000), // 15 days ago
    nextWateringAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000), // Yesterday (overdue)
    fertilizationFrequencyDays: 30,
    lastFertilizedAt: new Date(Date.now() - 25 * 24 * 60 * 60 * 1000), // 25 days ago
    nextFertilizationAt: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000), // In 5 days (this week)
  },
  {
    name: 'Pothos',
    description: 'Trailing vine with heart-shaped leaves',
    category: 'Vine',
    imageUrl:
      'https://images.unsplash.com/photo-1602923668104-8f9e03e77e62?w=400',
    humidityRating: 3,
    lightingRating: 2,
    petToxicityRating: 3,
    wateringRating: 3,
    health: 'HEALTHY' as const,
    wateringFrequencyDays: 7,
    lastWateredAt: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000), // 8 days ago
    nextWateringAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000), // Yesterday (overdue)
  },
  {
    name: 'Fern',
    description: 'Lush green fern with delicate fronds',
    category: 'Fern',
    imageUrl:
      'https://images.unsplash.com/photo-1459411552884-841db9b3cc2a?w=400',
    humidityRating: 5,
    lightingRating: 2,
    petToxicityRating: 1,
    wateringRating: 5,
    health: 'HEALTHY' as const,
    wateringFrequencyDays: 3,
    lastWateredAt: new Date(Date.now() - 4 * 24 * 60 * 60 * 1000), // 4 days ago
    nextWateringAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000), // Yesterday (overdue)
  },
  // Other healthy plants
  {
    name: 'Fiddle Leaf Fig',
    description: 'Popular indoor tree with large fiddle-shaped leaves',
    category: 'Tree',
    imageUrl: 'https://images.unsplash.com/photo-1545241047-6083a3684587?w=400',
    humidityRating: 4,
    lightingRating: 4,
    petToxicityRating: 3,
    wateringRating: 3,
    health: 'HEALTHY' as const,
    wateringFrequencyDays: 7,
    lastWateredAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000), // 3 days ago
    nextWateringAt: new Date(Date.now() + 4 * 24 * 60 * 60 * 1000), // In 4 days
    fertilizationFrequencyDays: 14,
    lastFertilizedAt: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000), // 14 days ago
    nextFertilizationAt: new Date(), // Today
  },
  {
    name: 'Cactus',
    description: 'Desert succulent, low maintenance',
    category: 'Succulent',
    imageUrl:
      'https://images.unsplash.com/photo-1509423350716-97f9360b4e09?w=400',
    humidityRating: 1,
    lightingRating: 5,
    petToxicityRating: 2,
    wateringRating: 1,
    health: 'HEALTHY' as const,
    wateringFrequencyDays: 21,
    lastWateredAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000), // Yesterday (newly added)
    nextWateringAt: new Date(Date.now() + 20 * 24 * 60 * 60 * 1000),
    dateAdded: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000), // Yesterday
  },
  {
    name: 'Aloe Vera',
    description: 'Medicinal succulent with healing gel',
    category: 'Succulent',
    imageUrl:
      'https://images.unsplash.com/photo-1509423350716-97f9360b4e09?w=400',
    humidityRating: 2,
    lightingRating: 4,
    petToxicityRating: 2,
    wateringRating: 2,
    health: 'HEALTHY' as const,
    wateringFrequencyDays: 14,
    lastWateredAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000),
    nextWateringAt: new Date(Date.now() + 9 * 24 * 60 * 60 * 1000),
  },
  {
    name: 'Monstera',
    description: 'Tropical plant with iconic split leaves',
    category: 'Tropical',
    imageUrl:
      'https://images.unsplash.com/photo-1614594975525-e45190c55d0b?w=400',
    humidityRating: 4,
    lightingRating: 3,
    petToxicityRating: 3,
    wateringRating: 3,
    health: 'HEALTHY' as const,
    wateringFrequencyDays: 7,
    lastWateredAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
    nextWateringAt: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000),
    fertilizationFrequencyDays: 21,
    lastFertilizedAt: new Date(Date.now() - 22 * 24 * 60 * 60 * 1000), // 22 days ago
    nextFertilizationAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000), // Yesterday (overdue)
  },
  {
    name: 'Peace Lily',
    description: 'Elegant flowering plant with white blooms',
    category: 'Flowering',
    imageUrl:
      'https://images.unsplash.com/photo-1593691509543-c55fb32e5ce9?w=400',
    humidityRating: 4,
    lightingRating: 2,
    petToxicityRating: 4,
    wateringRating: 4,
    health: 'HEALTHY' as const,
    wateringFrequencyDays: 5,
    lastWateredAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
    nextWateringAt: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000),
    fertilizationFrequencyDays: 30,
    lastFertilizedAt: new Date(Date.now() - 28 * 24 * 60 * 60 * 1000), // 28 days ago
    nextFertilizationAt: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000), // In 2 days (this week)
  },
  {
    name: 'Spider Plant',
    description: 'Air-purifying plant with arching leaves',
    category: 'Grass',
    imageUrl:
      'https://images.unsplash.com/photo-1572688484438-313a6e50c333?w=400',
    humidityRating: 3,
    lightingRating: 3,
    petToxicityRating: 1,
    wateringRating: 3,
    health: 'HEALTHY' as const,
    wateringFrequencyDays: 7,
    lastWateredAt: new Date(Date.now() - 4 * 24 * 60 * 60 * 1000),
    nextWateringAt: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000),
  },
  {
    name: 'Rubber Plant',
    description: 'Bold foliage plant with glossy leaves',
    category: 'Tree',
    imageUrl:
      'https://images.unsplash.com/photo-1459411552884-841db9b3cc2a?w=400',
    humidityRating: 3,
    lightingRating: 3,
    petToxicityRating: 3,
    wateringRating: 3,
    health: 'HEALTHY' as const,
    wateringFrequencyDays: 10,
    lastWateredAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
    nextWateringAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
  },
  // Plants needing attention (2)
  {
    name: 'Orchid',
    description: 'Elegant flowering orchid',
    category: 'Flowering',
    imageUrl:
      'https://images.unsplash.com/photo-1566836610593-62a64888c459?w=400',
    humidityRating: 5,
    lightingRating: 3,
    petToxicityRating: 1,
    wateringRating: 3,
    health: 'NEEDS_ATTENTION' as const,
    wateringFrequencyDays: 7,
    lastWateredAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000),
    nextWateringAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
  },
  {
    name: 'Calathea',
    description: 'Prayer plant with decorative leaves',
    category: 'Tropical',
    imageUrl:
      'https://images.unsplash.com/photo-1637967886160-fd761519fb90?w=400',
    humidityRating: 5,
    lightingRating: 2,
    petToxicityRating: 1,
    wateringRating: 4,
    health: 'NEEDS_ATTENTION' as const,
    wateringFrequencyDays: 5,
    lastWateredAt: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000),
    nextWateringAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
  },
]

const seedDemoData = Effect.gen(function* () {
  const db = yield* PgDrizzle.PgDrizzle

  yield* Console.log('Seeding demo data for visual testing...')

  // Create demo user Alex
  yield* Console.log('Creating demo user Alex...')
  const [demoUser] = yield* db
    .insert(users)
    .values({
      email: 'antoine@lily.app',
      name: 'Alex',
      emailVerified: true,
      role: 'user',
      status: 'active',
      careReminders: true,
      weeklyDigest: true,
      achievementNotifications: true,
      tips: true,
      productUpdates: false,
      ads: false,
      doNotDisturb: false,
    })
    .onConflictDoUpdate({
      target: users.email,
      set: {
        name: 'Alex',
        updatedAt: new Date(),
      },
    })
    .returning()

  yield* Console.log(`  Created user: ${demoUser.name} (${demoUser.email})`)
  yield* Console.log(`  User ID: ${demoUser.id}`)

  // Create plants
  yield* Console.log('Creating 12 demo plants...')
  const createdPlants: Array<{ id: string; name: string }> = []

  for (const plantData of DEMO_PLANTS) {
    const [plant] = yield* db
      .insert(plants)
      .values({
        ...plantData,
        userId: demoUser.id,
        dateAdded: plantData.dateAdded ?? new Date(),
      })
      .returning({ id: plants.id, name: plants.name })

    createdPlants.push(plant)
    yield* Console.log(`  Created plant: ${plant.name}`)
  }

  // Create care logs for recent activity
  yield* Console.log('Creating care log history...')

  // Find Fiddle Leaf Fig for misting activity (using watering as proxy)
  const fiddleLeafFig = createdPlants.find((p) => p.name === 'Fiddle Leaf Fig')
  if (fiddleLeafFig) {
    yield* db.insert(careLogs).values({
      type: 'watering',
      notes: 'Misted leaves',
      date: new Date(Date.now() - 2 * 60 * 60 * 1000), // 2 hours ago
      plantId: fiddleLeafFig.id,
    })
    yield* Console.log('  Created care log: Fiddle Leaf Fig watered (misted)')
  }

  // Add some older care logs for history
  const monstera = createdPlants.find((p) => p.name === 'Monstera')
  if (monstera) {
    yield* db.insert(careLogs).values({
      type: 'watering',
      notes: 'Regular watering',
      date: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000), // 2 days ago
      plantId: monstera.id,
    })
    yield* Console.log('  Created care log: Monstera watered')
  }

  const peaceLily = createdPlants.find((p) => p.name === 'Peace Lily')
  if (peaceLily) {
    yield* db.insert(careLogs).values({
      type: 'fertilization',
      notes: 'Monthly fertilization',
      date: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000), // 3 days ago
      plantId: peaceLily.id,
    })
    yield* Console.log('  Created care log: Peace Lily fertilized')
  }

  const snakePlant = createdPlants.find((p) => p.name === 'Snake Plant')
  if (snakePlant) {
    yield* db.insert(careLogs).values({
      type: 'watering',
      notes: 'Watered thoroughly',
      date: new Date(Date.now() - 15 * 24 * 60 * 60 * 1000), // 15 days ago
      plantId: snakePlant.id,
    })
    yield* Console.log('  Created care log: Snake Plant watered (15 days ago)')
  }

  yield* Console.log('')
  yield* Console.log('Demo data seeded successfully!')
  yield* Console.log('')
  yield* Console.log('Summary:')
  yield* Console.log(`  User: ${demoUser.name} (${demoUser.email})`)
  yield* Console.log(`  Plants: ${createdPlants.length} total`)
  yield* Console.log('    - 10 healthy')
  yield* Console.log('    - 2 need attention')
  yield* Console.log('  Care tasks:')
  yield* Console.log('    - 3 overdue watering (Snake Plant, Pothos, Fern)')
  yield* Console.log('    - 1 overdue fertilization (Monstera)')
  yield* Console.log('    - 1 fertilization today (Fiddle Leaf Fig)')
  yield* Console.log(
    '    - 2 fertilization this week (Snake Plant, Peace Lily)'
  )
  yield* Console.log('  Care logs: 4 activities')
  yield* Console.log('')
  yield* Console.log(
    'To log in as Alex, use the magic link flow with: antoine@lily.app'
  )
})

const program = seedDemoData.pipe(Effect.provide(DrizzleLive))

Effect.runPromise(program)
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Error seeding demo data:', error)
    process.exit(1)
  })
