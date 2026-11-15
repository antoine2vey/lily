# Context map of `packages/api`

This map gives every service module, repository and `plants` column of the api a bounded context, and lists how the contexts reach each other. Read it before you move code between modules or add a call that crosses a context. Paths start at `packages/api/` unless they start with `packages/`. "Inferred" marks a judgement, and every other cell comes from the code.

`src/__tests__/architecture/context-boundaries.test.ts` enforces the write, lock and import rules of the built contexts, Care, Reminders, Canopy and Absence. Where this map and that test disagree, the test is right and the map is stale. The terms are in [CONTEXT.md](CONTEXT.md), and the map of the whole repo is [the root CONTEXT-MAP.md](../../CONTEXT-MAP.md).

## Contexts

| Context | Classification | Scope |
| --- | --- | --- |
| **Care** | core | Plants and their life (plant, bury, revive, remove), rooms, care schedules, care history, care plans and the weather adjustment. Built in `src/contexts/care` as the services `Care`, `PlantLife` and `CarePlans` over one store, and the read `CareReads`. Reminders and the app hear of a change on the outbox topic `care`. Terms in `CONTEXT.md`, section Care. |
| **Reminders** | core | Which care reminders exist, for whom and when. Built in `src/contexts/reminders`. Other contexts call `Reminders.request`, and the plan is rebuilt after their commit. Terms in `CONTEXT.md`, section Reminders. |
| **Notifications** | core (inferred, because delivery is how the main loop reaches the user) | Delivery of every notification, the inbox, device tokens, push and the Live Activity. It moves reminder rows through their statuses and never plans one. |
| **Canopy** | core (inferred) | The shared household. Members, links, invitations and mutes, and every change of the owner of a plant or a room after insert. Built in `src/contexts/canopy`. A caller runs a command of the `Canopy` service, and Reminders hears of the change on the outbox topic `canopy`. Terms in `CONTEXT.md`, section Canopy. |
| **Absence** | supporting | The time a user cannot look after their plants. A delegation gives some personal plants a temporary caretaker, and a vacation mutes the user. Built in `src/contexts/absence`. A caller runs a command of the `Absence` service, and Reminders hears of a change of who is reminded on the outbox topic `absence`. Terms in `CONTEXT.md`, section Absence. |
| **Identity & Access** | generic | Magic link, OAuth sign-in, JWT, refresh tokens, user profile and settings, username and account deletion. |
| **Billing** | supporting | Subscriptions, tiers, limits, usage quotas, gift codes and the RevenueCat webhook. The code calls it `subscriptions`. |
| **Assistant** | core (inferred, because it is the paid differentiator) | AI chat, chat suggestions, diagnosis, RAG retrieval and knowledge ingestion. Terms for suggestions in `CONTEXT.md`, section Chat suggestions. |
| **Engagement** | supporting | Achievements, nudging pushes, daily tips and the weekly recap. |
| **Social** | supporting | Follows, public profiles and nudges between users. |
| **Weather** | supporting | Weather providers, the cache and snapshots. The adjustment rule itself belongs to Care (`CONTEXT.md`, term Weather adjustment). |
| **Content** | generic | Blog post generation. |
| **Admin & Ops** | generic | Back-office endpoints, analytics snapshots, alerting and health probes. |
| *Platform* | generic (not a bounded context) | `event-bus`, `message-queue`, `email`, `rate-limiter`, `jwt`, `helpers` and the `ai` model access. |

## 1. Service modules

One row per directory of `src/services/`, in directory order. "Repositories" names every repository class that the code of the module names, outside its tests.

