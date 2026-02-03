#!/usr/bin/env bun
/**
 * Production seed script for subscription tiers using Bun's native SQL
 * This avoids drizzle-orm module resolution issues in production builds
 */

import { SQL } from 'bun'

const tiers = [
  {
    tier: 'free',
    name: 'Free',
    price_monthly: 0,
    max_plants: 5,
    max_ai_chats_monthly: 10,
    max_card_scans_monthly: 5,
    max_plant_identifies_monthly: 3,
  },
  {
    tier: 'paid',
    name: 'Premium',
    price_monthly: 299,
    max_plants: null,
    max_ai_chats_monthly: null,
    max_card_scans_monthly: null,
    max_plant_identifies_monthly: null,
  },
]

const seedTiers = async () => {
  const databaseUrl = process.env.DATABASE_URL

  if (!databaseUrl) {
    console.error('Error: DATABASE_URL environment variable is required')
    process.exit(1)
  }

  console.log('Connecting to database...')
  const sql = new SQL(databaseUrl)

  console.log('Seeding subscription tiers...')

  for (const tier of tiers) {
    await sql`
      INSERT INTO subscription_tiers (tier, name, price_monthly, max_plants, max_ai_chats_monthly, max_card_scans_monthly, max_plant_identifies_monthly)
      VALUES (${tier.tier}, ${tier.name}, ${tier.price_monthly}, ${tier.max_plants}, ${tier.max_ai_chats_monthly}, ${tier.max_card_scans_monthly}, ${tier.max_plant_identifies_monthly})
      ON CONFLICT (tier) DO UPDATE SET
        name = EXCLUDED.name,
        price_monthly = EXCLUDED.price_monthly,
        max_plants = EXCLUDED.max_plants,
        max_ai_chats_monthly = EXCLUDED.max_ai_chats_monthly,
        max_card_scans_monthly = EXCLUDED.max_card_scans_monthly,
        max_plant_identifies_monthly = EXCLUDED.max_plant_identifies_monthly,
        updated_at = NOW()
    `
    console.log(`  ✓ ${tier.name} tier seeded`)
  }

  console.log('Subscription tiers seeded successfully!')
  sql.close()
}

seedTiers()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Error seeding subscription tiers:', error)
    process.exit(1)
  })
