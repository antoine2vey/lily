import { FollowRepository } from '@lily/api/repositories/follow.repository'
import { CurrentUser } from '@lily/api/services/auth/middleware.types'
import type { UserSearchParams } from '@lily/shared'
import { Effect } from 'effect'

export const searchUsers = (params: UserSearchParams) =>
  Effect.gen(function* () {
    yield* Effect.log('searchUsers params', params)
    const { id: currentUserId } = yield* CurrentUser
    const followRepo = yield* FollowRepository
    const page = parseInt(params.page, 10) || 1
    const limit = parseInt(params.limit, 10) || 20

    const { items, total } = yield* followRepo
      .searchUsers({
        query: params.query,
        currentUserId,
        page,
        limit,
      })
      .pipe(
        Effect.tapError((e) =>
          Effect.log('searchUsers DB error', {
            error: e,
            errorTag: (e as { _tag?: string })._tag,
            errorType: typeof e,
          })
        )
      )

    yield* Effect.log('searchUsers result', {
      total,
      page,
      limit,
      itemCount: items.length,
      items: JSON.stringify(items),
    })

    return {
      items,
      total,
      page,
      limit,
      hasMore: page * limit < total,
    }
  }).pipe(Effect.withSpan('SocialService.searchUsers'))