| Module | What it does | Context | Class | Repositories |
| --- | --- | --- | --- | --- |
| `account-cleanup` | Daily hard delete of users past the deletion grace period (`cleanupExpiredAccounts`, through `purgeAccount`). | Identity & Access | generic | User |
| `achievement-scheduler` | Reconciles threshold achievements every 12 hours. | Engagement | supporting | Achievement |
| `achievements` | Lists and unlocks achievements. `src/services/achievements/checker.ts` is the EventBus subscriber, and `src/services/achievements/notifier.ts` pushes unlocks over SSE. | Engagement | supporting | Achievement |
| `activity-push-tokens` | Registers Live Activity start and activity tokens, and ends an activity. | Notifications | core | ActivityPushToken, DeviceToken |
| `activity-scheduler` | Every 5 minutes, expires stale Live Activity tokens and ends orphaned activities. | Notifications | core | ActivityPushToken |
| `admin` | Back office for users, roles, gifts, gift codes, the prompt preview and the user overview. | Admin & Ops | generic | User, Subscription, GiftCode, Chat, Plant, CareLog, DeviceToken, CareSchedule, Notification, Canopy, ActivityPushToken, Room, Achievement |
| `admin-analytics` | Reads analytics metrics for the dashboard. | Admin & Ops | generic | Analytics |
| `ai` | Model access (`AiService` in `src/services/ai/service.ts`, and `src/services/ai/models.ts`). | Platform | generic | none |
| `ai-chat` | Conversations, streamed chat, chat suggestions, the follow-up worker, and the tools that create diagnoses and propose care plans through the `CarePlans` service. | Assistant | core | Chat, ChatFollowUp, CarePlan, Diagnosis, Plant, CareSchedule, CareLog, User, Delegation, Canopy |
| `alerting` | Ops alerts to Discord or the console, with dedup. | Admin & Ops | generic | none |
| `analytics-scheduler` | Precomputes metrics every 6 hours. | Admin & Ops | generic | Analytics |
| `auth` | Magic link, OAuth sign-in, refresh, logout and set username, plus the auth middleware. | Identity & Access | generic | User, MagicLink, RefreshToken, OAuthIdentity |
| `blog-generator` | Hourly pipeline that researches, writes and publishes blog posts. | Content | generic | BlogPost, PlantCatalog |
| `canopy` | Endpoints over the `Canopy` service. They create, update, dissolve and leave a canopy, handle links and invitations, and remove a member. They read through `CanopyRepository` and write nothing themselves. | Canopy | core | Canopy |
| `care-logs` | Endpoints over the `Care` service that record, amend and remove a care. They read care logs and recent activity through `CareLogRepository` and write nothing themselves. `src/services/care-logs/endpoints/get-care-logs.ts` publishes `CareHistoryViewed`. | Care | core | CareLog |
| `care-plans` | Endpoints over the `CarePlans` service that accept, dismiss and delete a plan, and tick, untick and drop a step. They list plans through `CarePlanRepository` and write nothing themselves. | Care | core | CarePlan, Plant, Canopy |
| `care-tasks` | One read endpoint, the due cares of the caller, through `CareReads`. | Care | core | User, CareLog, Canopy, Plant |
| `delegation` | Endpoints over the `Absence` service that open, answer, cancel and complete a delegation, and list delegated tasks. They read through `DelegationRepository` and write nothing themselves. | Absence | supporting | Delegation |
| `delegation-scheduler` | Calls `Absence.advanceDelegations` at startup and every 5 minutes. It starts and completes delegations, and cancels a request still pending at its start. | Absence | supporting | none |
| `device-tokens` | Registers and unregisters Expo push tokens. | Notifications | core | DeviceToken |
| `diagnosis` | One read endpoint, the diagnoses of a plant. The writes happen in `ai-chat`. | Assistant | core | Diagnosis |
| `email` | Email provider (Resend or the console) and the magic-link mail. | Platform | generic | none |
| `engagement-scheduler` | Inactivity, photo, milestone, streak, anniversary and trial-ending pushes. | Engagement | supporting | Engagement, Notification, CareLog, Achievement |
| `event-bus` | Redis and in-memory EventBus providers. | Platform | generic | none |
| `health` | Liveness and readiness probes (`live`, `ready`, `check`). This is not plant health. | Admin & Ops | generic | none (`src/services/health/handlers.ts` pings `PgDrizzle`) |
| `helpers` | `createScheduler`, the error helpers and `src/services/helpers/schedule-notification.ts`, which records and dispatches a notification. | Platform. `src/services/helpers/schedule-notification.ts` is Notifications (inferred). | generic | Notification |
| `internal` | Service-to-service token issue and magic-link send, with its own middleware. | Identity & Access | generic | User, MagicLink, RefreshToken |
| `jwt` | JWT signing and verification. | Platform (used by Identity) | generic | none |
| `knowledge` | One endpoint, `queryKnowledge`, over the RAG store. | Assistant | supporting | none |
| `knowledge-ingestion` | Ingest jobs, adapters, the processor and a worker that runs every 30 seconds. | Assistant | supporting | IngestJob, ProcessedChunk, RawDocument, DeadLetter |
| `live-activity` | EventBus subscriber that updates or ends the Live Activity card. | Notifications | core | ActivityPushToken, Plant |
| `message-queue` | Redis list provider for `MessageQueue`. | Platform | generic | none |
| `notification-scheduler` | Claims pending notifications, gates and renders them, and enqueues them. The worker delivers the pushes. | Notifications | core | Notification, User, Plant, DeadLetter, DeviceToken, ActivityPushToken |
| `notifications` | Inbox endpoints. `src/services/notifications/timezone-scheduler.ts` computes the send time and do-not-disturb. | Notifications | core | Notification |
| `oauth-verifier` | Verifies third-party OAuth identity tokens. | Identity & Access | generic | none |
| `overdue-scheduler` | Hourly overdue digest per recipient. The pass is `remindOverdue` in `src/contexts/reminders`. The module supplies the plan caps and the overflow push. | Reminders | core | User, Subscription, Canopy, Notification |
| `plant-catalog` | One read endpoint over the species catalog. | Care (inferred, as reference data) | supporting | PlantCatalog, User |
| `plants` | Endpoints over `PlantLife` (create, mark dead, revive, delete) and `Care` (perform care, correct care dates, change frequencies). Plant details and photos go through `PlantRepository`. Scan and AI identify. Share, unshare and mute go through the `Canopy` service. | Care | core | Plant, Canopy, Delegation, Room, Scan, User |
| `push` | Expo and APNs providers, the receipts store and token retirement. | Notifications | generic | DeviceToken |
| `push-receipt-scheduler` | Reads Expo push receipts every 15 minutes. | Notifications | generic | none |
| `rag` | Embedding and retrieval service over the knowledge DB. | Assistant | supporting | ProcessedChunk |
| `rate-limiter` | DB-backed rate limits. `src/services/rate-limiter/service.ts` writes `rateLimits` itself. | Platform | generic | none |
| `reminders-audit` | Every hour, gives dead-lettered Reminders events another round (`redriveReminders`). Once a day, replans every plant with a care due soon and reports what it had to change (`repairDrift`). | Reminders | core | none (calls `src/contexts/reminders`) |
| `rooms` | Room CRUD for a user or a canopy. | Care (inferred) | supporting | Room, Canopy |
| `social` | Follow, unfollow, profiles, search, suggestions and nudge. | Social | supporting | Follow, User |
| `subscriptions` | Current subscription, tiers, gift-code redemption, the RevenueCat webhook, limits, usage and the nightly reconciliation. | Billing | supporting | Subscription, GiftCode, Notification, User, Canopy, Achievement |
| `tips-scheduler` | Generates the daily tip with RAG and sends it. | Engagement | supporting | DailyTip, Notification, Engagement |
| `user` | Settings, avatar and account deletion. | Identity & Access | generic | User, CareLog, Notification, RefreshToken, DeviceToken |
| `username` | Username availability and claim. | Identity & Access | generic | User |
| `vacation` | Endpoints over the `Absence` service that get, set and cancel a vacation. | Absence | supporting | User |
| `vacation-scheduler` | Calls `Absence.advanceVacations` at startup and every 5 minutes. It starts and ends vacations on their dates. | Absence | supporting | none |
| `weather` | Weather endpoint, care-adjustment endpoint, providers, cache and algorithm. | Weather. `src/services/weather/algorithm.ts`, `src/services/weather/algorithm/` and `src/services/weather/endpoints/get-care-adjustments.ts` are Care (inferred). | supporting | Weather, User, Plant, CareSchedule |
| `weather-scheduler` | Hourly weather fetch and snapshot cleanup. `src/services/weather-scheduler/readjust-care-schedules.ts` moves watering due days. | Weather. That file is Care (inferred). | supporting | User, Plant, Canopy, CareSchedule, Weather, Notification, Delegation |
| `weekly-recap-scheduler` | Sunday recap push. | Engagement | supporting | Engagement, Achievement |

