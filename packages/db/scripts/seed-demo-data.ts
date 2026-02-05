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

  const user = demoUser!
  yield* Console.log(`  Created user: ${user.name} (${user.email})`)
  yield* Console.log(`  User ID: ${user.id}`)

  // Create plants
  yield* Console.log('Creating 12 demo plants...')
  const createdPlants: Array<{ id: string; name: string }> = []

  for (const plantData of DEMO_PLANTS) {
    const result = yield* db
      .insert(plants)
      .values({
        ...plantData,
        userId: user.id,
        dateAdded: plantData.dateAdded ?? new Date(),
      })
      .returning({ id: plants.id, name: plants.name })

    const plant = result[0]!
    createdPlants.push(plant)
    yield* Console.log(`  Created plant: ${plant.name}`)
  }

  // Create comprehensive care log history for testing various scenarios
  yield* Console.log('Creating comprehensive care log history...')

  // Helper to create date in the past
  const daysAgo = (days: number) =>
    new Date(Date.now() - days * 24 * 60 * 60 * 1000)
  const hoursAgo = (hours: number) =>
    new Date(Date.now() - hours * 60 * 60 * 1000)

  // Snake Plant - Long history, infrequent watering (succulent)
  const snakePlant = createdPlants.find((p) => p.name === 'Snake Plant')
  if (snakePlant) {
    yield* db.insert(careLogs).values([
      {
        type: 'watering',
        notes: 'Light watering',
        date: daysAgo(15),
        plantId: snakePlant.id,
      },
      {
        type: 'watering',
        notes: 'Watered thoroughly',
        date: daysAgo(29),
        plantId: snakePlant.id,
      },
      {
        type: 'fertilization',
        notes: 'Slow release fertilizer',
        date: daysAgo(25),
        plantId: snakePlant.id,
      },
      {
        type: 'watering',
        notes: 'Regular watering',
        date: daysAgo(43),
        plantId: snakePlant.id,
      },
      {
        type: 'watering',
        notes: 'Light watering',
        date: daysAgo(57),
        plantId: snakePlant.id,
      },
      {
        type: 'fertilization',
        notes: 'Monthly feed',
        date: daysAgo(55),
        plantId: snakePlant.id,
      },
      {
        type: 'watering',
        notes: 'Repotted and watered',
        date: daysAgo(90),
        plantId: snakePlant.id,
      },
    ])
    yield* Console.log('  Snake Plant: 7 care logs (15-90 days ago)')
  }

  // Pothos - Regular watering, trailing vine
  const pothos = createdPlants.find((p) => p.name === 'Pothos')
  if (pothos) {
    yield* db.insert(careLogs).values([
      {
        type: 'watering',
        notes: 'Regular watering',
        date: daysAgo(8),
        plantId: pothos.id,
      },
      {
        type: 'watering',
        notes: 'Watered well',
        date: daysAgo(15),
        plantId: pothos.id,
      },
      {
        type: 'watering',
        notes: 'Regular watering',
        date: daysAgo(22),
        plantId: pothos.id,
      },
      {
        type: 'watering',
        notes: 'Trimmed vines, light watering',
        date: daysAgo(20),
        plantId: pothos.id,
      },
      {
        type: 'watering',
        notes: 'Light watering',
        date: daysAgo(29),
        plantId: pothos.id,
      },
      {
        type: 'fertilization',
        notes: 'Liquid fertilizer',
        date: daysAgo(30),
        plantId: pothos.id,
      },
    ])
    yield* Console.log('  Pothos: 6 care logs (8-30 days ago)')
  }

  // Fern - High maintenance, frequent watering
  const fern = createdPlants.find((p) => p.name === 'Fern')
  if (fern) {
    yield* db.insert(careLogs).values([
      {
        type: 'watering',
        notes: 'Misted and watered',
        date: daysAgo(4),
        plantId: fern.id,
      },
      {
        type: 'watering',
        notes: 'Heavy watering',
        date: daysAgo(7),
        plantId: fern.id,
      },
      {
        type: 'watering',
        notes: 'Misted leaves',
        date: daysAgo(8),
        plantId: fern.id,
      },
      {
        type: 'watering',
        notes: 'Regular watering',
        date: daysAgo(10),
        plantId: fern.id,
      },
      {
        type: 'watering',
        notes: 'Misted and watered',
        date: daysAgo(13),
        plantId: fern.id,
      },
      {
        type: 'watering',
        notes: 'Watered thoroughly',
        date: daysAgo(16),
        plantId: fern.id,
      },
      {
        type: 'fertilization',
        notes: 'Diluted fertilizer',
        date: daysAgo(14),
        plantId: fern.id,
      },
      {
        type: 'watering',
        notes: 'Regular watering',
        date: daysAgo(19),
        plantId: fern.id,
      },
      {
        type: 'watering',
        notes: 'Misted leaves',
        date: daysAgo(21),
        plantId: fern.id,
      },
    ])
    yield* Console.log('  Fern: 9 care logs (4-21 days ago, frequent)')
  }

  // Fiddle Leaf Fig - Medium maintenance with recent activity
  const fiddleLeafFig = createdPlants.find((p) => p.name === 'Fiddle Leaf Fig')
  if (fiddleLeafFig) {
    yield* db.insert(careLogs).values([
      {
        type: 'watering',
        notes: 'Misted leaves',
        date: hoursAgo(2),
        plantId: fiddleLeafFig.id,
      },
      {
        type: 'watering',
        notes: 'Regular watering',
        date: daysAgo(3),
        plantId: fiddleLeafFig.id,
      },
      {
        type: 'fertilization',
        notes: 'Balanced fertilizer',
        date: daysAgo(14),
        plantId: fiddleLeafFig.id,
      },
      {
        type: 'watering',
        notes: 'Thorough watering',
        date: daysAgo(10),
        plantId: fiddleLeafFig.id,
      },
      {
        type: 'watering',
        notes: 'Regular watering',
        date: daysAgo(17),
        plantId: fiddleLeafFig.id,
      },
      {
        type: 'watering',
        notes: 'Removed dead leaves, light watering',
        date: daysAgo(21),
        plantId: fiddleLeafFig.id,
      },
      {
        type: 'fertilization',
        notes: 'Monthly feed',
        date: daysAgo(44),
        plantId: fiddleLeafFig.id,
      },
    ])
    yield* Console.log('  Fiddle Leaf Fig: 7 care logs (2 hours - 44 days ago)')
  }

  // Cactus - Very infrequent, newly added
  const cactus = createdPlants.find((p) => p.name === 'Cactus')
  if (cactus) {
    yield* db.insert(careLogs).values([
      {
        type: 'watering',
        notes: 'Initial watering after potting',
        date: daysAgo(1),
        plantId: cactus.id,
      },
    ])
    yield* Console.log('  Cactus: 1 care log (newly added)')
  }

  // Aloe Vera - Moderate history
  const aloeVera = createdPlants.find((p) => p.name === 'Aloe Vera')
  if (aloeVera) {
    yield* db.insert(careLogs).values([
      {
        type: 'watering',
        notes: 'Light watering',
        date: daysAgo(5),
        plantId: aloeVera.id,
      },
      {
        type: 'watering',
        notes: 'Regular watering',
        date: daysAgo(19),
        plantId: aloeVera.id,
      },
      {
        type: 'watering',
        notes: 'Thorough watering',
        date: daysAgo(33),
        plantId: aloeVera.id,
      },
      {
        type: 'fertilization',
        notes: 'Succulent fertilizer',
        date: daysAgo(45),
        plantId: aloeVera.id,
      },
      {
        type: 'watering',
        notes: 'Divided pups, repotted and watered',
        date: daysAgo(60),
        plantId: aloeVera.id,
      },
    ])
    yield* Console.log('  Aloe Vera: 5 care logs (5-60 days ago)')
  }

  // Monstera - Popular plant with good history
  const monstera = createdPlants.find((p) => p.name === 'Monstera')
  if (monstera) {
    yield* db.insert(careLogs).values([
      {
        type: 'watering',
        notes: 'Regular watering',
        date: daysAgo(2),
        plantId: monstera.id,
      },
      {
        type: 'watering',
        notes: 'Watered well',
        date: daysAgo(9),
        plantId: monstera.id,
      },
      {
        type: 'watering',
        notes: 'Regular watering',
        date: daysAgo(16),
        plantId: monstera.id,
      },
      {
        type: 'fertilization',
        notes: 'Liquid fertilizer',
        date: daysAgo(22),
        plantId: monstera.id,
      },
      {
        type: 'watering',
        notes: 'Thorough watering',
        date: daysAgo(23),
        plantId: monstera.id,
      },
      {
        type: 'watering',
        notes: 'Cleaned aerial roots, watered',
        date: daysAgo(30),
        plantId: monstera.id,
      },
      {
        type: 'watering',
        notes: 'Added moss pole, watered',
        date: daysAgo(45),
        plantId: monstera.id,
      },
    ])
    yield* Console.log('  Monstera: 7 care logs (2-45 days ago)')
  }

  // Peace Lily - Flowering plant with varied care
  const peaceLily = createdPlants.find((p) => p.name === 'Peace Lily')
  if (peaceLily) {
    yield* db.insert(careLogs).values([
      {
        type: 'watering',
        notes: 'Regular watering',
        date: daysAgo(2),
        plantId: peaceLily.id,
      },
      {
        type: 'watering',
        notes: 'Watered and misted',
        date: daysAgo(7),
        plantId: peaceLily.id,
      },
      {
        type: 'watering',
        notes: 'Regular watering',
        date: daysAgo(12),
        plantId: peaceLily.id,
      },
      {
        type: 'watering',
        notes: 'Light watering',
        date: daysAgo(17),
        plantId: peaceLily.id,
      },
      {
        type: 'fertilization',
        notes: 'Bloom booster fertilizer',
        date: daysAgo(28),
        plantId: peaceLily.id,
      },
      {
        type: 'watering',
        notes: 'Removed spent flowers, watered',
        date: daysAgo(35),
        plantId: peaceLily.id,
      },
      {
        type: 'watering',
        notes: 'Thorough watering',
        date: daysAgo(22),
        plantId: peaceLily.id,
      },
    ])
    yield* Console.log('  Peace Lily: 7 care logs (2-35 days ago)')
  }

  // Spider Plant - Air purifier with propagation
  const spiderPlant = createdPlants.find((p) => p.name === 'Spider Plant')
  if (spiderPlant) {
    yield* db.insert(careLogs).values([
      {
        type: 'watering',
        notes: 'Regular watering',
        date: daysAgo(4),
        plantId: spiderPlant.id,
      },
      {
        type: 'watering',
        notes: 'Watered well',
        date: daysAgo(11),
        plantId: spiderPlant.id,
      },
      {
        type: 'watering',
        notes: 'Regular watering',
        date: daysAgo(18),
        plantId: spiderPlant.id,
      },
      {
        type: 'watering',
        notes: 'Harvested baby plants, watered',
        date: daysAgo(25),
        plantId: spiderPlant.id,
      },
      {
        type: 'fertilization',
        notes: 'Balanced liquid feed',
        date: daysAgo(40),
        plantId: spiderPlant.id,
      },
    ])
    yield* Console.log('  Spider Plant: 5 care logs (4-40 days ago)')
  }

  // Rubber Plant - Sturdy with moderate care
  const rubberPlant = createdPlants.find((p) => p.name === 'Rubber Plant')
  if (rubberPlant) {
    yield* db.insert(careLogs).values([
      {
        type: 'watering',
        notes: 'Thorough watering',
        date: daysAgo(3),
        plantId: rubberPlant.id,
      },
      {
        type: 'watering',
        notes: 'Regular watering',
        date: daysAgo(13),
        plantId: rubberPlant.id,
      },
      {
        type: 'watering',
        notes: 'Light watering',
        date: daysAgo(23),
        plantId: rubberPlant.id,
      },
      {
        type: 'watering',
        notes: 'Wiped leaves clean, misted',
        date: daysAgo(15),
        plantId: rubberPlant.id,
      },
      {
        type: 'fertilization',
        notes: 'Slow release pellets',
        date: daysAgo(50),
        plantId: rubberPlant.id,
      },
    ])
    yield* Console.log('  Rubber Plant: 5 care logs (3-50 days ago)')
  }

  // Orchid - Needs attention, irregular care
  const orchid = createdPlants.find((p) => p.name === 'Orchid')
  if (orchid) {
    yield* db.insert(careLogs).values([
      {
        type: 'watering',
        notes: 'Ice cube method',
        date: daysAgo(10),
        plantId: orchid.id,
      },
      {
        type: 'watering',
        notes: 'Soaked roots',
        date: daysAgo(17),
        plantId: orchid.id,
      },
      {
        type: 'watering',
        notes: 'Ice cubes',
        date: daysAgo(24),
        plantId: orchid.id,
      },
      {
        type: 'fertilization',
        notes: 'Orchid fertilizer',
        date: daysAgo(30),
        plantId: orchid.id,
      },
      {
        type: 'watering',
        notes: 'Regular watering',
        date: daysAgo(31),
        plantId: orchid.id,
      },
      {
        type: 'watering',
        notes: 'Cut old flower spike, watered',
        date: daysAgo(45),
        plantId: orchid.id,
      },
    ])
    yield* Console.log(
      '  Orchid: 6 care logs (10-45 days ago, needs attention)'
    )
  }

  // Calathea - Needs attention, demanding plant
  const calathea = createdPlants.find((p) => p.name === 'Calathea')
  if (calathea) {
    yield* db.insert(careLogs).values([
      {
        type: 'watering',
        notes: 'Distilled water',
        date: daysAgo(8),
        plantId: calathea.id,
      },
      {
        type: 'watering',
        notes: 'Misted heavily',
        date: daysAgo(10),
        plantId: calathea.id,
      },
      {
        type: 'watering',
        notes: 'Regular watering',
        date: daysAgo(13),
        plantId: calathea.id,
      },
      {
        type: 'watering',
        notes: 'Distilled water',
        date: daysAgo(18),
        plantId: calathea.id,
      },
      {
        type: 'fertilization',
        notes: 'Weak fertilizer solution',
        date: daysAgo(25),
        plantId: calathea.id,
      },
      {
        type: 'watering',
        notes: 'Misted and watered',
        date: daysAgo(23),
        plantId: calathea.id,
      },
      {
        type: 'watering',
        notes: 'Removed brown leaf tips, watered',
        date: daysAgo(30),
        plantId: calathea.id,
      },
    ])
    yield* Console.log(
      '  Calathea: 7 care logs (8-30 days ago, needs attention)'
    )
  }

  // Updated count: 7 + 6 + 9 + 7 + 1 + 5 + 7 + 7 + 5 + 5 + 6 + 7 = 72
  const totalCareLogs = 72

  yield* Console.log('')
  yield* Console.log('Demo data seeded successfully!')
  yield* Console.log('')
  yield* Console.log('Summary:')
  yield* Console.log(`  User: ${user.name} (${user.email})`)
  yield* Console.log(`  Plants: ${createdPlants.length} total`)
  yield* Console.log('    - 10 healthy')
  yield* Console.log('    - 2 need attention (Orchid, Calathea)')
  yield* Console.log('')
  yield* Console.log('  Care tasks due:')
  yield* Console.log('    - 3 overdue watering (Snake Plant, Pothos, Fern)')
  yield* Console.log('    - 1 overdue fertilization (Monstera)')
  yield* Console.log('    - 1 fertilization today (Fiddle Leaf Fig)')
  yield* Console.log(
    '    - 2 fertilization this week (Snake Plant, Peace Lily)'
  )
  yield* Console.log('')
  yield* Console.log(
    `  Care logs: ${totalCareLogs} activities across all plants`
  )
  yield* Console.log('    - Snake Plant: 7 logs (15-90 days ago)')
  yield* Console.log('    - Pothos: 6 logs (8-30 days ago)')
  yield* Console.log('    - Fern: 9 logs (4-21 days ago, high frequency)')
  yield* Console.log('    - Fiddle Leaf Fig: 7 logs (2h-44 days ago)')
  yield* Console.log('    - Cactus: 1 log (newly added)')
  yield* Console.log('    - Aloe Vera: 5 logs (5-60 days ago)')
  yield* Console.log('    - Monstera: 7 logs (2-45 days ago)')
  yield* Console.log('    - Peace Lily: 7 logs (2-35 days ago)')
  yield* Console.log('    - Spider Plant: 5 logs (4-40 days ago)')
  yield* Console.log('    - Rubber Plant: 5 logs (3-50 days ago)')
  yield* Console.log('    - Orchid: 6 logs (10-45 days ago)')
  yield* Console.log('    - Calathea: 7 logs (8-30 days ago)')
  yield* Console.log('')
  yield* Console.log('  Care log types included:')
  yield* Console.log('    - watering (frequent, with maintenance notes)')
  yield* Console.log('    - fertilization (monthly)')
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
