# Task 14 — Nudge Endpoint

[x] DONE

## Context

Depends on: Task 03 (FollowRepository with nudge tracking), Task 04 (SocialApi).
Implements `POST /api/social/nudge` — send a push notification to nudge a friend to water their plants.

## Files to create

- `packages/api/src/services/social/endpoints/send-nudge.ts` — endpoint function
- `packages/api/src/__tests__/services/social/send-nudge.test.ts` — tests

## Files to modify

None (already wired in Task 12 service/handlers).

## Implementation

### `send-nudge.ts`

```typescript
import { Effect } from 'effect'
import { CurrentUser } from '@lily/api/services/auth/middleware'
import { FollowRepository } from '@lily/api/repositories/follow.repository'
import { UserRepository } from '@lily/api/repositories/user.repository'
import { NotificationRepository } from '@lily/api/repositories/notification.repository'
import {
  NudgeNotAllowedError,
  NudgeRateLimitError,
} from '@lily/shared'
import { UserNotFoundError } from '@lily/shared'

export const sendNudge = (params: { targetUserId: string }) =>
  Effect.gen(function* () {
    const { id: currentUserId, name: currentUserName } = yield* CurrentUser
    const followRepo = yield* FollowRepository
    const userRepo = yield* UserRepository
    const notificationRepo = yield* NotificationRepository

    const { targetUserId } = params

    // Target must exist
    const targetUser = yield* userRepo.findById(targetUserId)
    if (!targetUser) {
      return yield* Effect.fail(new UserNotFoundError({ userId: targetUserId }))
    }

    // Must be following the target
    const isFollowing = yield* followRepo.isFollowing(currentUserId, targetUserId)
    if (!isFollowing) {
      return yield* Effect.fail(
        new NudgeNotAllowedError({
          message: 'You can only nudge users you follow',
        })
      )
    }

    // Rate limit: 1 nudge per user per day
    const lastNudge = yield* followRepo.getLastNudge(currentUserId, targetUserId)
    if (lastNudge) {
      const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000)
      if (lastNudge > oneDayAgo) {
        return yield* Effect.fail(
          new NudgeRateLimitError({
            message: 'You can only nudge this user once per day',
          })
        )
      }
    }

    // Record the nudge
    yield* followRepo.recordNudge(currentUserId, targetUserId)

    // Create push notification for target
    yield* notificationRepo.create({
      userId: targetUserId,
      type: 'nudge_to_water',
      title: 'Nudge from a friend',
      body: `${currentUserName ?? 'A friend'} is reminding you to check on your plants!`,
      scheduledAt: new Date(),
    })

    return { success: true }
  }).pipe(Effect.withSpan('SocialService.sendNudge'))
```

### Business rules

1. Target user must exist → 404
2. Must be following the target → 403 (`NudgeNotAllowedError`)
3. Rate limited: 1 nudge per (fromUser, toUser) pair per 24 hours → 429 (`NudgeRateLimitError`)
4. Creates a notification of type `nudge_to_water`
5. Notification body includes the nudger's name
6. Returns `{ success: true }` on success

### Nudge tracking

Uses the `user_nudges` table created in Task 01/03:
- `getLastNudge(fromUserId, toUserId)` — SELECT max(created_at) WHERE from_user_id = ? AND to_user_id = ?
- `recordNudge(fromUserId, toUserId)` — INSERT INTO user_nudges

## Reference

- Copy notification creation pattern from `packages/api/src/services/notification-scheduler/scheduler.ts`
- Copy rate limit checking from `packages/api/src/services/auth/endpoints/send-magic-link.ts` (rate limit pattern)

## Tests

### `send-nudge.test.ts`

```
describe('sendNudge', () => {
  it('should send nudge notification to followed user')
  it('should fail with UserNotFoundError for non-existent target')
  it('should fail with NudgeNotAllowedError when not following target')
  it('should fail with NudgeRateLimitError when nudged within last 24h')
  it('should allow nudge after 24h have passed')
  it('should create notification with type nudge_to_water')
  it('should include nudger name in notification body')
})
```

## Review checklist

After implementing, run these agents before committing:
1. **Code review agent** — check for bugs, logic errors, adherence to project conventions (Effect patterns, no native JS methods, etc.)
2. **Security agent** — check for injection vulnerabilities, auth bypass, data leakage, OWASP top 10
3. **Scalability check** — review DB queries for N+1, missing indexes, pagination correctness
4. **Code quality agent** — simplify, remove duplication, ensure consistency with existing codebase

## Verify

```bash
cd packages/api && bun run test send-nudge
```

## Commit

```
feat(social): add sendNudge endpoint with rate limiting and push notification
```
