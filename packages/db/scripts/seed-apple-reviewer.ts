#!/usr/bin/env bun
/**
 * Seed an Apple App Store reviewer test account with demo data.
 * Usage: bun run seed:apple-reviewer
 *
 * Run once against production before App Store submission. The reviewer logs in
 * via magic-link instant login — ensure the email is in REVIEWER_EMAILS.
 *
 * Shared seeding logic lives in ./seed-reviewer.ts
 */

import { DrizzleLive } from '@lily/db'
import { Effect } from 'effect'
import { seedReviewer } from './seed-reviewer'

const program = seedReviewer({
  label: 'Apple',
  email: 'apple-reviewer@withlily.app',
  username: 'AppleReviewer',
  token: 'apple-review-2024-lily-app',
  store: 'APP_STORE',
  productId: 'lily_monthly',
  consoleHint: 'App Store Connect',
}).pipe(Effect.provide(DrizzleLive))

Effect.runPromise(program)
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Error seeding Apple reviewer account:', error)
    process.exit(1)
  })
