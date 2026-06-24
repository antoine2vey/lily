#!/usr/bin/env bun
/**
 * Seed a Google Play reviewer test account with demo data.
 * Usage: ANDROID_REVIEWER_EMAIL=reviewer@example.com bun run seed:android-reviewer
 *
 * Run once against production before Play submission. The reviewer logs in via
 * magic-link instant login (no OAuth needed), so the SAME email must be present
 * in the `REVIEWER_EMAILS` allowlist on the target environment.
 *
 * Provide these to Play Console → App content → "App access":
 *   Email: the value of ANDROID_REVIEWER_EMAIL used below
 *   Instructions: enter the email on the sign-in screen to receive instant access.
 *
 * The reviewer email is read from `ANDROID_REVIEWER_EMAIL` (never hardcoded, so it
 * is not published in the repo) and a fresh random magic-link token is generated
 * on every run. Remove the email from `REVIEWER_EMAILS` once review is complete.
 *
 * Shared seeding logic lives in ./seed-reviewer.ts
 */

import { DrizzleLive } from '@lily/db'
import { Config, Effect } from 'effect'
import { seedReviewer } from './seed-reviewer'

const program = Effect.gen(function* () {
  const email = yield* Config.nonEmptyString('ANDROID_REVIEWER_EMAIL').pipe(
    Config.withDefault('android-reviewer@example.com')
  )

  return yield* seedReviewer({
    label: 'Android',
    email,
    username: 'AndroidReviewer',
    token: crypto.randomUUID(),
    store: 'PLAY_STORE',
    productId: 'com.monthly.lilyapp.app',
    consoleHint: 'Play Console App access',
  })
}).pipe(Effect.provide(DrizzleLive))

Effect.runPromise(program)
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Error seeding Android reviewer account:', error)
    process.exit(1)
  })
