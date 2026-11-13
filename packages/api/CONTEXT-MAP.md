# Context map draft: `packages/api`

Status: draft from a read-only pass over the working tree of branch `antoine2vey/ddd-core-business-assessment` (2026-11-12). Updated the same day once the Reminders context was built: every row about reminder planning describes the built code.
Paths are relative to `packages/api/src/` unless they start with `packages/`.
"Inferred" marks a judgement. Everything else comes from a file read or a grep.

Method for sections 1, 2 and 4: a script resolved every `const x = yield* SomeRepository` binding under `services/` and `contexts/`, then listed each `x.method(` call. A method counts as a write when its name does not start with `find/get/count/list/has/is/exists/search`. `lock*` methods are listed separately as locks.

## Proposed contexts

| Context | Classification | One-line scope |
| --- | --- | --- |
| **Care** | core | Plants, rooms, care schedules, care history, care plans, weather adjustment. Glossary: `packages/api/CONTEXT.md`. Already has `contexts/care`. |
| **Reminders** | core | Which care reminders exist, for whom and when. Built in `contexts/reminders`. Other contexts call `Reminders.request`, and the plan is rebuilt after their commit. Glossary: `packages/api/CONTEXT.md`. |
| **Notifications** | core (inferred: delivery is how the main loop reaches the user) | Delivery of every notification, inbox, device tokens, push, Live Activity. It moves reminder rows through their statuses and never plans one. |
| **Canopy** | core (inferred) | Shared household: membership, invites, mutes, plant hand-back. |
| **Delegation** | supporting | Temporary caretaker for a set of plants. Vacation is placed here provisionally (see open question 3). |
| **Identity & Access** | generic | Magic link, OAuth sign-in, JWT, refresh tokens, user profile and settings, username, account deletion. |
| **Billing** | supporting | Subscriptions, tiers, limits, usage quotas, gift codes, RevenueCat webhook. Code name: `subscriptions`. |
| **Assistant** | core (inferred: paid differentiator) | AI chat, diagnosis, RAG retrieval, knowledge ingestion. |
| **Engagement** | supporting | Achievements, nudging pushes, daily tips, weekly recap. |
| **Social** | supporting | Follows, public profile, nudges between users. |
| **Weather** | supporting | Weather providers, cache, snapshots. The adjustment rule itself belongs to Care (`packages/api/CONTEXT.md:38`). |
| **Content** | generic | Blog post generation. |
| **Admin & Ops** | generic | Back-office endpoints, analytics snapshots, alerting, health probes. |
| *Platform* | generic (not a bounded context) | `event-bus`, `message-queue`, `email`, `rate-limiter`, `jwt`, `helpers`, `ai` model access. |

## 1. Service modules

All 55 directories under `services/` (`ls`), in directory order. "Repos" is every repository class named in the module (grep count in brackets where it helps).