`src/contexts/care` writes `careLogs`, `plantCareSchedules`, `carePlans`, `carePlanSteps` and, for the creation, the death, the revival and the removal of a plant, `plants`. It writes them through `PgDrizzle` in `src/contexts/care/store.ts` and nowhere else. The store takes every lock of a command in one order (`lockAndLoad`). `CareReadsLive` queries `plantCareSchedules`, `plants`, `users`, `canopies` and `rooms` through `PgDrizzle` (`src/contexts/care/care-reads.ts`). A due day and a care day come from the stored columns `due_day` and `care_day`, which are both `NOT NULL`. The context uses one repository, `WeatherRepository`, for the weather adjustment (`src/contexts/care/weather.ts`). It loads neither Canopy, Absence nor Reminders, directly or through another module.

`src/contexts/reminders` reaches `notifications` only through `NotificationRepository`. It reads plants, users, canopies, delegations and care schedules through their repositories, and due cares through `CareReads` (`src/contexts/reminders/store.ts`, `src/contexts/reminders/audience.ts`, `src/contexts/reminders/overdue.ts`).

`src/contexts/canopy` writes `canopies`, `canopyMembers`, `canopyInvites`, `canopyDirectInvites`, `canopyPlantMutes` and the owner columns of `plants` and `rooms` through `PgDrizzle`, in `src/contexts/canopy/store.ts` and nowhere else. The store is also the only code that locks a canopy row, and it takes every lock of a command in one order (`lockAndLoad`). The context reaches the rest of the api through these calls:

- `notifications` through `NotificationRepository` (`deleteUndeliveredNonCareOfNonOwners`, `deleteUndeliveredNonCareForMemberOnCanopy`) and `recordNotification`.
- Delegations through `DelegationRepository.hasOpenDelegationForPlant`, and the lock of an account deletion through `Absence.holdForDeletion`.
- Plant limits through `LimitChecker.checkPlantLimit`.

An ending (a leave, a removal, an account deletion or a dissolve) runs the give-back. Plants go back to their sharer, and at a dissolve the heir takes the rooms and every plant left.

