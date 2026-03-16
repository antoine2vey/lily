import { HttpApiBuilder, HttpServerResponse } from '@effect/platform'
import type { Api } from '@lily/api/api'
import { getCurrentUser } from '@lily/api/services/auth/endpoints/get-current-user'
import { logout } from '@lily/api/services/auth/endpoints/logout'
import { magicLinkCallback } from '@lily/api/services/auth/endpoints/magic-link-callback'
import { refreshToken } from '@lily/api/services/auth/endpoints/refresh-token'
import { sendMagicLink } from '@lily/api/services/auth/endpoints/send-magic-link'
import { setUsername } from '@lily/api/services/auth/endpoints/set-username'
import { verifyMagicLink } from '@lily/api/services/auth/endpoints/verify-magic-link'
import { withInfraErrorsAsDefect } from '@lily/api/services/helpers/error-handling'
import { Effect } from 'effect'

export const AuthApiLive = (api: Api) =>
  HttpApiBuilder.group(api, 'auth', (handlers) =>
    handlers
      .handle('sendMagicLink', ({ payload }) =>
        sendMagicLink(payload).pipe(withInfraErrorsAsDefect)
      )
      .handle('magicLinkCallback', ({ urlParams }) =>
        Effect.gen(function* () {
          const result = yield* magicLinkCallback(urlParams)
          return HttpServerResponse.redirect(result.redirectUrl, {
            status: 302,
          })
        }).pipe(withInfraErrorsAsDefect)
      )
      .handle('verifyMagicLink', ({ payload }) =>
        verifyMagicLink(payload).pipe(withInfraErrorsAsDefect)
      )
      .handle('refreshToken', ({ payload }) =>
        refreshToken(payload).pipe(withInfraErrorsAsDefect)
      )
      .handle('getCurrentUser', () =>
        getCurrentUser().pipe(withInfraErrorsAsDefect)
      )
      .handle('logout', () => logout().pipe(withInfraErrorsAsDefect))
      .handle('setUsername', ({ payload }) =>
        setUsername(payload).pipe(withInfraErrorsAsDefect)
      )
  )