| Module | What it does | Context | Class | Repositories used |
| --- | --- | --- | --- | --- |
| `account-cleanup` | Daily hard delete of users past the deletion grace period (`scheduler.ts:13-25`). | Identity & Access | generic | User |
| `achievement-scheduler` | 12-hourly reconciliation of threshold achievements (`scheduler.ts:82,119`). | Engagement | supporting | Achievement |
| `achievements` | List and unlock achievements; EventBus subscriber `checker.ts`; SSE notifier. | Engagement | supporting | Achievement |
| `activity-push-tokens` | Register Live Activity start and activity tokens, end an activity. | Notifications | core | ActivityPushToken, DeviceToken |
| `activity-scheduler` | Expire stale Live Activity tokens, end orphaned activities every 5 min. | Notifications | core | ActivityPushToken |
| `admin` | Back office: users, roles, gifts, gift codes, prompt preview, user overview. | Admin & Ops | generic | User, Subscription, GiftCode, Chat, Plant, CareLog, DeviceToken, CareSchedule, Notification, Canopy, ActivityPushToken, Room, Achievement, Delegation |
| `admin-analytics` | Read analytics metrics for the dashboard. | Admin & Ops | generic | Analytics |
| `ai` | Model access (`AiService`, `models.ts`). | Platform | generic | none |
| `ai-chat` | Conversations, streamed chat, tools that create diagnoses and care plans. | Assistant | core | Chat, CarePlan, Diagnosis, Plant, CareSchedule, CareLog, User, Delegation, Canopy |
| `alerting` | Ops alerts to Discord or console, with dedup. | Admin & Ops | generic | none |
| `analytics-scheduler` | 6-hourly precomputed metrics (`scheduler.ts:6-11`). | Admin & Ops | generic | Analytics |
| `auth` | Magic link, OAuth sign-in, refresh, logout, set username; auth middleware. | Identity & Access | generic | User, MagicLink, RefreshToken, OAuthIdentity |
| `blog-generator` | Hourly pipeline that researches, writes and publishes blog posts. | Content | generic | BlogPost, PlantCatalog |
| `canopy` | Create, update, dissolve, leave a canopy; invites and invitations; remove member. | Canopy | core | Canopy, User, Notification, Plant, Delegation, CareSchedule |
| `care-logs` | CRUD on care logs, recent activity. Publishes care events. | Care | core | CareLog, Plant, Notification |
| `care-plans` | List, accept, dismiss, delete care plans; complete and uncomplete steps. | Care | core | CarePlan, Plant, CareSchedule, User, Notification, Canopy, Weather, Delegation, CareLog |
| `care-tasks` | One read endpoint: due cares for the caller, through `CareReads`. | Care | core | User, CareLog, Canopy, Plant |
| `delegation` | Create, respond, cancel, complete delegations; delegated tasks. | Delegation | supporting | Delegation, User, Plant |
| `delegation-scheduler` | Activate and complete delegations on their dates every 5 min. | Delegation | supporting | Delegation, User |
| `device-tokens` | Register and unregister Expo push tokens. | Notifications | core | DeviceToken |
| `diagnosis` | One read endpoint: diagnoses of a plant. Writes happen in `ai-chat`. | Assistant | core | Diagnosis |
| `email` | Email provider (Resend or console), magic-link mail. | Platform | generic | none |
| `engagement-scheduler` | Inactivity, photo, milestone, streak, anniversary and trial-ending pushes. | Engagement | supporting | Engagement, Notification, CareLog, Achievement |
| `event-bus` | Redis and in-memory EventBus providers. | Platform | generic | none |
| `health` | Liveness and readiness probes (`api.ts`: `live`, `ready`, `check`). Not plant health. | Admin & Ops | generic | none (pings `PgDrizzle`, `handlers.ts:41`) |
| `health-scheduler` | Empty directory. `scheduler.ts` is deleted in the working tree (`git status`: ` D`). | none | n/a | none |
| `helpers` | `createScheduler`, error helpers, `schedule-notification.ts` (record and dispatch a notification). | Platform; `schedule-notification.ts` is Notifications (inferred) | generic | Notification |
| `internal` | Service-to-service token issue and magic-link send, own middleware. | Identity & Access | generic | User, MagicLink, RefreshToken |
| `jwt` | JWT signing and verification. | Platform (used by Identity) | generic | none |
| `knowledge` | One endpoint: `queryKnowledge` over the RAG store. | Assistant | supporting | none |
| `knowledge-ingestion` | Ingest jobs, adapters, processor, 30-second worker. | Assistant | supporting | IngestJob, ProcessedChunk, RawDocument, DeadLetter |
| `live-activity` | EventBus subscriber that updates or ends the Live Activity card. | Notifications | core | ActivityPushToken, Plant |
| `message-queue` | Redis list provider for `MessageQueue`. | Platform | generic | none |
| `notification-scheduler` | Claims pending notifications, gates and renders them, enqueues; worker delivers pushes. | Notifications | core | Notification, User, Plant, DeadLetter, DeviceToken, ActivityPushToken |
| `notifications` | Inbox endpoints; `timezone-scheduler.ts` computes send time and DND. | Notifications | core | Notification |
| `oauth-verifier` | Verifies third-party OAuth identity tokens. | Identity & Access | generic | none |
| `overdue-scheduler` | Hourly overdue digest per recipient. The pass is `remindOverdue` in `contexts/reminders` (`scheduler.ts:150`). The module supplies the plan caps and the overflow push. | Reminders | core | User, Subscription, Canopy |
| `plant-catalog` | One read endpoint over the species catalog. | Care (inferred; reference data) | supporting | PlantCatalog, User |
| `plants` | Plant CRUD, death and revival, photos, scan and AI identify, perform care, correct care dates, share, unshare, mute. | Care | core | Plant, Canopy, Notification, Delegation, CareSchedule, User, CareLog, Room, Scan, Weather, CarePlan |
| `push` | Expo and APNs providers, receipts store, token retirement. | Notifications | generic | DeviceToken |
| `push-receipt-scheduler` | Reads Expo push receipts every 15 min. | Notifications | generic | none |
| `rag` | Embedding and retrieval service over the knowledge DB. | Assistant | supporting | ProcessedChunk |
| `rate-limiter` | DB-backed rate limits; writes `rate_limits` directly (`service.ts:79,118`). | Platform | generic | none |
| `reminders-audit` | Daily pass that gives dead-lettered Reminders events another round and replans every plant with a care due soon, reporting what it had to change (`scheduler.ts:15,23`). | Reminders | core | none (calls `contexts/reminders`) |
| `rooms` | Room CRUD for a user or a canopy. | Care (inferred) | supporting | Room, Canopy |
| `social` | Follow, unfollow, profiles, search, suggestions, nudge. | Social | supporting | Follow, User |
| `subscriptions` | Current subscription, tiers, gift-code redemption, RevenueCat webhook, limits, usage, nightly reconciliation. | Billing | supporting | Subscription, GiftCode, Notification, User, Canopy, Achievement |
| `tips-scheduler` | Generates the daily tip with RAG and sends it. | Engagement | supporting | DailyTip, Notification, Engagement |
| `user` | Settings, avatar, account deletion. | Identity & Access | generic | User, CareLog, Notification, Delegation, Plant, RefreshToken, DeviceToken, CareSchedule, Canopy |
| `username` | Username availability and claim. | Identity & Access | generic | User |
| `vacation` | Get, set, cancel a vacation; activate and end helpers. | Delegation (provisional) | supporting | User, Notification, Plant, Delegation, CareSchedule, Canopy |
| `vacation-scheduler` | Activates and ends vacations on their dates every 5 min. | Delegation (provisional) | supporting | User |
| `weather` | Weather endpoint, care-adjustment endpoint, providers, cache, algorithm. | Weather; `algorithm*` and `get-care-adjustments.ts` are Care (inferred) | supporting | Weather, User, Plant, CareSchedule |
| `weather-scheduler` | Hourly weather fetch and snapshot cleanup (`scheduler.ts`); `readjust-care-schedules.ts` moves watering due days. | Weather; `readjust-care-schedules.ts` is Care (inferred) | supporting | User, Plant, Canopy, CareSchedule, Weather, Notification, Delegation |
| `weekly-recap-scheduler` | Sunday recap push. | Engagement | supporting | Engagement, Achievement |