`src/contexts/absence` writes `careDelegations`, `delegationPlants` and the vacation columns of `users` through `PgDrizzle`, in `src/contexts/absence/store.ts` and nowhere else, and takes every lock of a command in one order. The context reaches `notifications` through `NotificationRepository` (the sweep of what a vacation mutes) and `recordNotification`, memberships through `CanopyRepository`, and the due days that a vacation end moves through `Care.moveDueDays`. It loads neither Canopy nor Reminders.

## 2. Repositories

One row per file in `src/repositories/`. "Tables written" comes from the `.insert`, `.update` and `.delete` calls in the file. **MULTI** marks a repository whose write methods more than one context calls.

| Repository | Owner | Tables written | Other contexts calling it (r = read only, W = write) | Flag |
| --- | --- | --- | --- | --- |
| `achievement` | Engagement | `userAchievements`, and **`users`** (`historyViewCount`) | Billing r (`countLivingPlants` in `src/services/subscriptions/limit-checker.ts`), Admin r | writes an Identity table |
| `activity-push-token` | Notifications | `activityPushTokens` | Admin r | |
| `analytics` | Admin & Ops | `analytics_daily_snapshots`, through raw SQL | none | |
| `blog-post` | Content | `blogPosts` | none | |
| `canopy` | Canopy | none. The Canopy store writes `canopies`, `canopyMembers`, `canopyInvites`, `canopyDirectInvites` and `canopyPlantMutes`. | r from Care, Reminders, Absence, Assistant, Billing, Weather and Admin | read side of Canopy, with no write and no lock |
| `care-log` | Care | none. The Care store writes `careLogs`. | r from Assistant, Engagement, Identity (`user`) and Admin | read side of care history, with no write |
| `care-plan` | Care | none. The Care store writes `carePlans` and `carePlanSteps`. | r from Assistant (`src/services/ai-chat/plant-chat.ts`) | read side of care plans, with no write |
| `care-schedule` | Care | none. The Care store writes `plantCareSchedules`. | r from Reminders (the overdue pass in `src/contexts/reminders/overdue.ts`), Assistant, Weather and Admin | |
| `chat` | Assistant | `chatConversations`, `chatMessages` | Admin r | |
| `chat-follow-up` | Assistant | `chatFollowUpSets` | none | |
| `daily-tip` | Engagement | `dailyTips` | none | |
| `dead-letter` | Platform (inferred) | `deadLetterMessages` | Notifications W (`src/services/notification-scheduler/worker.ts`), Assistant W (`src/services/knowledge-ingestion/processor.ts`) | **MULTI** |
| `delegation` | Absence | none. The Absence store writes `careDelegations` and `delegationPlants`. | r from Care, Canopy, Reminders, Assistant and Weather | read side of Absence, with no write and no lock |
| `device-token` | Notifications | `deviceTokens` | Identity W (`deleteByUserId` in `src/services/user/helpers/release-account.ts`), Admin r | **MULTI** |
| `diagnosis` | Assistant | `diagnoses` | none (the `diagnosis` module reads) | |
| `engagement` | Engagement | none. It is a read model over `careLogs`, `notifications`, `plantCareSchedules`, `plantPhotos`, `plants`, `userSubscriptions` and `users`. | none | reads the tables of Care, Notifications, Billing and Identity |
| `follow` | Social | `userFollows`, `userNudges` | none | reads `plants` and `notifications` |
| `gift-code` | Billing | `giftCodes`, `giftCodeRedemptions` | Admin W (`createGiftCode`, `updateGiftCode` and `deleteGiftCode` in `src/services/admin/endpoints/`) | **MULTI** |
| `ingest-job` | Assistant | `ingestJobs` | none | |
| `magic-link` | Identity & Access | `magicLinks` | none (`auth`, `internal`) | |
| `notification` | Notifications. Rows of a reminder type belong to Reminders. | `notifications` | Reminders W (`src/contexts/reminders/store.ts`, the only caller of `lockReminders` and `writeReminders`). Deletes of other topics come from Canopy (`src/contexts/canopy/store.ts`), Identity (`deletePendingByUserIdAndTypes` in `src/services/user/helpers/release-account.ts` and `src/services/user/endpoints/update-user-settings.ts`) and Absence (`src/contexts/absence/store.ts`, the sweep of what a vacation mutes). Every caller of `recordNotification` writes too. r from Engagement, Billing and Admin. | **MULTI** |
| `oauth-identity` | Identity & Access | `oauthIdentities` | none | |
| `plant-catalog` | Care (inferred) | none (read only) | Content r (`src/services/blog-generator/topics.ts`) | |
| `plant` | Care | `plants` (the details of a plant, through `update`) and `plantPhotos`. The Care store inserts and deletes a plant and writes its death and its revival. | r from Assistant, Reminders, Notifications, Weather and Admin. No write caller outside `src/services/plants`. | the Canopy store also writes the owner columns |
| `processed-chunk` | Assistant | `processedChunks` | none | |
| `raw-document` | Assistant | `rawDocuments` | none | |
| `refresh-token` | Identity & Access | `refreshTokens` | none (`auth`, `internal`, `user`) | |
| `room` | Care (inferred) | `rooms` | Admin r | the Canopy store also writes the owner columns |
| `scan` | Care | `plantScans` | none | |
| `subscription` | Billing | `userSubscriptions`, `subscriptionEvents`, `subscriptionUsage`, `revenuecatWebhookEvents` | Admin W (`giftSubscription` and `revokeGiftSubscription` in `src/services/admin/endpoints/`), Reminders r (the plan caps in `src/services/overdue-scheduler/scheduler.ts`) | **MULTI** |
| `user` | Identity & Access | `users` | Absence W (the vacation columns, written by `src/contexts/absence/store.ts` without the repository). Admin W (`updateUser`, `updateRole` and `updateStatus` in `src/services/admin/endpoints/`, and `deleteUser` through `purgeAccount`). r from almost every context. | **MULTI** |
| `weather` | Weather | `weatherSnapshots` | Care r (`src/contexts/care/weather.ts`) | |

