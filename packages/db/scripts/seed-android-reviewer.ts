#!/usr/bin/env bun
/**
 * Seed a Google Play reviewer test account with demo data.
 * Usage: bun run seed:android-reviewer
 *
 * Run once against production before Play submission. The reviewer logs in via
 * magic-link instant login (no OAuth needed) — ensure the email is in
 * REVIEWER_EMAILS on the target environment.
 *
 * Provide these to Play Console → App content → "App access":
 *   Email: android-reviewer@withlily.app
 *   Instructions: enter the email on the sign-in screen to receive instant access.
 *
 * Shared seeding logic lives in ./seed-reviewer.ts
 */

import { DrizzleLive } from '@lily/db'
import { Effect } from 'effect'
import { seedReviewer } from './seed-reviewer'

const program = seedReviewer({
  label: 'Android',
  email: 'android-reviewer@withlily.app',
  username: 'AndroidReviewer',
  token: 'android-review-2026-lily-app',
  store: 'PLAY_STORE',
  productId: 'com.monthly.lilyapp.app',
  consoleHint: 'Play Console App access',
}).pipe(Effect.provide(DrizzleLive))

Effect.runPromise(program)
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Error seeding Android reviewer account:', error)
    process.exit(1)
  })