`contexts/care` uses no repository. `CareReadsLive` queries `plantCareSchedules`, `plants`, `users`, `canopies`, `rooms` through `PgDrizzle` (`contexts/care/care-reads.ts:172-224`).

`contexts/reminders` reaches `notifications` only through `NotificationRepository` (`lockReminderPlants`, `findHoldersOfWaitingReminders`, `lockReminders`, `writeReminders`). It reads plants, users, canopies and delegations through their repositories, and due cares through `CareReads` (`contexts/reminders/store.ts`, `contexts/reminders/audience.ts`).

## 2. Repositories

31 repository files in `repositories/` (`packages/api/CLAUDE.md:13` says 24; stale). "Tables written" comes from `.insert/.update/.delete(<table>)` in the file. **MULTI** = write methods are called from more than one proposed context.

| Repository | Owner | Tables written | Other contexts calling it (r = read only, W = write) | Flag |
| --- | --- | --- | --- | --- |
| `achievement` | Engagement | `userAchievements`, **`users`** (`achievement.repository.ts:268`, `historyViewCount`) | Billing r (`subscriptions/limit-checker.ts:116` `countLivingPlants`), Admin r | writes an Identity table |
| `activity-push-token` | Notifications | `activityPushTokens` | Admin r | |
| `analytics` | Admin & Ops | `analytics_daily_snapshots` (raw SQL, `analytics.repository.ts:707`) | none | |
| `blog-post` | Content | `blogPosts` | none | |
| `canopy` | Canopy | `canopies`, `canopyMembers`, `canopyInvites`, `canopyDirectInvites`, `canopyPlantMutes`, **`plants`**, **`rooms`** | Care W (`plants/endpoints/mute-plant.ts:28,47`, `unshare-plant.ts:53`); r: Care, Assistant, Billing, Identity, Delegation(vacation), Notifications(overdue), Weather, Admin | **MULTI**; writes Care tables |
| `care-log` | Care | `careLogs` | r: Assistant, Engagement, Identity (`user`), Admin | |
| `care-plan` | Care | `carePlans`, `carePlanSteps` | Assistant W (`ai-chat/tools/create-diagnosis.ts:78`, `propose-care-plan.ts:39`, `persist-chat-completion.ts:234`) | **MULTI** |
| `care-schedule` | Care | none. The Care store writes `plantCareSchedules` (`contexts/care/store.ts`). | r: Assistant, Canopy, Reminders (overdue audience), Weather, Identity, Admin | |
| `chat` | Assistant | `chatConversations`, `chatMessages` | Admin r | |
| `daily-tip` | Engagement | `dailyTips` | none | |
| `dead-letter` | Platform (inferred) | `deadLetterMessages` | Notifications W (`notification-scheduler/worker.ts:585`), Assistant W (`knowledge-ingestion/processor.ts:152`) | **MULTI** |
| `delegation` | Delegation | `careDelegations`, `delegationPlants` | Identity W (`user/endpoints/delete-account.ts:27` `cancelOpenForUser`); Canopy lock (`canopy/helpers/leave-canopy.ts:119`); r: Care, Assistant, Weather, Admin | **MULTI** |
| `device-token` | Notifications | `deviceTokens` | Identity W (`user/endpoints/delete-account.ts:26`); Admin r | **MULTI** |
| `diagnosis` | Assistant | `diagnoses` | none (`diagnosis` module reads) | |
| `engagement` | Engagement | none (read model over `careLogs`, `notifications`, `plantCareSchedules`, `plantPhotos`, `plants`, `userSubscriptions`, `users`) | none | reads 5 contexts' tables |
| `follow` | Social | `userFollows`, `userNudges` | none | reads `plants`, `notifications` |
| `gift-code` | Billing | `giftCodes`, `giftCodeRedemptions` | Admin W (`admin/endpoints/create-gift-code.ts:33`, `update-gift-code.ts:62`, `delete-gift-code.ts:19`) | **MULTI** |
| `ingest-job` | Assistant | `ingestJobs` | none | |
| `magic-link` | Identity & Access | `magicLinks` | none (`auth`, `internal`) | |
| `notification` | Notifications. Rows of the five reminder types belong to Reminders. | `notifications` | Reminders W (`contexts/reminders/store.ts`, the only caller of `lockReminders` and `writeReminders`); deletes of other topics from Canopy (`canopy/helpers/membership.ts:106`, `canopy/helpers/plants-left-canopy.ts:19`), Identity (`user/endpoints/delete-account.ts:34`, `user/endpoints/update-user-settings.ts:112`) and Delegation(vacation) (`vacation/helpers/activate-vacation.ts:50`, `vacation/helpers/end-vacation.ts:111`); every caller of `helpers/schedule-notification.ts:64`; r: Engagement, Billing, Admin | **MULTI** |
| `oauth-identity` | Identity & Access | `oauthIdentities` | none | |
| `plant-catalog` | Care (inferred) | none (read only) | Content r (`blog-generator/topics.ts:75`) | |
| `plant` | Care | `plants`, `plantPhotos` | r: Assistant, Canopy, Delegation, Notifications, Weather, Identity, Admin. No write caller outside `services/plants`. | table also written by `canopy` repo |
| `processed-chunk` | Assistant | `processedChunks` | none | |
| `raw-document` | Assistant | `rawDocuments` | none | |
| `refresh-token` | Identity & Access | `refreshTokens` | none (`auth`, `internal`, `user`) | |
| `room` | Care (inferred) | `rooms` | Admin r | table also written by `canopy` repo (`canopy.repository.ts:782`) |
| `scan` | Care | `plantScans` | none | |
| `subscription` | Billing | `userSubscriptions`, `subscriptionEvents`, `subscriptionUsage`, `revenuecatWebhookEvents` | Admin W (`admin/endpoints/gift-subscription.ts:55`, `revoke-gift-subscription.ts:35`); Notifications r (`overdue-scheduler/scheduler.ts:220`) | **MULTI** |
| `user` | Identity & Access | `users` | Delegation(vacation) W (`vacation/endpoints/set-vacation.ts:71` `transitionVacation`); Admin W (`admin/endpoints/update-user.ts:36`, `update-role.ts:26`, `update-status.ts:26`, `delete-user.ts:41`); r: almost every context | **MULTI** |
| `weather` | Weather | `weatherSnapshots` | Care r (`plants`, `care-plans`) | |

