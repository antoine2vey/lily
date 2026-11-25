import { MagicLinkRepository } from '@lily/api/repositories/magic-link.repository'
import { OAuthCodeRepository } from '@lily/api/repositories/oauth-code.repository'
import { RefreshTokenRepository } from '@lily/api/repositories/refresh-token.repository'
import { createScheduler } from '@lily/api/services/helpers/create-scheduler'
import { Effect } from 'effect'

export const deleteExpiredSignInRows = Effect.gen(function* () {
  const magicLinkRepo = yield* MagicLinkRepository
  const refreshTokenRepo = yield* RefreshTokenRepository
  const oauthCodeRepo = yield* OAuthCodeRepository

  const magicLinks = yield* magicLinkRepo.deleteExpired
  const refreshTokens = yield* refreshTokenRepo.deleteExpired
  const oauthCodes = yield* oauthCodeRepo.deleteExpired

  if (magicLinks + refreshTokens + oauthCodes > 0) {
    yield* Effect.log('Deleted expired sign-in rows', {
      magicLinks,
      refreshTokens,
      oauthCodes,
    })
  }
}).pipe(Effect.withSpan('auth-cleanup.deleteExpiredSignInRows'))

export const startAuthCleanupScheduler = createScheduler({
  name: 'auth-cleanup',
  interval: '1 hour',
  runOnStartup: true,
  task: deleteExpiredSignInRows,
})
