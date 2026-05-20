import { OAuthVerificationError } from '@lily/api/services/oauth-verifier/errors'
import {
  type IOAuthVerifierService,
  type OAuthIdentity,
  OAuthVerifierService,
} from '@lily/api/services/oauth-verifier/service'
import { Effect, Layer } from 'effect'

export interface MockVerifierOptions {
  apple?: OAuthIdentity | (() => OAuthIdentity)
  google?: OAuthIdentity | (() => OAuthIdentity)
  failApple?: string
  failGoogle?: string
}

const resolve = (v: OAuthIdentity | (() => OAuthIdentity)): OAuthIdentity =>
  typeof v === 'function' ? v() : v

export const createMockOAuthVerifier = (
  options: MockVerifierOptions = {}
): Layer.Layer<OAuthVerifierService> => {
  const repo: IOAuthVerifierService = {
    verifyApple: () =>
      options.failApple
        ? Effect.fail(
            new OAuthVerificationError({
              provider: 'apple',
              message: options.failApple,
            })
          )
        : options.apple
          ? Effect.succeed(resolve(options.apple))
          : Effect.fail(
              new OAuthVerificationError({
                provider: 'apple',
                message: 'no fixture',
              })
            ),
    verifyGoogle: () =>
      options.failGoogle
        ? Effect.fail(
            new OAuthVerificationError({
              provider: 'google',
              message: options.failGoogle,
            })
          )
        : options.google
          ? Effect.succeed(resolve(options.google))
          : Effect.fail(
              new OAuthVerificationError({
                provider: 'google',
                message: 'no fixture',
              })
            ),
  }
  return Layer.succeed(OAuthVerifierService, repo)
}