**MULTI count: 9** (`canopy`, `care-plan`, `dead-letter`, `delegation`, `device-token`, `gift-code`, `notification`, `subscription`, `user`).

Writes that bypass repositories: `internal/endpoints/issue-service-token.ts:60` (`db.update(users)`), `rate-limiter/service.ts:79,118` (`rateLimits`).

## 3. The `plants` table, column by column

Schema: `packages/db/src/schema/plants.ts:23-82`. Every `.insert(plants)` / `.update(plants)` in `packages/api/src` (grep): `repositories/plant.repository.ts:716,728,752,774,794` and `repositories/canopy.repository.ts:792,819`. `follow.repository.ts:168` only reads.

Write paths, named once:

- **create**: `PlantRepository.create` (`plant.repository.ts:716`), called only from `services/plants/endpoints/create-plant.ts:62`.
- **update**: `PlantRepository.update` (`plant.repository.ts:728`), called only from `services/plants/endpoints/update-plant.ts:108`. The data is the request minus the four frequency fields, cast to `Record<string, unknown>` (`update-plant.ts:95-108`). So the writable set is `PlantUpdateRequest` (`packages/shared/src/domains/plant/schema.ts:131-148`), not `UpdatePlantData`.
- **markDead / revive**: `plant.repository.ts:752,774`, from `mark-plant-dead.ts:52` and `revive-plant.ts:72`.
- **moveTo**: `plant.repository.ts:794`, from `share-plant-with-canopy.ts:58` and `unshare-plant.ts:54`.
- **transferToUser**: `canopy.repository.ts:792`, from `services/canopy/helpers/dissolve-canopy.ts:37`.
- **returnToSharer**: `canopy.repository.ts:819`, from `services/canopy/helpers/dissolve-canopy.ts:35` and `services/canopy/helpers/return-shared-plants.ts:21`.

