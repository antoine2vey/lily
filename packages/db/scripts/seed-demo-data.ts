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
import { DrizzleLive } from '@lily/db'
import {
  careLogs,
  plantCareSchedules,
  plants,
  userFollows,
  users,
} from '@lily/db/schema'
import { and, eq, or } from 'drizzle-orm'
import { Array as A, Console, Effect, Option } from 'effect'

const getFirst = <T>(arr: T[]): T => {
  const first = A.head(arr)
  if (Option.isNone(first)) {
    throw new Error('Expected array to have at least one element')
  }
  return first.value
}

// Helper to build a date relative to now
const daysFromNow = (days: number) =>
  new Date(Date.now() + days * 24 * 60 * 60 * 1000)

// Care schedule data attached to each plant definition
interface PlantSchedule {
  careType: 'watering' | 'fertilization'
  frequencyDays: number
  lastCareAt: Date | null
  nextCareAt: Date
}

interface DemoPlantData {
  name: string
  description: string
  category: string
  imageUrl: string
  humidityRating: number
  lightingRating: number
  petToxicityRating: number
  wateringRating: number
  health: 'HEALTHY' | 'THRIVING' | 'NEEDS_ATTENTION' | 'SICK' | 'RECOVERING'
  dateAdded?: Date
  isFavorite?: boolean
  schedules: PlantSchedule[]
}

