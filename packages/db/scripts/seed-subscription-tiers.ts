#!/usr/bin/env bun
/**
 * Seed script to populate subscription tier configuration
 * Usage: bun run seed:tiers
 *
 * This script seeds the subscription_tiers table with free and paid tier configs.
 */

import * as PgDrizzle from '@effect/sql-drizzle/Pg'
import { DrizzleLive } from '@lily/db'
import { subscriptionTiers } from '@lily/db/schema'
import { Console, Effect } from 'effect'

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
    priceMonthly: 299, // $2.99 in cents
    maxPlants: null, // unlimited
    maxAiChatsMonthly: null, // unlimited
    maxCardScansMonthly: null, // unlimited
    maxPlantIdentifiesMonthly: null, // unlimited
  },
]

const seedTiers = Effect.gen(function* () {
  const db = yield* PgDrizzle.PgDrizzle

  yield* Console.log('Seeding subscription tiers...')

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

  yield* Console.log('Subscription tiers seeded successfully!')
})

const program = seedTiers.pipe(Effect.provide(DrizzleLive))

Effect.runPromise(program)
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Error seeding subscription tiers:', error)
    process.exit(1)
  })