| Column | Proposed owner | Writers |
| --- | --- | --- |
| `id` | Care | create (DB default). |
| `name` | Care | create, update. |
| `description` | Care | create, update. |
| `imageUrl` | Care | create, update (GCS upload inside `update-plant.ts:78-90`). `upload-plant-photo.ts` writes `plantPhotos`, not this column. |
| `category` | Care | create, update. |
| `dateAdded` | Care | DB default only. `EnhancedPlantCreateRequest.plantingDate` exists (`schema.ts:155`) but is not passed to `repo.create` (`create-plant.ts:62-103`). |
| `updatedAt` | Care | update, moveTo, transferToUser, returnToSharer set it explicitly; Drizzle `$onUpdate` covers the rest (`plants.ts:36`). |
| `humidityRating`, `lightingRating`, `petToxicityRating`, `wateringRating` | Care | create, update. |
| `health` | Care (condition); Assistant is the intended writer per `packages/api/CONTEXT.md:59` | create only, constant `'HEALTHY'` (`create-plant.ts:92`). No update path: `PlantUpdateRequest` has no `health` key, and no `ai-chat` code calls a `PlantRepository` write. Migration `packages/db/drizzle/0070_health_is_derived.sql` rewrites `NEEDS_ATTENTION` rows to `HEALTHY`. See open question 1. |
| `remindersEnabled` | Notifications policy stored on a Care row (inferred) | No writer found. Accepted by `EnhancedPlantCreateRequest` (`schema.ts:166`) but absent from `CreatePlantData` (`plant.repository.ts:131-146`) and from `PlantUpdateRequest`. Column default `true`. Read by `contexts/care/care-reads.ts:201`, `care-schedule.repository.ts:206`, `overdue-scheduler/scheduler.ts:56`. |
| `isFavorite` | Care | update only (key in `PlantUpdateRequest`, `schema.ts:144`; not in the `UpdatePlantData` type). |
| `userId` | Care stores it; Canopy also writes it | create, moveTo, transferToUser, returnToSharer. FK `onDelete: cascade` from `users` (`plants.ts:46`): deleting a user deletes their plants. |
| `canopyId` | Care stores it; Canopy also writes it | create, moveTo, transferToUser, returnToSharer. Check `plants_one_owner` (`plants.ts:76-79`). |
| `createdByUserId` | Care (it is the "sharer" used by Canopy, `canopy.repository.ts:811`) | create. FK `onDelete: set null`. |
| `potWidthCm`, `potHeightCm` | Care | create, update. |
| `roomId` | Care | create, update, moveTo, returnToSharer (set to null). FK `onDelete: set null` from `rooms`. |
| `diedAt`, `deathCause`, `deathNote` | Care | markDead, revive. |