// Demo plant data based on design mockup
const DEMO_PLANTS: DemoPlantData[] = [
  // Plants needing water (shown in Hydration Card)
  {
    name: 'Snake Plant',
    description: 'Hardy succulent with sword-shaped leaves',
    category: 'Succulent',
    imageUrl:
      'https://images.unsplash.com/photo-1764249454220-ce25a9153805?w=400',
    humidityRating: 2,
    lightingRating: 3,
    petToxicityRating: 3,
    wateringRating: 2,
    health: 'HEALTHY',
    schedules: [
      {
        careType: 'watering',
        frequencyDays: 14,
        lastCareAt: daysFromNow(-15),
        nextCareAt: daysFromNow(-1), // Yesterday (overdue)
      },
      {
        careType: 'fertilization',
        frequencyDays: 30,
        lastCareAt: daysFromNow(-25),
        nextCareAt: daysFromNow(5), // In 5 days (this week)
      },
    ],
  },
  {
    name: 'Pothos',
    description: 'Trailing vine with heart-shaped leaves',
    category: 'Vine',
    imageUrl:
      'https://images.unsplash.com/photo-1764271728253-d381475517bb?w=400',
    humidityRating: 3,
    lightingRating: 2,
    petToxicityRating: 3,
    wateringRating: 3,
    health: 'HEALTHY',
    schedules: [
      {
        careType: 'watering',
        frequencyDays: 7,
        lastCareAt: daysFromNow(-8),
        nextCareAt: daysFromNow(-1), // Yesterday (overdue)
      },
    ],
  },
  {
    name: 'Fern',
    description: 'Lush green fern with delicate fronds',
    category: 'Fern',
    imageUrl:
      'https://images.unsplash.com/photo-1528789283076-808070b2dae6?w=400',
    humidityRating: 5,
    lightingRating: 2,
    petToxicityRating: 1,
    wateringRating: 5,
    health: 'HEALTHY',
    schedules: [
      {
        careType: 'watering',
        frequencyDays: 3,
        lastCareAt: daysFromNow(-4),
        nextCareAt: daysFromNow(-1), // Yesterday (overdue)
      },
    ],
  },
  // Other healthy plants
  {
    name: 'Fiddle Leaf Fig',
    description: 'Popular indoor tree with large fiddle-shaped leaves',
    category: 'Tree',
    imageUrl:
      'https://images.unsplash.com/photo-1602648707943-94aff309c088?w=400',
    humidityRating: 4,
    lightingRating: 4,
    petToxicityRating: 3,
    wateringRating: 3,
    health: 'HEALTHY',
    schedules: [
      {
        careType: 'watering',
        frequencyDays: 7,
        lastCareAt: daysFromNow(-3),
        nextCareAt: daysFromNow(4),
      },
      {
        careType: 'fertilization',
        frequencyDays: 14,
        lastCareAt: daysFromNow(-14),
        nextCareAt: daysFromNow(0), // Today
      },
    ],
  },
  {
    name: 'Cactus',
    description: 'Desert succulent, low maintenance',
    category: 'Succulent',
    imageUrl:
      'https://images.unsplash.com/photo-1763784436630-629fd9a4e0e2?w=400',
    humidityRating: 1,
    lightingRating: 5,
    petToxicityRating: 2,
    wateringRating: 1,
    health: 'HEALTHY',
    dateAdded: daysFromNow(-1), // Yesterday
    schedules: [
      {
        careType: 'watering',
        frequencyDays: 21,
        lastCareAt: daysFromNow(-1),
        nextCareAt: daysFromNow(20),
      },
    ],
  },
  {
    name: 'Aloe Vera',
    description: 'Medicinal succulent with healing gel',
    category: 'Succulent',
    imageUrl:
      'https://images.unsplash.com/photo-1501597392671-6eee5525a294?w=400',
    humidityRating: 2,
    lightingRating: 4,
    petToxicityRating: 2,
    wateringRating: 2,
    health: 'HEALTHY',
    schedules: [
      {
        careType: 'watering',
        frequencyDays: 14,
        lastCareAt: daysFromNow(-5),
        nextCareAt: daysFromNow(9),
      },
    ],
  },
  {
    name: 'Monstera',
    description: 'Tropical plant with iconic split leaves',
    category: 'Tropical',
    imageUrl:
      'https://images.unsplash.com/photo-1603095859718-b6300a0aad18?w=400',
    humidityRating: 4,
    lightingRating: 3,
    petToxicityRating: 3,
    wateringRating: 3,
    health: 'HEALTHY',
    schedules: [
      {
        careType: 'watering',
        frequencyDays: 7,
        lastCareAt: daysFromNow(-2),
        nextCareAt: daysFromNow(5),
      },
      {
        careType: 'fertilization',
        frequencyDays: 21,
        lastCareAt: daysFromNow(-22),
        nextCareAt: daysFromNow(-1), // Yesterday (overdue)
      },
    ],
  },
  {
    name: 'Peace Lily',
    description: 'Elegant flowering plant with white blooms',
    category: 'Flowering',
    imageUrl:
      'https://images.unsplash.com/photo-1567465645848-b765281eca3c?w=400',
    humidityRating: 4,
    lightingRating: 2,
    petToxicityRating: 4,
    wateringRating: 4,
    health: 'HEALTHY',
    schedules: [
      {
        careType: 'watering',
        frequencyDays: 5,
        lastCareAt: daysFromNow(-2),
        nextCareAt: daysFromNow(3),
      },
      {
        careType: 'fertilization',
        frequencyDays: 30,
        lastCareAt: daysFromNow(-28),
        nextCareAt: daysFromNow(2), // In 2 days (this week)
      },
    ],
  },
  {
    name: 'Spider Plant',
    description: 'Air-purifying plant with arching leaves',
    category: 'Grass',
    imageUrl:
      'https://images.unsplash.com/photo-1763690792636-b13187f67bd7?w=400',
    humidityRating: 3,
    lightingRating: 3,
    petToxicityRating: 1,
    wateringRating: 3,
    health: 'HEALTHY',
    schedules: [
      {
        careType: 'watering',
        frequencyDays: 7,
        lastCareAt: daysFromNow(-4),
        nextCareAt: daysFromNow(3),
      },
    ],
  },
  {
    name: 'Rubber Plant',
    description: 'Bold foliage plant with glossy leaves',
    category: 'Tree',
    imageUrl:
      'https://images.unsplash.com/photo-1616138984641-ae05293798c6?w=400',
    humidityRating: 3,
    lightingRating: 3,
    petToxicityRating: 3,
    wateringRating: 3,
    health: 'HEALTHY',
    schedules: [
      {
        careType: 'watering',
        frequencyDays: 10,
        lastCareAt: daysFromNow(-3),
        nextCareAt: daysFromNow(7),
      },
    ],
  },
  // Plants needing attention (2)
  {
    name: 'Orchid',
    description: 'Elegant flowering orchid',
    category: 'Flowering',
    imageUrl:
      'https://images.unsplash.com/photo-1639374593182-88b49b80a688?w=400',
    humidityRating: 5,
    lightingRating: 3,
    petToxicityRating: 1,
    wateringRating: 3,
    health: 'NEEDS_ATTENTION',
    schedules: [
      {
        careType: 'watering',
        frequencyDays: 7,
        lastCareAt: daysFromNow(-10),
        nextCareAt: daysFromNow(-3),
      },
    ],
  },
  {
    name: 'Calathea',
    description: 'Prayer plant with decorative leaves',
    category: 'Tropical',
    imageUrl:
      'https://images.unsplash.com/photo-1580018550304-def91943abdd?w=400',
    humidityRating: 5,
    lightingRating: 2,
    petToxicityRating: 1,
    wateringRating: 4,
    health: 'NEEDS_ATTENTION',
    schedules: [
      {
        careType: 'watering',
        frequencyDays: 5,
        lastCareAt: daysFromNow(-8),
        nextCareAt: daysFromNow(-3),
      },
    ],
  },
]

