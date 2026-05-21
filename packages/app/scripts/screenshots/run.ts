#!/usr/bin/env bun
import { spawn } from 'node:child_process'
import * as path from 'node:path'
import { Array, Console, Data, Effect, pipe } from 'effect'
import { composeOne } from './compose'
import {
  LOCALES,
  type Locale,
  PLATFORMS,
  type Platform,
  SCREENS,
  type Screen,
} from './copy'

class MaestroError extends Data.TaggedError('MaestroError')<{
  readonly exitCode: number | null
  readonly stderr: string
}> {}

class MissingToolError extends Data.TaggedError('MissingToolError')<{
  readonly tool: string
  readonly hint: string
}> {}

const PACKAGE_ROOT = path.resolve(import.meta.dirname, '../..')
const FLOW_PATH = path.join(PACKAGE_ROOT, '.maestro/capture.yaml')

const runCmd = (
  cmd: string,
  args: ReadonlyArray<string>,
  env: Record<string, string> = {}
): Effect.Effect<string, MaestroError | MissingToolError> =>
  Effect.async<string, MaestroError | MissingToolError>((resume) => {
    const child = spawn(cmd, [...args], {
      env: { ...process.env, ...env },
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (d) => {
      stdout += String(d)
      process.stdout.write(String(d))
    })
    child.stderr.on('data', (d) => {
      stderr += String(d)
      process.stderr.write(String(d))
    })
    child.on('error', (err) => {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
        resume(
          Effect.fail(
            new MissingToolError({
              tool: cmd,
              hint:
                cmd === 'maestro'
                  ? 'Install with: curl -Ls "https://get.maestro.mobile.dev" | bash'
                  : `Ensure \`${cmd}\` is on PATH`,
            })
          )
        )
        return
      }
      resume(
        Effect.fail(new MaestroError({ exitCode: null, stderr: String(err) }))
      )
    })
    child.on('close', (code) => {
      if (code === 0) resume(Effect.succeed(stdout))
      else resume(Effect.fail(new MaestroError({ exitCode: code, stderr })))
    })
  })

// Nothing locale-derived needed here — the flow selects languages by
// testID (`language-option-en` / `language-option-fr`), and the locale
// code itself is just the Locale enum value.

const outputSourceDir = (platform: Platform, locale: Locale) =>
  path.join(PACKAGE_ROOT, 'screenshots/sources', platform, locale)

const outputFinalDir = (platform: Platform, locale: Locale) =>
  path.join(PACKAGE_ROOT, 'screenshots/output', platform, locale)

// Maestro's default driver startup timeout is 30s. First-run overhead
// can blow past that on both platforms:
//   - iOS: 60-120s to compile + sideload the XCTest runner bundle
//   - Android: 2-5 min on a cold emulator — boot + adb connect +
//     Maestro's test APK install + accessibility service registration
// 360s (6 min) covers both comfortably. User override wins if they've
// set their own MAESTRO_DRIVER_STARTUP_TIMEOUT.
const DEFAULT_DRIVER_STARTUP_TIMEOUT_MS = '360000'

// Reseed Aloe Vera's chat in the given locale so the chat screenshot
// shows correctly-localized bubbles. Scoped to just this plant's
// chat_messages — plants, rooms, careLogs, etc. are untouched.
const reseedChatFor = (locale: Locale) =>
  Effect.gen(function* () {
    yield* Console.log(`  🗨  Reseeding chat in ${locale}`)
    yield* runCmd(
      'bun',
      ['run', '--cwd', path.resolve(PACKAGE_ROOT, '../db'), 'seed:demo-chat'],
      { LOCALE: locale }
    )
  })

