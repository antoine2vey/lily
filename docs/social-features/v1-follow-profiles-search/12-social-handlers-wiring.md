# Task 12 — Social Handlers Wiring

[x] DONE

## Context

Depends on: Task 04 (SocialApi), Tasks 05–11 (all endpoint functions).
Wires all social endpoint functions into the HttpApiBuilder handler group and registers it in the main API.

## Files to create

- `packages/api/src/services/social/service.ts` — SocialService aggregator
- `packages/api/src/services/social/handlers.ts` — SocialApiLive handler group

## Files to modify

- `packages/api/src/api.ts` — add `.add(SocialApi.prefix('/api'))`
- `packages/api/src/index.ts` — add `Layer.provide(SocialApiLive(Api))` to ApiLive + add `FollowRepositoryLive` import

## Implementation

### `service.ts`

```typescript
import { Effect } from 'effect'
import { followUser } from '@lily/api/services/social/endpoints/follow-user'
import { unfollowUser } from '@lily/api/services/social/endpoints/unfollow-user'
import { getFollowers, getUserFollowers } from '@lily/api/services/social/endpoints/get-followers'
import { getFollowing, getUserFollowing } from '@lily/api/services/social/endpoints/get-following'
import { getPublicProfile } from '@lily/api/services/social/endpoints/get-public-profile'
import { searchUsers } from '@lily/api/services/social/endpoints/search-users'
import { getSuggestedUsers } from '@lily/api/services/social/endpoints/get-suggested-users'
import { sendNudge } from '@lily/api/services/social/endpoints/send-nudge'

export class SocialService extends Effect.Service<SocialService>()(
  'SocialService',
  {
    effect: Effect.succeed({
      followUser,
      unfollowUser,
      getFollowers,
      getUserFollowers,
      getFollowing,
      getUserFollowing,
      getPublicProfile,
      searchUsers,
      getSuggestedUsers,
      sendNudge,
    }),
  }
) {}
```

### `handlers.ts`

```typescript
import { HttpApiBuilder } from '@effect/platform'
import type { Api } from '@lily/api/api'
import { FollowRepositoryLive } from '@lily/api/repositories/follow.repository'
import { UserRepositoryLive } from '@lily/api/repositories/user.repository'
import { AuthenticationLive } from '@lily/api/services/auth/middleware.impl'
import { SocialService } from '@lily/api/services/social/service'
import { withInfraErrorsAsDefect } from '@lily/api/services/helpers/error-handling'
import { Effect, Layer } from 'effect'

export const SocialApiLive = (api: Api) =>
  HttpApiBuilder.group(api, 'social', (handlers) =>
    Effect.gen(function* () {
      const socialService = yield* SocialService

      return handlers
        .handle('followUser', ({ path: { userId } }) =>
          socialService.followUser(userId).pipe(withInfraErrorsAsDefect)
        )
        .handle('unfollowUser', ({ path: { userId } }) =>
          socialService.unfollowUser(userId).pipe(withInfraErrorsAsDefect)
        )
        .handle('getFollowers', ({ urlParams }) =>
          socialService.getFollowers(urlParams).pipe(withInfraErrorsAsDefect)
        )
        .handle('getFollowing', ({ urlParams }) =>
          socialService.getFollowing(urlParams).pipe(withInfraErrorsAsDefect)
        )
        .handle('getUserFollowers', ({ path: { userId }, urlParams }) =>
          socialService.getUserFollowers(userId, urlParams).pipe(withInfraErrorsAsDefect)
        )
        .handle('getUserFollowing', ({ path: { userId }, urlParams }) =>
          socialService.getUserFollowing(userId, urlParams).pipe(withInfraErrorsAsDefect)
        )
        .handle('getPublicProfile', ({ path: { userId } }) =>
          socialService.getPublicProfile(userId).pipe(withInfraErrorsAsDefect)
        )
        .handle('searchUsers', ({ urlParams }) =>
          socialService.searchUsers(urlParams).pipe(withInfraErrorsAsDefect)
        )
        .handle('getSuggestedUsers', () =>
          socialService.getSuggestedUsers.pipe(withInfraErrorsAsDefect)
        )
        .handle('sendNudge', ({ payload }) =>
          socialService.sendNudge(payload).pipe(withInfraErrorsAsDefect)
        )
    })
  ).pipe(
    Layer.provide(SocialService.Default),
    Layer.provide(FollowRepositoryLive),
    Layer.provide(UserRepositoryLive),
    Layer.provide(AuthenticationLive)
  )
```

### `api.ts` modification

Add to imports:
```typescript
import { SocialApi } from '@lily/api/services/social/api'
```

Add to Api definition:
```typescript
.add(SocialApi.prefix('/api'))
```

### `index.ts` modification

Add to imports:
```typescript
import { SocialApiLive } from '@lily/api/services/social/handlers'
```

Add to ApiLive:
```typescript
Layer.provide(SocialApiLive(Api)),
```

## Reference

- Copy handler pattern from `packages/api/src/services/plants/handlers.ts`
- Copy service pattern from `packages/api/src/services/plants/service.ts`
- Copy wiring pattern from `packages/api/src/api.ts` and `packages/api/src/index.ts`

## Tests

No standalone tests — handler wiring verified by endpoint tests + typecheck.

## Review checklist

After implementing, run these agents before committing:
1. **Code review agent** — check for bugs, logic errors, adherence to project conventions (Effect patterns, no native JS methods, etc.)
2. **Security agent** — check for injection vulnerabilities, auth bypass, data leakage, OWASP top 10
3. **Scalability check** — review DB queries for N+1, missing indexes, pagination correctness
4. **Code quality agent** — simplify, remove duplication, ensure consistency with existing codebase

## Verify

```bash
cd packages/api && bun run typecheck
cd packages/api && bun run test
```

## Commit

```
feat(social): wire social handlers and register SocialApi in main API
```