Findings:

- Two repositories write plant ownership: `PlantRepository.moveTo` (called by Care) and `CanopyRepository.transferToUser/returnToSharer` (called by Canopy).
- "Needs attention" is derived by `seePlantCare` (`contexts/care/plant-care.ts:49-52`) and applied in `plant.repository.ts:350,364,383`, `delegation.repository.ts:265`, `engagement.repository.ts:399`. The enum still lists `NEEDS_ATTENTION` (`packages/db/src/schema/enums.ts:27`).

## 4. Context relationships

Direction is "upstream -> downstream" for events, "caller -> callee" for calls.

| From -> To | Mechanism | Evidence |
| --- | --- | --- |
| Care -> Engagement | EventBus `CareLogCreated`, `PlantCreated`, `PhotoUploaded`, `PlantScanned`, `AttentionResponded`, `ReminderResponded`, `CareHistoryViewed`, `PlantShared` | publish `care-logs/endpoints/create-care-log.ts:58`; consume `achievements/checker.ts:235-245` |
| Care -> Notifications (Live Activity) | EventBus `CareLogCreated`, `PlantLifecycleChanged` | publish `plants/endpoints/mark-plant-dead.ts:69`; consume `live-activity/subscriber.ts:152,159` |
| Care -> Reminders | Outbox topic of Care events. Reminders replans the plant after `ScheduleChanged`, `CareRecorded` and `PlantLifeChanged`. | consume `contexts/reminders/consumers.ts:36-40`; which event makes what stale in `contexts/reminders/triggers.ts:17-30` |
| Care endpoints, Canopy, Delegation, Identity -> Reminders | `Reminders.request(Dirty)`: a row on the outbox topic `reminders`, written in the caller's transaction and planned after its commit by the `reminders-replan` consumer | `plants/endpoints/mark-plant-dead.ts:56`, `canopy/helpers/membership.ts:110`, `canopy/helpers/plants-left-canopy.ts:20`, `delegation/helpers/transition-delegation.ts:89`, `vacation/helpers/end-vacation.ts:115`, `user/endpoints/update-user-settings.ts:123`, `user/helpers/purge-account.ts:22` |
| Notifications, Reminders -> Care | `CareReads.due` (the only published Care read) | `notification-scheduler/dispatch-gate.ts:268`, `contexts/reminders/store.ts`, `contexts/reminders/overdue.ts` |
| Notifications -> Reminders | `Reminders.audienceOf`: who a plant's reminders are addressed to | `notification-scheduler/dispatch-gate.ts:281`, `live-activity/subscriber.ts:125` |
| Notifications -> Care | Direct `PlantRepository.findById` | `live-activity/subscriber.ts:121` |
| Notifications internal | MessageQueue: scheduler enqueues, worker delivers; messages `LiveActivityStart/Update/End` | `notification-scheduler/scheduler.ts:237`, `worker.ts:231` |
| Any context -> Notifications | `recordNotification` / `dispatchNow` helper (writes `notifications`, enqueues) | `helpers/schedule-notification.ts:33,130`; callers e.g. `social/endpoints/send-nudge.ts:66`, `delegation/endpoints/cancel-delegation.ts:72`, `subscriptions/usage-tracker.ts:155`, `engagement-scheduler/scheduler.ts:107` |
| Canopy -> Care | Writes `plants` and `rooms` inside `CanopyRepository` | `repositories/canopy.repository.ts:782,792,819` |
| Care -> Canopy | Direct `CanopyRepository` writes for mutes | `plants/endpoints/mute-plant.ts:28` |
| Care -> Canopy | Shared table join (`canopyMembers`, `canopyPlantMutes`) for visibility | `repositories/helpers/care-visibility.ts` (imports both tables) |
| Care -> Delegation | Shared table join on `careDelegations` | `repositories/plant.repository.ts:442` |
| Delegation -> Care | Shared table join on `plants` and `plantCareSchedules`; uses `seePlantCare` | `repositories/delegation.repository.ts:363-366,265` |
| Delegation(vacation) -> Care | `Care.moveDueDays` with reason `vacation` | `vacation/helpers/end-vacation.ts:97` |
| Delegation(vacation) -> Identity | Direct `UserRepository.transitionVacation` (vacation columns on `users`, `packages/db/src/schema/users.ts:82-86`) | `vacation/endpoints/set-vacation.ts:71` |
| Assistant -> Care | Direct `CarePlanRepository.create` | `ai-chat/tools/create-diagnosis.ts:78` |
| Assistant -> Care | Direct reads of schedules and care logs for the prompt | `ai-chat/plant-chat.ts:221-222` |
| Assistant -> Engagement | EventBus `ChatMessageSent`, `DiseaseIdentified` | `ai-chat/persist-chat-completion.ts:157,196` |
| Care -> Billing | `LimitChecker.checkPlantLimit` | `plants/endpoints/create-plant.ts:61` |
| Care, Assistant -> Billing | `UsageTracker.withReservation` | `plants/endpoints/ai-identify.ts:49`, `ai-chat/endpoints/stream-chat-message.ts:170` |
| Delegation -> Billing | `LimitChecker.checkDelegationAccess` | `delegation/endpoints/create-delegation.ts:35` |
| Billing -> Engagement | Direct `AchievementRepository.countLivingPlants` (a plant count kept in the achievements repo) | `subscriptions/limit-checker.ts:116` |
| Notifications -> Billing | Direct `SubscriptionRepository` reads | `overdue-scheduler/scheduler.ts:220-221` |
| Identity -> Canopy, Delegation, Notifications, Reminders | Account deletion calls each repository in turn, then asks Reminders for a replan | `user/endpoints/delete-account.ts:25-41` |
| Weather -> Care | `Care.moveDueDays` with reason `weather` | `weather-scheduler/readjust-care-schedules.ts:277` |
| Care -> Weather | Direct `WeatherRepository` reads and `weather/algorithm` | `care-plans` and `plants` (grep: `WeatherRepository` in both; `weather/algorithm` import in `plants`) |
| Social -> Engagement | EventBus `UserFollowed` (consumer ignores it) | `social/endpoints/follow-user.ts:76`, `achievements/checker.ts:246` |
| Engagement -> Care, Notifications, Billing, Identity | Shared table joins in one read repository | `repositories/engagement.repository.ts` (tables listed in section 2) |
| Engagement -> Assistant | `RagService.retrieve` | `tips-scheduler/generator.ts:69` |
| Engagement -> Identity | Writes `users.historyViewCount` | `repositories/achievement.repository.ts:268` |
| Content -> Care | Direct `PlantCatalogRepository` read | `blog-generator/topics.ts:75` |
| Admin -> Identity, Billing | Direct repository writes | `admin/endpoints/update-role.ts:26`, `admin/endpoints/gift-subscription.ts:55` |
| Admin -> all | Direct repository reads (14 repositories, section 1) | `admin/endpoints/get-user-overview.ts:27` |

