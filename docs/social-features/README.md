# Social Features — Master Plan

## Overview

Social features for Lily in two phases:

- **V1 (Free)**: Follow system, public profiles, user search/discovery, nudge friends
- **V2 (Paid)**: Care delegation (vacation mode — delegate plant care to another user)

## Master Checklist

### V1 — Follow, Profiles & Search

- [x] `v1-follow-profiles-search/01-db-follows-schema.md` — user_follows table + migration
- [x] `v1-follow-profiles-search/02-shared-social-types.md` — Shared schemas + errors for social
- [x] `v1-follow-profiles-search/03-follow-repository.md` — FollowRepository + Live impl
- [x] `v1-follow-profiles-search/04-social-api-definition.md` — HttpApiGroup + endpoint signatures
- [x] `v1-follow-profiles-search/05-follow-user-endpoint.md` — followUser + test
- [x] `v1-follow-profiles-search/06-unfollow-user-endpoint.md` — unfollowUser + test
- [x] `v1-follow-profiles-search/07-get-followers-endpoint.md` — getFollowers + test
- [x] `v1-follow-profiles-search/08-get-following-endpoint.md` — getFollowing + test
- [x] `v1-follow-profiles-search/09-public-profile-endpoint.md` — getPublicProfile + test
- [x] `v1-follow-profiles-search/10-search-users-endpoint.md` — searchUsers + test
- [x] `v1-follow-profiles-search/11-suggested-users-endpoint.md` — getSuggestedUsers + test
- [x] `v1-follow-profiles-search/12-social-handlers-wiring.md` — Wire handlers + register in api/index
- [x] `v1-follow-profiles-search/13-follow-notification.md` — Event + push for new follower
- [x] `v1-follow-profiles-search/14-nudge-endpoint.md` — sendNudge endpoint + push notification + test
- [x] `v1-follow-profiles-search/15-app-social-hooks.md` — All social hooks + query keys + error tags
- [ ] `v1-follow-profiles-search/16-user-search-screen.md` — UserSearchScreen
- [ ] `v1-follow-profiles-search/17-public-profile-screen.md` — PublicProfileScreen
- [ ] `v1-follow-profiles-search/18-followers-following-screens.md` — FollowersScreen + FollowingScreen
- [ ] `v1-follow-profiles-search/19-profile-screen-updates.md` — Add counts + Find Friends + nudge button
- [ ] `v1-follow-profiles-search/20-v1-smoke-test.md` — E2E verification

### V2 — Care Delegation

- [ ] `v2-care-delegation/01-db-delegation-schema.md` — care_delegations + delegation_plants + migration
- [ ] `v2-care-delegation/02-shared-delegation-types.md` — Shared schemas + errors
- [ ] `v2-care-delegation/03-delegation-repository.md` — DelegationRepository + Live impl
- [ ] `v2-care-delegation/04-delegation-api-definition.md` — HttpApiGroup + endpoint signatures
- [ ] `v2-care-delegation/05-create-delegation-endpoint.md` — createDelegation + test
- [ ] `v2-care-delegation/06-respond-delegation-endpoint.md` — respondToDelegation + test
- [ ] `v2-care-delegation/07-cancel-delegation-endpoint.md` — cancelDelegation + test
- [ ] `v2-care-delegation/08-complete-delegation-endpoint.md` — completeDelegation + test
- [ ] `v2-care-delegation/09-get-delegation-endpoint.md` — getDelegation + test
- [ ] `v2-care-delegation/10-get-my-delegations-endpoint.md` — getMyDelegations + test
- [ ] `v2-care-delegation/11-delegated-tasks-endpoint.md` — getDelegatedTasks + test
- [ ] `v2-care-delegation/12-limit-checker-gating.md` — checkDelegationAccess
- [ ] `v2-care-delegation/13-delegation-handlers-wiring.md` — Wire handlers + register
- [ ] `v2-care-delegation/14-delegation-scheduler.md` — Auto-transitions background job
- [ ] `v2-care-delegation/15-delegation-notifications.md` — 5 event types + push messages
- [ ] `v2-care-delegation/16-app-delegation-hooks.md` — All delegation hooks + query keys
- [ ] `v2-care-delegation/17-delegation-create-screen.md` — DelegationCreateScreen + pickers
- [ ] `v2-care-delegation/18-delegation-detail-screen.md` — DelegationDetailScreen
- [ ] `v2-care-delegation/19-delegation-list-screen.md` — DelegationListScreen
- [ ] `v2-care-delegation/20-care-screen-updates.md` — Delegated tasks section
- [ ] `v2-care-delegation/21-profile-delegation-entry.md` — Delegations menu item
- [ ] `v2-care-delegation/22-v2-smoke-test.md` — E2E verification

## Key Design Decisions

- **user_follows**: Simple insert/delete, no soft-delete status column
- **Nudge**: A followed user can send a push notification to nudge a friend with overdue plants. Rate-limited (1 nudge per user per day). New endpoint `POST /api/social/nudge` + new notification type `nudge_to_water`
- **Care delegation**: Only paid tier can create; accepting/being caretaker is free
- **No overlapping** active delegations for same plants
- **DelegationScheduler**: Auto-transitions `accepted->active` on startDate, `active->completed` on endDate
- **No DMs** — rely on delegation request messages for coordination