These writes bypass the repositories. `issueServiceToken` in `src/services/internal/endpoints/issue-service-token.ts` updates `users`, and `src/services/rate-limiter/service.ts` writes `rateLimits`.

## 3. The `plants` table, column by column

The schema is `plants` in `packages/db/src/schema/plants.ts`. These are the only writes of the table in `packages/api/src`:

- **create** is `InsertPlant` in the Care store (`src/contexts/care/store.ts`), decided by `PlantLife.plant` and called only from `src/services/plants/endpoints/create-plant.ts`.
- **update** is `PlantRepository.update` (`src/repositories/plant.repository.ts`), called only from `src/services/plants/endpoints/update-plant.ts`. The data is the request minus `id`, `wateringFrequencyDays`, `fertilizationFrequencyDays`, `mistingFrequencyDays` and `repottingFrequencyDays`, cast to `Record<string, unknown>`. So the writable set is `PlantUpdateRequest` (`packages/shared/src/domains/plant/schema.ts`), not `UpdatePlantData`.
- **bury, revive and remove** are `BuryPlant`, `RevivePlant` and `DeletePlant` in the Care store, decided by `PlantLife.bury`, `PlantLife.revive` and `PlantLife.remove`, from the endpoints `markPlantDead`, `revivePlant` and `deletePlant` in `src/services/plants/endpoints/`.
- **MovePlants** is the one write that changes the owner of a plant after insert, in `src/contexts/canopy/store.ts`. `src/contexts/canopy/domain/decide.ts` emits it for a share, an unshare, a give-back and the heir's part of a dissolved canopy.

`src/repositories/follow.repository.ts` reads `plants` and writes nothing to it.

| Column | Owner | Writers |
| --- | --- | --- |
| `id` | Care | create (the Care store generates it). |
| `name` | Care | create, update. |
| `description` | Care | create, update. |
| `imageUrl` | Care | create, update (the GCS upload happens inside `src/services/plants/endpoints/update-plant.ts`). `src/services/plants/endpoints/upload-plant-photo.ts` writes `plantPhotos`, not this column. |
| `category` | Care | create, update. |
| `dateAdded` | Care | The DB default only. `EnhancedPlantCreateRequest.plantingDate` exists but no api code reads it. |
| `updatedAt` | Care | update and MovePlants set it, and the Drizzle `$onUpdate` covers the rest. |
| `humidityRating`, `lightingRating`, `petToxicityRating`, `wateringRating` | Care | create, update. |
| `health` | Care (the condition) | create only, with the constant `'HEALTHY'`. Nothing updates it, because `PlantUpdateRequest` has no `health` key and no `ai-chat` code calls a `PlantRepository` write. Migration `packages/db/drizzle/0070_health_is_derived.sql` rewrites `NEEDS_ATTENTION` rows to `HEALTHY`, and `packages/db/drizzle/0082_plant_health_stored_condition.sql` removes the value from the type. See open question 1. |
| `remindersEnabled` | Notifications policy stored on a Care row (inferred) | No writer. `EnhancedPlantCreateRequest` accepts it, but the insert of the Care store and `PlantUpdateRequest` leave it out, so it keeps the column default `true`. `src/contexts/care/care-reads.ts`, `src/contexts/reminders/domain/plan.ts` and `src/repositories/care-schedule.repository.ts` read it. |
| `isFavorite` | Care | update only (a key of `PlantUpdateRequest`, not of the `UpdatePlantData` type). |
| `userId` | Care stores it, and Canopy changes it | create, MovePlants. The FK from `users` cascades on delete, so deleting a user deletes their plants. |
| `canopyId` | Care stores it, and Canopy changes it | create, MovePlants. The check `plants_one_owner` allows exactly one owner. |
| `createdByUserId` | Care. It is the sharer that Canopy gives a plant back to (`HeldPlant.sharer` in `src/contexts/canopy/domain/canopy.ts`). | create. The FK sets null on delete. |
| `potWidthCm`, `potHeightCm` | Care | create, update. |
| `roomId` | Care | create, update, and MovePlants, which keeps, clears or sets it. The FK from `rooms` sets null on delete. |
| `diedAt`, `deathCause`, `deathNote` | Care | bury, revive. |

