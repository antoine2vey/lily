import { CanopyRepository } from '@lily/api/repositories/canopy.repository'
import { CurrentUser } from '@lily/api/services/auth/middleware.types'
import { newInviteToken } from '@lily/api/services/canopy/helpers/invite-token'
import { lockMyCanopy } from '@lily/api/services/canopy/helpers/membership'
import {
  CANOPY_INVITE_TTL_DAYS,
  CANOPY_JOIN_URL_PREFIX,
  type CanopyInvite,
} from '@lily/shared'
import { DateTime, Effect } from 'effect'
import * as SqlClient from 'effect/sql/SqlClient'

/**
 * Any member makes a link valid for 7 days. A new link revokes the previous
 * one. The token is returned once; only its hash is stored.
 */
export const createCanopyInvite = Effect.fn('CanopyService.createCanopyInvite')(
  function* () {
    const { id: userId } = yield* CurrentUser
    const repo = yield* CanopyRepository
    const sql = yield* SqlClient.SqlClient
    const { token, tokenHash } = yield* newInviteToken
    const expiresAt = DateTime.toDateUtc(
      DateTime.add(DateTime.nowUnsafe(), { days: CANOPY_INVITE_TTL_DAYS })
    )

    yield* sql.withTransaction(
      Effect.gen(function* () {
        const { canopy } = yield* lockMyCanopy(userId)
        yield* repo.replaceInvite({
          canopyId: canopy.id,
          tokenHash,
          createdByUserId: userId,
          expiresAt,
        })
      })
    )

    return {
      url: `${CANOPY_JOIN_URL_PREFIX}${token}`,
      expiresAt,
    } satisfies CanopyInvite
  }
)