const LILY_PLANTS: DemoPlantData[] = [
  {
    name: 'Bird of Paradise',
    description: 'Dramatic tropical plant with large paddle-shaped leaves',
    category: 'Tropical',
    imageUrl:
      'https://images.unsplash.com/photo-1767106323400-c99aeb793cee?w=400',
    humidityRating: 4,
    lightingRating: 5,
    petToxicityRating: 3,
    wateringRating: 3,
    health: 'THRIVING',
    isFavorite: true,
    schedules: [
      {
        careType: 'watering',
        frequencyDays: 7,
        lastCareAt: daysFromNow(-3),
        nextCareAt: daysFromNow(4),
      },
      {
        careType: 'fertilization',
        frequencyDays: 30,
        lastCareAt: daysFromNow(-10),
        nextCareAt: daysFromNow(20),
      },
    ],
  },
  {
    name: 'Heartleaf Philodendron',
    description: 'Fast-growing vine with glossy heart-shaped leaves',
    category: 'Vine',
    imageUrl:
      'https://images.unsplash.com/photo-1771814121130-a06205709279?w=400',
    humidityRating: 3,
    lightingRating: 2,
    petToxicityRating: 3,
    wateringRating: 3,
    health: 'HEALTHY',
    isFavorite: true,
    schedules: [
      {
        careType: 'watering',
        frequencyDays: 7,
        lastCareAt: daysFromNow(-5),
        nextCareAt: daysFromNow(2),
      },
    ],
  },
  {
    name: 'Jade Plant',
    description: 'Long-lived succulent with thick oval leaves, symbol of luck',
    category: 'Succulent',
    imageUrl:
      'https://images.unsplash.com/photo-1741817068110-f44ef1f169be?w=400',
    humidityRating: 2,
    lightingRating: 4,
    petToxicityRating: 3,
    wateringRating: 2,
    health: 'HEALTHY',
    schedules: [
      {
        careType: 'watering',
        frequencyDays: 14,
        lastCareAt: daysFromNow(-7),
        nextCareAt: daysFromNow(7),
      },
      {
        careType: 'fertilization',
        frequencyDays: 60,
        lastCareAt: daysFromNow(-30),
        nextCareAt: daysFromNow(30),
      },
    ],
  },
  {
    name: 'Lavender',
    description: 'Fragrant herb with calming purple flower spikes',
    category: 'Herb',
    imageUrl:
      'https://images.unsplash.com/photo-1765418145389-15cd5a5de9a3?w=400',
    humidityRating: 2,
    lightingRating: 5,
    petToxicityRating: 2,
    wateringRating: 2,
    health: 'HEALTHY',
    schedules: [
      {
        careType: 'watering',
        frequencyDays: 10,
        lastCareAt: daysFromNow(-2),
        nextCareAt: daysFromNow(8),
      },
    ],
  },
  {
    name: 'String of Pearls',
    description: 'Trailing succulent with bead-like spherical leaves',
    category: 'Succulent',
    imageUrl:
      'https://images.unsplash.com/photo-1765041425888-39e09e148a80?w=400',
    humidityRating: 2,
    lightingRating: 4,
    petToxicityRating: 3,
    wateringRating: 2,
    health: 'NEEDS_ATTENTION',
    schedules: [
      {
        careType: 'watering',
        frequencyDays: 14,
        lastCareAt: daysFromNow(-18),
        nextCareAt: daysFromNow(-4),
      },
    ],
  },
  {
    name: 'Hoya',
    description: 'Waxy vine with clusters of star-shaped flowers',
    category: 'Vine',
    imageUrl:
      'https://images.unsplash.com/photo-1769346442881-b63ba7476b77?w=400',
    humidityRating: 3,
    lightingRating: 3,
    petToxicityRating: 1,
    wateringRating: 2,
    health: 'THRIVING',
    isFavorite: true,
    schedules: [
      {
        careType: 'watering',
        frequencyDays: 10,
        lastCareAt: daysFromNow(-4),
        nextCareAt: daysFromNow(6),
      },
      {
        careType: 'fertilization',
        frequencyDays: 30,
        lastCareAt: daysFromNow(-5),
        nextCareAt: daysFromNow(25),
      },
    ],
  },
]

