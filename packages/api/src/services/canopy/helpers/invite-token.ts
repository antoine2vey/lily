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

const TOKEN_BYTES = 32

export const hashInviteToken = (token: string): string =>
  createHash('sha256').update(token).digest('hex')

export const newInviteToken: Effect.Effect<{
  readonly token: string
  readonly tokenHash: string
}> = Effect.sync(() => {
  const token = randomBytes(TOKEN_BYTES).toString('base64url')
  return { token, tokenHash: hashInviteToken(token) }
})

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
