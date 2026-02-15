# Task 13 — Follow Notification

[x] DONE

## Context

Depends on: Task 05 (followUser endpoint), Task 12 (wiring).
Adds a push notification when someone follows you. Uses the existing event bus + notification system.

## Files to create

None.

## Files to modify

- `packages/shared/src/services/event-bus/types.ts` — add `UserFollowedEvent` to the AppEvent union
- `packages/api/src/services/social/endpoints/follow-user.ts` — publish `UserFollowed` event after successful follow
- `packages/api/src/services/achievements/checker.ts` — add handler for `UserFollowed` event (optional: if there are follow-related achievements, otherwise skip)

## Implementation

### New event type

Add to `packages/shared/src/services/event-bus/types.ts`:

```typescript
export const UserFollowedEvent = Schema.Struct({
  _tag: Schema.Literal('UserFollowed'),
  followerId: Schema.String,
  followingId: Schema.String,
})
export type UserFollowedEvent = typeof UserFollowedEvent.Type
```

Add `UserFollowedEvent` to the `AppEvent` union:
```typescript
export const AppEvent = Schema.Union(
  // ... existing events
  UserFollowedEvent
)
```

Export the type:
```typescript
export type UserFollowedEvent = typeof UserFollowedEvent.Type
```

### Publish event in follow-user.ts

After the successful `followRepo.follow()` call:

```typescript
const eventBus = yield* EventBus
yield* publishWithRetry(eventBus, {
  _tag: 'UserFollowed',
  followerId: currentUserId,
  followingId: targetUserId,
})
```

Add `EventBus` to the endpoint's requirements.

### Push notification

The notification can be handled in two ways:
1. **Achievement checker subscriber** — listen for `UserFollowed` and create a notification
2. **Inline in the endpoint** — create a notification directly

Recommended: **Option 2 (inline)** for simplicity, using the existing notification repo:

```typescript
// After follow + event publish:
yield* notificationRepo.create({
  userId: targetUserId, // notify the person being followed
  type: 'new_follower',
  title: 'New follower',
  body: `${currentUserName} started following you`,
  scheduledAt: new Date(),
})
```

The existing notification scheduler + worker will pick this up and send the push via Expo.

### Add `EventBus` and `NotificationRepository` to follow-user.ts dependencies

Update the Effect requirements to include `EventBus` and `NotificationRepository`.

### Update handlers.ts layers

Add to `SocialApiLive` layers:
```typescript
Layer.provide(RedisEventBusFullLive),
Layer.provide(NotificationRepositoryLive),
```

## Reference

- Copy event pattern from `packages/shared/src/services/event-bus/types.ts` (existing events)
- Copy notification creation from `packages/api/src/services/notification-scheduler/scheduler.ts`
- Copy `publishWithRetry` usage from `packages/api/src/services/plants/endpoints/create-plant.ts`

## Tests

Update `follow-user.test.ts`:
```
it('should publish UserFollowed event on successful follow')
it('should create a notification for the followed user')
```

## Review checklist

After implementing, run these agents before committing:
1. **Code review agent** — check for bugs, logic errors, adherence to project conventions (Effect patterns, no native JS methods, etc.)
2. **Security agent** — check for injection vulnerabilities, auth bypass, data leakage, OWASP top 10
3. **Scalability check** — review DB queries for N+1, missing indexes, pagination correctness
4. **Code quality agent** — simplify, remove duplication, ensure consistency with existing codebase

## Verify

```bash
cd packages/api && bun run test follow-user
cd packages/shared && bun run typecheck
```

## Commit

```
feat(social): add UserFollowed event and new follower push notification
```