Two findings follow from the table:

- One write changes the owner of a plant after insert, `MovePlants` in the Canopy store. `PlantLife.plant` gives a new row its first owner.
- "Needs attention" is derived. `seePlantCare` and `seeLivingPlantCare` in `src/contexts/care/plant-care.ts` compare the stored due day with today. `src/repositories/plant.repository.ts`, `src/repositories/delegation.repository.ts` and `src/repositories/engagement.repository.ts` apply them. The `plant_health` enum in `packages/db/src/schema/enums.ts` no longer lists `NEEDS_ATTENTION`.

## 4. Context relationships

An event goes from its publisher to its consumer, and a call goes from the caller to the callee.

| From | To | Mechanism | Evidence |
| --- | --- | --- | --- |
| Care | Engagement | EventBus `CareLogCreated`, `PlantCreated`, `AttentionResponded`, `PhotoUploaded`, `PlantScanned`, `CareHistoryViewed` and `PlantShared` | `src/events/care-forwarder.ts` publishes the first three from the outbox topic `care`. An endpoint publishes each of the others, for example `src/services/plants/endpoints/upload-plant-photo.ts`. `src/services/achievements/checker.ts` consumes them. |
| Reminders | Engagement | EventBus `ReminderResponded`, when a recorded care answers a reminder sent that day | `acknowledgeCare` in `src/contexts/reminders/consumers.ts` publishes it, and `src/services/achievements/checker.ts` consumes it. |
| Care | Notifications (Live Activity) | EventBus `CareLogCreated` and `PlantLifecycleChanged` | `src/events/care-forwarder.ts` publishes them from the outbox topic `care`, and `src/services/live-activity/subscriber.ts` consumes them. |
| Care | Reminders | Outbox topic `care`, written in the transaction of the change. Reminders replans the plant after `ScheduleChanged`, `CareRecorded` and `PlantLifeChanged`. `CareAmended` and `CareRemoved` add nothing, because a `ScheduleChanged` comes with them. Care code never calls `Reminders.request`. | The `reminders` consumer in `src/contexts/reminders/consumers.ts`. `staleAfterCare` in `src/contexts/reminders/triggers.ts` says which event makes what stale. |
| Identity | Reminders | `Reminders.request(Dirty)` writes a row on the outbox topic `reminders` in the caller's transaction, and the `reminders-replan` consumer plans it after the commit. No Care endpoint calls it. | `src/services/user/endpoints/update-user-settings.ts`, `src/services/user/helpers/release-account.ts` |
| Canopy | Reminders | Outbox topic `canopy`, written in the transaction of the change. It carries `MemberJoined`, `MemberLeft`, `PlantsMoved`, `CanopyTimezoneChanged`, `PlantMuted`, `PlantUnmuted` and `CanopyDissolved`. Reminders replans what each one makes stale. Canopy code never calls `Reminders.request`. | `src/contexts/canopy/canopy.ts` publishes them. `canopyConsumer` in `src/contexts/reminders/consumers.ts` consumes them, and `staleAfterCanopy` in `src/contexts/reminders/triggers.ts` says what each makes stale. |
| Notifications, Reminders | Care | `CareReads.due`, the only published Care read | `src/services/notification-scheduler/dispatch-gate.ts`, `src/contexts/reminders/store.ts`, `src/contexts/reminders/overdue.ts` |
| Notifications | Reminders | `Reminders.audienceOf`, who the reminders of a plant are addressed to | `src/services/notification-scheduler/dispatch-gate.ts`, `src/services/live-activity/subscriber.ts` |
| Notifications | Care | Direct `PlantRepository.findById` | `src/services/live-activity/subscriber.ts` |
| Notifications | Notifications | The scheduler enqueues a group of claimed notifications on the `MessageQueue`, and the worker dequeues and delivers it. `PushService.sendLiveActivity` sends the Live Activity pushes. For a reminder, the worker sends `LiveActivityUpdate` to each card the user already shows and `LiveActivityStart` to each device without one. The live-activity subscriber sends `LiveActivityUpdate` and `LiveActivityEnd`, `src/services/activity-scheduler/scheduler.ts` sends `LiveActivityEnd`, and the admin endpoint `triggerLiveActivityStart` sends `LiveActivityStart`. | `src/services/notification-scheduler/scheduler.ts`, `src/services/notification-scheduler/worker.ts`, `src/services/live-activity/subscriber.ts` |
| Any context | Notifications | `recordNotification`, `recordNotificationAt`, `dispatchNow` and `dispatchAll` write `notifications` and enqueue | `src/services/helpers/schedule-notification.ts`. Callers include `src/services/social/endpoints/send-nudge.ts`, `src/contexts/absence/absence.ts`, `src/contexts/canopy/canopy.ts`, `src/services/subscriptions/usage-tracker.ts` and `src/services/engagement-scheduler/scheduler.ts`. |
| Canopy | Care | The Canopy store sets the owner columns of `plants` and `rooms` (`MovePlants`, `MoveRooms`). No other code changes them after insert. | `src/contexts/canopy/store.ts` |
| Care | Canopy | `Canopy.sharePlant`, `Canopy.unsharePlant` and `Canopy.setMute`, each with a `PlantPermit` | `sharePlantWithCanopy`, `unsharePlant`, `mutePlant` and `unmutePlant` in `src/services/plants/endpoints/` |
| Care | Canopy | A shared table join on `canopyMembers` and `canopyPlantMutes` for visibility | `src/repositories/helpers/care-visibility.ts` |
| Canopy | Absence | `Absence.holdForDeletion` is a lock class of `Canopy.leaveForDeletion`. It locks the delegation rows of the user, then their account row, after the canopy row and before any plant. `DelegationRepository.hasOpenDelegationForPlant` runs before a share. | `src/contexts/canopy/store.ts`, `src/contexts/canopy/canopy.ts` |
| Canopy | Billing | `LimitChecker.checkPlantLimit` for a share and an unshare. A give-back and the heir's part ask no limit. | `src/contexts/canopy/canopy.ts` |
| Care | Absence | A shared table join on `careDelegations` | `src/repositories/plant.repository.ts`, `src/repositories/care-schedule.repository.ts`, `src/repositories/care-plan.repository.ts`, `src/repositories/helpers/tending.ts` |
| Absence | Care | A shared table join on `plants` and `plantCareSchedules`, read through `seeLivingPlantCare` | `src/repositories/delegation.repository.ts` |
| Absence | Care | `Care.moveDueDays` with reason `vacation`, inside the transaction of the vacation end | `src/contexts/absence/store.ts` |
| Absence | Reminders | The facts `DelegationStarted`, `DelegationEnded`, `VacationStarted` and `VacationEnded` on the outbox topic `absence`, consumed by `reminders-absence` through `staleAfterAbsence` | `src/contexts/absence/domain/events.ts`, `src/contexts/reminders/triggers.ts` |
| Absence | Identity | The vacation columns on `users` (`packages/db/src/schema/users.ts`), written by the Absence store under a lock of the account row | `src/contexts/absence/store.ts` |
| Assistant | Care | `CarePlans.propose`, `CarePlans.linkToDiagnosis` and `CarePlans.linkToMessage`. Assistant writes no plan row itself. | `createDiagnosisTool` and `proposeCarePlanTool` in `src/services/ai-chat/tools/`, and `src/services/ai-chat/persist-chat-completion.ts` |
| Assistant | Care | Direct reads of the schedules, care logs and plans of a plant for the prompt | `src/services/ai-chat/plant-chat.ts` |
| Assistant | Engagement | EventBus `ChatMessageSent` and `DiseaseIdentified` | `src/services/ai-chat/persist-chat-completion.ts` |
| Care | Billing | `LimitChecker.checkPlantLimit` | `createPlant` and `revivePlant` in `src/services/plants/endpoints/` |
| Care | Billing | `UsageTracker.withReservation` around each AI call | `aiIdentify`, `aiReIdentify`, `detect`, `scanCard` and `scanCardMultiple` in `src/services/plants/endpoints/` |
| Assistant | Billing | `UsageTracker.withDetachedReservation` for the `aiChats` quota of a streamed reply | `src/services/ai-chat/endpoints/stream-chat-message.ts` |
| Absence | Billing | `LimitChecker.checkDelegationAccess` | `src/services/delegation/endpoints/create-delegation.ts` |
| Billing | Engagement | Direct `AchievementRepository.countLivingPlants`, a plant count kept in the achievements repository | `src/services/subscriptions/limit-checker.ts` |
| Reminders | Billing | Direct `SubscriptionRepository` reads for the plan caps of the overdue digest | `src/services/overdue-scheduler/scheduler.ts` |
| Identity | Canopy, Absence, Notifications, Reminders | Account deletion runs inside `Canopy.leaveForDeletion`, which takes the user out of their canopy in the same transaction. The soft deletion (`releaseAccount`) calls `Absence.releaseForDeletion`, deletes the pending notifications of the user and asks Reminders to replan the recipient. The hard deletion (`purgeAccount`) calls `Absence.releaseForDeletion` and deletes the row. | `src/services/user/helpers/release-account.ts`, `src/services/user/helpers/purge-account.ts` |
| Weather | Care | `Care.moveDueDays` with reason `weather` | `src/services/weather-scheduler/readjust-care-schedules.ts` |
| Care | Weather | Direct `WeatherRepository` reads and the weather algorithm, for the weather adjustment of a care logged for today | `src/contexts/care/weather.ts` |
| Social | Engagement | EventBus `UserFollowed`, which the consumer ignores | `src/services/social/endpoints/follow-user.ts`, `src/services/achievements/checker.ts` |
| Engagement | Care, Notifications, Billing, Identity | Shared table joins in one read repository | `src/repositories/engagement.repository.ts` (tables in section 2) |
| Engagement | Assistant | `RagService.retrieve` | `src/services/tips-scheduler/generator.ts` |
| Engagement | Identity | Writes `users.historyViewCount` | `src/repositories/achievement.repository.ts` |
| Content | Care | Direct `PlantCatalogRepository` read | `src/services/blog-generator/topics.ts` |
| Admin | Identity, Billing | Direct repository writes | `updateRole` and `giftSubscription` in `src/services/admin/endpoints/` |
| Admin | all | Direct repository reads (the `admin` row of section 1) | `src/services/admin/endpoints/get-user-overview.ts` |

