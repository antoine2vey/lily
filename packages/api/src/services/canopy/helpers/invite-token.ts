import { createHash, randomBytes } from 'node:crypto'
import {
  type CanopyInviteRow,
  CanopyRepository,
} from '@lily/api/repositories/canopy.repository'
import {
  CanopyInviteExpiredError,
  CanopyInviteNotFoundError,
  isFuture,
} from '@lily/shared'
import { DateTime, Effect } from 'effect'
import type { SqlError } from 'effect/sql/SqlError'

export const hashInviteToken = (token: string): string =>
  createHash('sha256').update(token).digest('hex')

/** 32 random bytes in base64url; only the SHA-256 hash is stored. */
export const newInviteToken: Effect.Effect<{
  readonly token: string
  readonly tokenHash: string
}> = Effect.sync(() => {
  const token = randomBytes(32).toString('base64url')
  return { token, tokenHash: hashInviteToken(token) }
})

/** A revoked or unknown token is not found; a lapsed one is expired. */
export const findLiveInvite = (
  token: string
): Effect.Effect<
  CanopyInviteRow,
  CanopyInviteNotFoundError | CanopyInviteExpiredError | SqlError,
  CanopyRepository
> =>
  Effect.gen(function* () {
    const repo = yield* CanopyRepository
    const invite = yield* repo.findInviteByTokenHash(hashInviteToken(token))
    if (invite === null || invite.revokedAt !== null) {
      return yield* new CanopyInviteNotFoundError()
    }
    if (!isFuture(DateTime.makeUnsafe(invite.expiresAt))) {
      return yield* new CanopyInviteExpiredError()
    }
    return invite
  })