const captureFor = (platform: Platform, locale: Locale) =>
  Effect.gen(function* () {
    yield* Console.log(`\n▶ Capturing ${platform}/${locale}`)

    // Localize chat before Maestro reads it. Maestro's auth flow logs
    // in fresh each pass, so React Query fetches chat from scratch —
    // no caching layer hides the new content.
    yield* reseedChatFor(locale)

    const outputDir = outputSourceDir(platform, locale)

    // Android emulator's NAT'd loopback to the host is 10.0.2.2, not
    // localhost. iOS sim shares host network so localhost works directly.
    // METRO_URL can be overridden in the shell for LAN setups (e.g. a
    // physical device that needs the host's LAN IP).
    const defaultMetroUrl =
      platform === 'android' ? 'http://10.0.2.2:8081' : 'http://localhost:8081'
    const metroUrl = process.env.METRO_URL ?? defaultMetroUrl

    const args = [
      'test',
      FLOW_PATH,
      '--env',
      `LOCALE_CODE=${locale}`,
      '--env',
      `OUTPUT_DIR=${outputDir}`,
      '--env',
      `METRO_URL=${metroUrl}`,
    ]

    const env: Record<string, string> = {
      MAESTRO_DRIVER_STARTUP_TIMEOUT:
        process.env.MAESTRO_DRIVER_STARTUP_TIMEOUT ??
        DEFAULT_DRIVER_STARTUP_TIMEOUT_MS,
      MAESTRO_CLI_ANALYSIS_NOTIFICATION_DISABLED: 'true',
    }

    yield* runCmd('maestro', args, env)
  })

const composeFor = (platform: Platform, locale: Locale) =>
  Effect.gen(function* () {
    yield* Console.log(`\n🎨 Composing ${platform}/${locale}`)
    const sourceDir = outputSourceDir(platform, locale)
    const finalDir = outputFinalDir(platform, locale)

    yield* pipe(
      SCREENS,
      Array.map((screen: Screen) =>
        composeOne({
          screen,
          locale,
          platform,
          sourcePath: path.join(sourceDir, `${screen}.png`),
          outputPath: path.join(finalDir, `${screen}.png`),
        }).pipe(
          Effect.tap((out) =>
            Console.log(`  ✓ ${path.relative(PACKAGE_ROOT, out)}`)
          ),
          Effect.catchTag('SourceMissingError', (e) =>
            Console.warn(
              `  ⚠ skipped ${screen} — source missing: ${path.relative(PACKAGE_ROOT, e.sourcePath)}`
            )
          )
        )
      ),
      Effect.all
    )
  })

const parseArgs = (argv: ReadonlyArray<string>) => {
  const flags = new Set(argv)
  return {
    skipCapture: flags.has('--no-capture'),
    skipCompose: flags.has('--no-compose'),
    platforms: flags.has('--ios')
      ? (['ios'] as const)
      : flags.has('--android')
        ? (['android'] as const)
        : PLATFORMS,
    locales: flags.has('--en')
      ? (['en'] as const)
      : flags.has('--fr')
        ? (['fr'] as const)
        : LOCALES,
  }
}

const program = Effect.gen(function* () {
  const { skipCapture, skipCompose, platforms, locales } = parseArgs(
    process.argv.slice(2)
  )

  yield* Console.log(
    `Lily screenshot pipeline — platforms=${platforms.join(',')} locales=${locales.join(',')}`
  )

  const combos = pipe(
    platforms,
    Array.flatMap((p) => locales.map((l): [Platform, Locale] => [p, l]))
  )

  if (!skipCapture) {
    for (const [platform, locale] of combos) {
      yield* captureFor(platform, locale)
    }
  } else {
    yield* Console.log('Skipping capture (--no-capture)')
  }

  if (!skipCompose) {
    for (const [platform, locale] of combos) {
      yield* composeFor(platform, locale)
    }
  } else {
    yield* Console.log('Skipping compose (--no-compose)')
  }

  yield* Console.log('\n✅ Done.')
})

const exit1 = Effect.sync(() => process.exit(1))

const handled = program.pipe(
  Effect.catchTags({
    MissingToolError: (e) =>
      Console.error(`\n✗ Missing tool: ${e.tool}\n  ${e.hint}`).pipe(
        Effect.zipRight(exit1)
      ),
    MaestroError: (e) =>
      Console.error(
        `\n✗ Maestro failed (exit=${e.exitCode}). See stderr above.`
      ).pipe(Effect.zipRight(exit1)),
    ComposeError: (e) =>
      Console.error(
        `\n✗ Compose failed for ${e.sourcePath}: ${String(e.cause)}`
      ).pipe(Effect.zipRight(exit1)),
  })
)

Effect.runPromise(handled)