Notes on events:

- `packages/shared/src/services/event-bus/types.ts` defines the EventBus event tags.
- `RarePlantIdentified` has a consumer in `src/services/achievements/checker.ts` and no publisher in `packages/api/src`.
- Care events, Canopy and Absence facts and replan requests skip the EventBus. They are rows in the `outbox` table, written in the transaction of the writer, delivered after the commit, retried, then dead-lettered (`src/kernel/outbox.ts`, `src/kernel/transact.ts`). `appConsumers` in `src/layers/outbox.ts` lists every consumer.
- The EventBus is fire-and-forget. `src/services/activity-scheduler/scheduler.ts` is a safety net for a dropped `CareLogCreated`.

## 5. Decided boundaries

These questions are settled. The boundary test enforces who writes what in each one.

- **Reminder planning** is a context of its own, `src/contexts/reminders`. Nothing outside it plans, locks or deletes a row of a reminder type, and delivery only moves their status. Care hands over to Reminders at the rule about reminders in `CONTEXT.md`, section Care.
- **Vacation** lives in Absence with delegations. The state stays on `users`, and only `src/contexts/absence/store.ts` gives it a value. Ending a vacation moves due days through `Care.moveDueDays`, deletes the muted notifications that are not reminders and publishes `VacationEnded`. Account deletion goes through Absence. `Absence.releaseForDeletion` cancels the open delegations and ends the vacation in the transaction of the deletion, and moves no due day.
- **Plant ownership.** Canopy is the one writer of the owner of a plant or a room after insert, and of mutes. Care creates the row with its first owner. `CONTEXT.md` defines Owner under Care, and sharer, give-back, heir and ending under Canopy. A give-back and the heir's part check no plant limit, as before Canopy existed. No test covers whether that lets a user pass their own limit (inferred).
- **Care plans** live in Care. `CarePlans` is the one writer of a plan and its steps. Assistant proposes a plan and links it to a diagnosis or a chat message through `CarePlans`. A care closes the earliest open step of its type in the transaction of the care, and a tick records the care in the transaction of the tick (`src/contexts/care/domain/plan-decide.ts`).

