#!/usr/bin/env bun
/**
 * Seed an Apple App Store reviewer test account with demo data.
 * Usage: APPLE_REVIEWER_EMAIL=reviewer@example.com bun run seed:apple-reviewer
 *
 * Run once against production before App Store submission. The reviewer logs in
 * via magic-link instant login, so the SAME email must be present in the
 * `REVIEWER_EMAILS` allowlist on the target environment.
 *
 * The reviewer email is read from `APPLE_REVIEWER_EMAIL` (never hardcoded, so it
 * is not published in the repo) and a fresh random magic-link token is generated
 * on every run. Remove the email from `REVIEWER_EMAILS` once review is complete.
 *
 * Shared seeding logic lives in ./seed-reviewer.ts
 */

import { DrizzleLive } from '@lily/db'
import { Config, Effect } from 'effect'
import { seedReviewer } from './seed-reviewer'

const program = Effect.gen(function* () {
  const email = yield* Config.nonEmptyString('APPLE_REVIEWER_EMAIL').pipe(
    Config.withDefault('apple-reviewer@example.com')
  )

  return yield* seedReviewer({
    label: 'Apple',
    email,
    username: 'AppleReviewer',
    token: crypto.randomUUID(),
    store: 'APP_STORE',
    productId: 'lily_monthly',
    consoleHint: 'App Store Connect',
  })
}).pipe(Effect.provide(DrizzleLive))

Effect.runPromise(program)
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Error seeding Apple reviewer account:', error)
    process.exit(1)
  })