const seedDemoData = Effect.gen(function* () {
  const db = yield* PgDrizzle.PgDrizzle

  yield* Console.log('Seeding demo data for visual testing...')

  // Wipe existing data for this user
  yield* Console.log('Wiping existing data for antoine@lily.app...')
  const existingUsers = yield* db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, 'antoine@lily.app'))
  const existingUser = A.head(existingUsers)
  if (Option.isSome(existingUser)) {
    const userId = existingUser.value.id
    const existingPlants = yield* db
      .select({ id: plants.id })
      .from(plants)
      .where(eq(plants.userId, userId))
    for (const plant of existingPlants) {
      yield* db.delete(careLogs).where(eq(careLogs.plantId, plant.id))
      yield* db
        .delete(plantCareSchedules)
        .where(eq(plantCareSchedules.plantId, plant.id))
    }
    yield* db.delete(plants).where(eq(plants.userId, userId))
    yield* Console.log('  Wiped existing plants, care logs, and schedules')
  } else {
    yield* Console.log('  No existing data found')
  }

  // Create demo user Alex
  yield* Console.log('Creating demo user Alex...')
  const demoUserResult = yield* db
    .insert(users)
    .values({
      email: 'antoine@lily.app',
      name: 'Alex',
      image:
        'https://images.unsplash.com/photo-1624224416603-c908080780b1?w=400&h=400&fit=crop&crop=face',
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
        image:
          'https://images.unsplash.com/photo-1624224416603-c908080780b1?w=400&h=400&fit=crop&crop=face',
        updatedAt: new Date(),
      },
    })
    .returning()

  const user = getFirst(demoUserResult)
  yield* Console.log(`  Created user: ${user.name} (${user.email})`)
  yield* Console.log(`  User ID: ${user.id}`)

  // Create plants with care schedules
  yield* Console.log('Creating 12 demo plants...')
  const createdPlants: Array<{ id: string; name: string }> = []

  for (const plantData of DEMO_PLANTS) {
    const { schedules, ...plantFields } = plantData
    const result = yield* db
      .insert(plants)
      .values({
        ...plantFields,
        userId: user.id,
        dateAdded: Option.getOrElse(
          Option.fromNullable(plantData.dateAdded),
          () => new Date()
        ),
      })
      .returning({ id: plants.id, name: plants.name })

    const plant = getFirst(result)
    createdPlants.push(plant)

    // Create care schedules for this plant
    for (const schedule of schedules) {
      yield* db.insert(plantCareSchedules).values({
        plantId: plant.id,
        careType: schedule.careType,
        frequencyDays: schedule.frequencyDays,
        lastCareAt: schedule.lastCareAt,
        nextCareAt: schedule.nextCareAt,
      })
    }
    yield* Console.log(
      `  Created plant: ${plant.name} (${schedules.length} schedules)`
    )
  }

  // Create comprehensive care log history for testing various scenarios
  yield* Console.log('Creating comprehensive care log history...')

  // Helper to create date in the past
  const daysAgo = (days: number) =>
    new Date(Date.now() - days * 24 * 60 * 60 * 1000)
  const hoursAgo = (hours: number) =>
    new Date(Date.now() - hours * 60 * 60 * 1000)

  // Snake Plant - Long history, infrequent watering (succulent)
  const snakePlantOption = A.findFirst(
    createdPlants,
    (p) => p.name === 'Snake Plant'
  )
  if (Option.isSome(snakePlantOption)) {
    const snakePlant = snakePlantOption.value
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
  const pothosOption = A.findFirst(createdPlants, (p) => p.name === 'Pothos')
  if (Option.isSome(pothosOption)) {
    const pothos = pothosOption.value
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
  const fernOption = A.findFirst(createdPlants, (p) => p.name === 'Fern')
  if (Option.isSome(fernOption)) {
    const fern = fernOption.value
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
  const fiddleLeafFigOption = A.findFirst(
    createdPlants,
    (p) => p.name === 'Fiddle Leaf Fig'
  )
  if (Option.isSome(fiddleLeafFigOption)) {
    const fiddleLeafFig = fiddleLeafFigOption.value
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
  const cactusOption = A.findFirst(createdPlants, (p) => p.name === 'Cactus')
  if (Option.isSome(cactusOption)) {
    const cactus = cactusOption.value
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
  const aloeVeraOption = A.findFirst(
    createdPlants,
    (p) => p.name === 'Aloe Vera'
  )
  if (Option.isSome(aloeVeraOption)) {
    const aloeVera = aloeVeraOption.value
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
  const monsteraOption = A.findFirst(
    createdPlants,
    (p) => p.name === 'Monstera'
  )
  if (Option.isSome(monsteraOption)) {
    const monstera = monsteraOption.value
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
  const peaceLilyOption = A.findFirst(
    createdPlants,
    (p) => p.name === 'Peace Lily'
  )
  if (Option.isSome(peaceLilyOption)) {
    const peaceLily = peaceLilyOption.value
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
  const spiderPlantOption = A.findFirst(
    createdPlants,
    (p) => p.name === 'Spider Plant'
  )
  if (Option.isSome(spiderPlantOption)) {
    const spiderPlant = spiderPlantOption.value
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
  const rubberPlantOption = A.findFirst(
    createdPlants,
    (p) => p.name === 'Rubber Plant'
  )
  if (Option.isSome(rubberPlantOption)) {
    const rubberPlant = rubberPlantOption.value
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
  const orchidOption = A.findFirst(createdPlants, (p) => p.name === 'Orchid')
  if (Option.isSome(orchidOption)) {
    const orchid = orchidOption.value
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
  const calatheaOption = A.findFirst(
    createdPlants,
    (p) => p.name === 'Calathea'
  )
  if (Option.isSome(calatheaOption)) {
    const calathea = calatheaOption.value
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

  // ----------------------------------------------------------------
  // Lily user (lily@lily.app) — follow data demo
  // ----------------------------------------------------------------
  yield* Console.log('')
  yield* Console.log('Setting up Lily user (lily@lily.app)...')

  // Wipe Lily's existing plants/care logs
  const existingLilyUsers = yield* db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, 'lily@lily.app'))
  const existingLilyUser = A.head(existingLilyUsers)
  if (Option.isSome(existingLilyUser)) {
    const lilyId = existingLilyUser.value.id
    const lilyPlants = yield* db
      .select({ id: plants.id })
      .from(plants)
      .where(eq(plants.userId, lilyId))
    for (const plant of lilyPlants) {
      yield* db.delete(careLogs).where(eq(careLogs.plantId, plant.id))
      yield* db
        .delete(plantCareSchedules)
        .where(eq(plantCareSchedules.plantId, plant.id))
    }
    yield* db.delete(plants).where(eq(plants.userId, lilyId))
    yield* Console.log('  Wiped existing Lily plants, care logs, and schedules')
  }

  // Upsert Lily
  const lilyResult = yield* db
    .insert(users)
    .values({
      email: 'lily@lily.app',
      name: 'Lily',
      image:
        'https://images.unsplash.com/photo-1758598304332-94b40ce7c7b4?w=400&h=400&fit=crop&crop=face',
      bio: 'Plant enthusiast 🌿 Growing a little jungle at home.',
      emailVerified: true,
      role: 'user',
      status: 'active',
      publicProfile: true,
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
        name: 'Lily',
        image:
          'https://images.unsplash.com/photo-1758598304332-94b40ce7c7b4?w=400&h=400&fit=crop&crop=face',
        updatedAt: new Date(),
      },
    })
    .returning()

  const lily = getFirst(lilyResult)
  yield* Console.log(`  Upserted user: ${lily.name} (${lily.email})`)

  // Insert Lily's plants with care schedules
  yield* Console.log('  Creating 6 plants for Lily...')
  const lilyCreatedPlants: Array<{ id: string; name: string }> = []
  for (const plantData of LILY_PLANTS) {
    const { schedules, ...plantFields } = plantData
    const result = yield* db
      .insert(plants)
      .values({ ...plantFields, userId: lily.id, dateAdded: new Date() })
      .returning({ id: plants.id, name: plants.name })
    const plant = getFirst(result)
    lilyCreatedPlants.push(plant)

    // Create care schedules for this plant
    for (const schedule of schedules) {
      yield* db.insert(plantCareSchedules).values({
        plantId: plant.id,
        careType: schedule.careType,
        frequencyDays: schedule.frequencyDays,
        lastCareAt: schedule.lastCareAt,
        nextCareAt: schedule.nextCareAt,
      })
    }
    yield* Console.log(
      `    Created plant: ${plant.name} (${schedules.length} schedules)`
    )
  }

  // Care logs for Lily's plants
  yield* Console.log('  Creating care logs for Lily...')
  const daysAgoL = (d: number) => new Date(Date.now() - d * 24 * 60 * 60 * 1000)

  for (const plant of lilyCreatedPlants) {
    yield* db.insert(careLogs).values([
      { type: 'watering', plantId: plant.id, date: daysAgoL(3) },
      { type: 'watering', plantId: plant.id, date: daysAgoL(13) },
      { type: 'watering', plantId: plant.id, date: daysAgoL(23) },
      { type: 'fertilization', plantId: plant.id, date: daysAgoL(30) },
    ])
  }
  yield* Console.log(
    `  Created ${lilyCreatedPlants.length * 4} care logs for Lily`
  )

  // ----------------------------------------------------------------
  // Follow relationships — wipe then re-create
  // ----------------------------------------------------------------
  yield* Console.log('')
  yield* Console.log('Creating follow relationships...')
  yield* db
    .delete(userFollows)
    .where(
      or(
        and(
          eq(userFollows.followerId, user.id),
          eq(userFollows.followingId, lily.id)
        ),
        and(
          eq(userFollows.followerId, lily.id),
          eq(userFollows.followingId, user.id)
        )
      )
    )
  yield* db.insert(userFollows).values([
    { followerId: user.id, followingId: lily.id },
    { followerId: lily.id, followingId: user.id },
  ])
  yield* Console.log('  Alex follows Lily ✓')
  yield* Console.log('  Lily follows Alex ✓')

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
  yield* Console.log('  Lily (lily@lily.app): 6 plants, follows Alex')
  yield* Console.log('')
  yield* Console.log('Login:')
  yield* Console.log('  Alex: antoine@lily.app')
  yield* Console.log('  Lily: lily@lily.app')
})

const program = seedDemoData.pipe(Effect.provide(DrizzleLive))

Effect.runPromise(program)
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Error seeding demo data:', error)
    process.exit(1)
  })