## 6. Open questions

1. **Who sets the condition of a plant?** No code writes `plants.health` after creation (section 3). `createDiagnosis` in `src/services/ai-chat/tools/create-diagnosis.ts` creates a diagnosis and proposes a care plan, and never touches the plant. `CONTEXT.md`, section Health, leaves the owner open.
2. **The weather adjustment is split.** The rule is Care, but the algorithm lives in `src/services/weather/` and `src/services/weather-scheduler/readjust-care-schedules.ts` decides the move before it hands it to `Care.moveDueDays`.
3. **Billing counts plants through the achievements repository** (`countLivingPlants` in `src/services/subscriptions/limit-checker.ts`). It is a Care fact kept in an Engagement repository.
4. **`AttentionResponded` still rests on the derived value `NEEDS_ATTENTION`.** The Care store notes `needsAttention` on the fact of a recorded care in `src/contexts/care/store.ts`, and `src/events/care-forwarder.ts` publishes the event from it. The event is a Care fact phrased with a value that is no longer stored.
5. **Rooms and the plant catalog.** A user or a canopy owns a room, and a room only places plants, so it sits in Care by inference. The catalog is read-only reference data that Care and Content use.
6. **`EngagementRepository` and `AnalyticsRepository` are cross-context read models** over raw tables. They need a decision between a published read per context and an accepted reporting exception.
7. **Notification delivery and knowledge ingestion share `dead-letter`.** It sits in Platform by inference.
8. **Account deletion spans Identity, Canopy, Absence, Notifications and Reminders** from `releaseAccount` in `src/services/user/helpers/release-account.ts`. The hard delete (`purgeAccount` in `src/services/user/helpers/purge-account.ts`, called by Admin and `account-cleanup`) runs inside the same command, `Canopy.leaveForDeletion`. No event exists for it.
