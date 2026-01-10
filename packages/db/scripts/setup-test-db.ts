#!/usr/bin/env bun
/**
 * Setup script to initialize the test database schema
 * Usage: DATABASE_URL_TEST=... bun run db:setup-test
 *
 * This script:
 * 1. Pushes the schema to the test database
 * 2. Seeds the subscription tiers
 */

import * as PgDrizzle from '@effect/sql-drizzle/Pg'
import { PgClient } from '@effect/sql-pg'
import { subscriptionTiers } from '@lily/db/schema'
import { Config, Console, Effect, Layer } from 'effect'

// Test database configuration
const TestPgLive = PgClient.layerConfig({
  url: Config.redacted('DATABASE_URL_TEST'),
})

const TestDrizzleLive = PgDrizzle.layer.pipe(Layer.provide(TestPgLive))

const tiers = [
  {
    tier: 'free' as const,
    name: 'Free',
    priceMonthly: 0,
    maxPlants: 5,
    maxAiChatsMonthly: 10,
    maxCardScansMonthly: 5,
    maxPlantIdentifiesMonthly: 3,
  },
  {
    tier: 'paid' as const,
    name: 'Premium',
    priceMonthly: 299,
    maxPlants: null,
    maxAiChatsMonthly: null,
    maxCardScansMonthly: null,
    maxPlantIdentifiesMonthly: null,
  },
]

const seedTiers = Effect.gen(function* () {
  const db = yield* PgDrizzle.PgDrizzle

  yield* Console.log('Seeding subscription tiers to test database...')

  for (const tier of tiers) {
    yield* db
      .insert(subscriptionTiers)
      .values(tier)
      .onConflictDoUpdate({
        target: subscriptionTiers.tier,
        set: {
          name: tier.name,
          priceMonthly: tier.priceMonthly,
          maxPlants: tier.maxPlants,
          maxAiChatsMonthly: tier.maxAiChatsMonthly,
          maxCardScansMonthly: tier.maxCardScansMonthly,
          maxPlantIdentifiesMonthly: tier.maxPlantIdentifiesMonthly,
          updatedAt: new Date(),
        },
      })

    yield* Console.log(`  ✓ ${tier.name} tier seeded`)
  }

  yield* Console.log('Test database setup complete!')
})

const program = seedTiers.pipe(Effect.provide(TestDrizzleLive))

Effect.runPromise(program)
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Error setting up test database:', error)
    process.exit(1)
  })