Event notes:

- 13 event tags are defined in `packages/shared/src/services/event-bus/types.ts:5-77`.
- `RarePlantIdentified` has a consumer (`achievements/checker.ts:243`) and no publisher in `packages/api/src` (grep).
- Care events and replan requests do not use the EventBus. They are rows in the `outbox` table, written in the writer's transaction, delivered after commit, retried, then dead-lettered (`kernel/outbox.ts`, `kernel/transact.ts`).
- The EventBus is fire-and-forget (`packages/api/CLAUDE.md:34`); `activity-scheduler/scheduler.ts:34` is a safety net for dropped `CareLogCreated`.

## 5. Open questions

1. **Who sets a plant's condition?** The glossary says "A diagnosis sets it" (`packages/api/CONTEXT.md:59`). No code writes `plants.health` after creation (section 3). `ai-chat/tools/create-diagnosis.ts:76-78` creates a diagnosis and a care plan and never touches the plant. Either the rule is not implemented, or the glossary is ahead of the code.
2. **Reminder planning: decided.** It is a context of its own, `contexts/reminders`. Nothing outside it plans, locks or deletes a row of the five reminder types, and delivery only moves their status (`__tests__/architecture/context-boundaries.test.ts`). The glossary still lists reminders in rule 4 of Care (`CONTEXT.md:55`), which is where Care hands over to Reminders. `plants.remindersEnabled` has no writer.
3. **Vacation has no clear home.** State lives on `users` (`users.ts:82-86`), written through `UserRepository.transitionVacation`. Ending a vacation moves due days through `Care.moveDueDays` (`end-vacation.ts:97`), reads delegations (`:89-96`), deletes the muted notifications that are not reminders (`:111`) and asks Reminders for a replan (`:115`). Candidates: Identity (data), Care (effect), Delegation (same "I am away" intent and the scheduler mirrors the delegation scheduler, `vacation-scheduler/scheduler.ts:31`).
4. **Plant ownership is written by two contexts.** `PlantRepository.moveTo` (share/unshare, in `services/plants`) and `CanopyRepository.transferToUser/returnToSharer` (dissolve/leave) both set `plants.userId/canopyId`; the Canopy repo also re-homes `rooms` (`canopy.repository.ts:782`). The glossary defines Owner under Care (`CONTEXT.md:16`). Mutes go the other way: Care endpoints write `canopyPlantMutes`.
5. **Care plans straddle Care and Assistant.** The glossary lists care plans under Care but marks their rules "not decided" (`CONTEXT.md:9,64`). Assistant creates them and links chat messages (`create-diagnosis.ts:78`, `persist-chat-completion.ts:234`); Care completes steps, including as a side effect of a normal care (`CompletePlanStep` in `contexts/care/domain/decide.ts`).
6. **Weather adjustment split.** The rule is Care (`CONTEXT.md:38`), but the algorithm lives in `services/weather/algorithm*` and `services/weather-scheduler/readjust-care-schedules.ts:277` decides the move and hands it to `Care.moveDueDays`.
7. **Billing counts plants through the achievements repository** (`limit-checker.ts:116`). `countLivingPlants` is a Care fact kept in an Engagement repository.
8. **`AttentionResponded` still tests `plant.health === 'NEEDS_ATTENTION'`** (`care-logs/endpoints/create-care-log.ts:67`). It works only because the plant read derives the value (`plant.repository.ts:350`). The event is a Care fact phrased with a value that is no longer stored.
9. **Rooms and plant catalog.** Rooms are owned by a user or a canopy and only place plants; placed in Care by inference. The catalog is read-only reference data used by Care and Content.
10. **`EngagementRepository` and `AnalyticsRepository` are cross-context read models** over raw tables. They need a decision: published reads per context, or an accepted reporting exception.
11. **`dead-letter` is shared** by notification delivery and knowledge ingestion; treated as Platform by inference.
12. **Account deletion orchestrates five contexts** from `user/endpoints/delete-account.ts:25-41`. The hard delete (`user/helpers/purge-account.ts`, called by Admin and `account-cleanup`) wraps the same helper, `leaveCanopyAndDelete`. No event exists for it.
