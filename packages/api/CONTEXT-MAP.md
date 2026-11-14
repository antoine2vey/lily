# Context map draft: `packages/api`

Status: draft from a read-only pass over the working tree of branch `antoine2vey/ddd-core-business-assessment` (2026-11-12). Updated the same day once the Reminders context was built: every row about reminder planning describes the built code. Updated on 2026-11-13 once the Canopy context was built: every row about canopies, mutes and the owner of a plant or a room describes the built code. Updated again that day once the Absence context was built: every row about delegations and vacations describes the built code. Account deletion is the part of it still to move. Updated a last time that day once the rest of Care was built: every row about the life of a plant, care plans and the stored due day and care day describes the built code.
Paths are relative to `packages/api/src/` unless they start with `packages/`.
"Inferred" marks a judgement. Everything else comes from a file read or a grep.

Method for sections 1, 2 and 4: a script resolved every `const x = yield* SomeRepository` binding under `services/` and `contexts/`, then listed each `x.method(` call. A method counts as a write when its name does not start with `find/get/count/list/has/is/exists/search`. `lock*` methods are listed separately as locks.

## Proposed contexts

| Context | Classification | One-line scope |
| --- | --- | --- |
| **Care** | core | Plants and their life (plant, bury, revive, remove), rooms, care schedules, care history, care plans, weather adjustment. Built in `contexts/care`: the services `Care`, `PlantLife` and `CarePlans` over one store, and the read `CareReads`. Reminders and the app hear of a change on the outbox topic `care`. Glossary: `packages/api/CONTEXT.md`. |
| **Reminders** | core | Which care reminders exist, for whom and when. Built in `contexts/reminders`. Other contexts call `Reminders.request`, and the plan is rebuilt after their commit. Glossary: `packages/api/CONTEXT.md`. |
| **Notifications** | core (inferred: delivery is how the main loop reaches the user) | Delivery of every notification, inbox, device tokens, push, Live Activity. It moves reminder rows through their statuses and never plans one. |
| **Canopy** | core (inferred) | The shared household: members, links, invitations and mutes, and every change of the owner of a plant or a room after insert. Built in `contexts/canopy`. A caller runs a command of the `Canopy` service, and Reminders hears of the change on the outbox topic `canopy`. Glossary: `packages/api/CONTEXT.md`. |
| **Absence** | supporting | The time a user cannot look after their plants: a delegation (a temporary caretaker for some personal plants) and a vacation. Built in `contexts/absence`. A caller runs a command of the `Absence` service, and Reminders hears of a change of who is reminded on the outbox topic `absence`. Glossary: `packages/api/CONTEXT.md`. |
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
| `ai-chat` | Conversations, streamed chat, tools that create diagnoses and propose care plans through the `CarePlans` service. | Assistant | core | Chat, CarePlan, Diagnosis, Plant, CareSchedule, CareLog, User, Delegation, Canopy |
| `alerting` | Ops alerts to Discord or console, with dedup. | Admin & Ops | generic | none |
| `analytics-scheduler` | 6-hourly precomputed metrics (`scheduler.ts:6-11`). | Admin & Ops | generic | Analytics |
| `auth` | Magic link, OAuth sign-in, refresh, logout, set username; auth middleware. | Identity & Access | generic | User, MagicLink, RefreshToken, OAuthIdentity |
| `blog-generator` | Hourly pipeline that researches, writes and publishes blog posts. | Content | generic | BlogPost, PlantCatalog |
| `canopy` | Endpoints over the `Canopy` service: create, update, dissolve, leave a canopy; links and invitations; remove member. They read through `CanopyRepository` and write nothing themselves. | Canopy | core | Canopy |
| `care-logs` | Endpoints over the `Care` service: record, amend and remove a care. They read care logs and recent activity through `CareLogRepository` and write nothing themselves. `get-care-logs.ts:33` publishes `CareHistoryViewed`. | Care | core | CareLog |
| `care-plans` | Endpoints over the `CarePlans` service: accept, dismiss and delete a plan; tick, untick and drop a step. They list plans through `CarePlanRepository` and write nothing themselves. | Care | core | CarePlan, Plant, Canopy |
| `care-tasks` | One read endpoint: due cares for the caller, through `CareReads`. | Care | core | User, CareLog, Canopy, Plant |
| `delegation` | Endpoints over the `Absence` service: open, answer, cancel, complete a delegation; delegated tasks. They read through `DelegationRepository` and write nothing themselves. | Absence | supporting | Delegation |
| `delegation-scheduler` | Calls `Absence.advanceDelegations` at startup and every 5 min: starts, completes, and cancels a request still pending at its start. | Absence | supporting | none |
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
| `plants` | Endpoints over `PlantLife` (create, mark dead, revive, delete) and `Care` (perform care, correct care dates, change frequencies). Plant details and photos through `PlantRepository`. Scan and AI identify. Share, unshare and mute through the `Canopy` service. | Care | core | Plant, Canopy, Delegation, Room, Scan, User |
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
| `vacation` | Endpoints over the `Absence` service: get, set, cancel a vacation. | Absence | supporting | User |
| `vacation-scheduler` | Calls `Absence.advanceVacations` at startup and every 5 min: starts and ends vacations on their dates. | Absence | supporting | none |
| `weather` | Weather endpoint, care-adjustment endpoint, providers, cache, algorithm. | Weather; `algorithm*` and `get-care-adjustments.ts` are Care (inferred) | supporting | Weather, User, Plant, CareSchedule |
| `weather-scheduler` | Hourly weather fetch and snapshot cleanup (`scheduler.ts`); `readjust-care-schedules.ts` moves watering due days. | Weather; `readjust-care-schedules.ts` is Care (inferred) | supporting | User, Plant, Canopy, CareSchedule, Weather, Notification, Delegation |
| `weekly-recap-scheduler` | Sunday recap push. | Engagement | supporting | Engagement, Achievement |

`contexts/care` writes `careLogs`, `plantCareSchedules`, `carePlans`, `carePlanSteps` and, for the creation, the death, the revival and the removal of a plant, `plants`, through `PgDrizzle`, in `contexts/care/store.ts` and nowhere else (`__tests__/architecture/context-boundaries.test.ts`). The store takes every lock of a command in one order (`lockAndLoad`). `CareReadsLive` queries `plantCareSchedules`, `plants`, `users`, `canopies`, `rooms` through `PgDrizzle` (`contexts/care/care-reads.ts`). A due day and a care day are read from the stored columns `due_day` and `care_day`, which are both `NOT NULL`. The context uses one repository, `WeatherRepository`, for the weather adjustment (`contexts/care/weather.ts`). It loads neither `contexts/canopy`, `contexts/absence` nor `contexts/reminders`, directly or through another module (`__tests__/architecture/context-boundaries.test.ts`). Terms: `packages/api/CONTEXT.md`, section Care.

`contexts/reminders` reaches `notifications` only through `NotificationRepository` (`lockReminderPlants`, `findHoldersOfWaitingReminders`, `lockReminders`, `writeReminders`). It reads plants, users, canopies and delegations through their repositories, and due cares through `CareReads` (`contexts/reminders/store.ts`, `contexts/reminders/audience.ts`).

`contexts/canopy` writes `canopies`, `canopyMembers`, `canopyInvites`, `canopyDirectInvites`, `canopyPlantMutes` and the owner columns of `plants` and `rooms` through `PgDrizzle`, in `contexts/canopy/store.ts` and nowhere else. The store is also the only code that locks a canopy row, and it takes every lock of a command in one order (`lockAndLoad`). The context reaches `notifications` through `NotificationRepository` (`deleteUndeliveredNonCareOfNonOwners`, `deleteUndeliveredNonCareForMemberOnCanopy`) and `recordNotification`, delegations through `DelegationRepository.hasOpenDelegationForPlant` and, for the lock of an account deletion, `Absence.holdForDeletion`, and plant limits through `LimitChecker.checkPlantLimit`. An ending (a leave, a removal, an account deletion, a dissolve) runs the give-back: plants go back to their sharer, and at a dissolve the heir takes the rooms and every plant left. Terms: `packages/api/CONTEXT.md`, section Canopy.

`contexts/absence` writes `careDelegations`, `delegationPlants` and the vacation columns of `users` through `PgDrizzle`, in `contexts/absence/store.ts` and nowhere else, and takes every lock of a command in one order. The context reaches `notifications` through `NotificationRepository` (the sweep of what a vacation mutes) and `recordNotification`, memberships through `CanopyRepository`, and the due days a vacation end moves through `Care.moveDueDays`. It imports neither `contexts/canopy` nor `contexts/reminders`. Terms: `packages/api/CONTEXT.md`, section Absence.

## 2. Repositories

31 repository files in `repositories/` (`packages/api/CLAUDE.md:13` says 24; stale). "Tables written" comes from `.insert/.update/.delete(<table>)` in the file. **MULTI** = write methods are called from more than one proposed context.

| Repository | Owner | Tables written | Other contexts calling it (r = read only, W = write) | Flag |
| --- | --- | --- | --- | --- |
| `achievement` | Engagement | `userAchievements`, **`users`** (`achievement.repository.ts:268`, `historyViewCount`) | Billing r (`subscriptions/limit-checker.ts:116` `countLivingPlants`), Admin r | writes an Identity table |
| `activity-push-token` | Notifications | `activityPushTokens` | Admin r | |
| `analytics` | Admin & Ops | `analytics_daily_snapshots` (raw SQL, `analytics.repository.ts:707`) | none | |
| `blog-post` | Content | `blogPosts` | none | |
| `canopy` | Canopy | none. The Canopy store writes `canopies`, `canopyMembers`, `canopyInvites`, `canopyDirectInvites` and `canopyPlantMutes` (`contexts/canopy/store.ts`). | r: Care, Reminders, Assistant, Billing, Weather, Admin | read side of Canopy, no write and no lock |
| `care-log` | Care | none. The Care store writes `careLogs` (`contexts/care/store.ts`). | r: Assistant, Engagement, Identity (`user`), Admin | read side of care history, no write |
| `care-plan` | Care | none. The Care store writes `carePlans` and `carePlanSteps` (`contexts/care/store.ts`). | r: Assistant (`ai-chat/plant-chat.ts:230`) | read side of care plans, no write |
| `care-schedule` | Care | none. The Care store writes `plantCareSchedules` (`contexts/care/store.ts`). | r: Assistant, Reminders (overdue audience), Weather, Identity, Admin | |
| `chat` | Assistant | `chatConversations`, `chatMessages` | Admin r | |
| `daily-tip` | Engagement | `dailyTips` | none | |
| `dead-letter` | Platform (inferred) | `deadLetterMessages` | Notifications W (`notification-scheduler/worker.ts:585`), Assistant W (`knowledge-ingestion/processor.ts:152`) | **MULTI** |
| `delegation` | Absence | none. The Absence store writes `careDelegations` and `delegationPlants` (`contexts/absence/store.ts`). | r: Care, Canopy, Assistant, Weather, Admin | read side of Absence, no write and no lock |
| `device-token` | Notifications | `deviceTokens` | Identity W (`user/helpers/release-account.ts`); Admin r | **MULTI** |
| `diagnosis` | Assistant | `diagnoses` | none (`diagnosis` module reads) | |
| `engagement` | Engagement | none (read model over `careLogs`, `notifications`, `plantCareSchedules`, `plantPhotos`, `plants`, `userSubscriptions`, `users`) | none | reads 5 contexts' tables |
| `follow` | Social | `userFollows`, `userNudges` | none | reads `plants`, `notifications` |
| `gift-code` | Billing | `giftCodes`, `giftCodeRedemptions` | Admin W (`admin/endpoints/create-gift-code.ts:33`, `update-gift-code.ts:62`, `delete-gift-code.ts:19`) | **MULTI** |
| `ingest-job` | Assistant | `ingestJobs` | none | |
| `magic-link` | Identity & Access | `magicLinks` | none (`auth`, `internal`) | |
| `notification` | Notifications. Rows of the five reminder types belong to Reminders. | `notifications` | Reminders W (`contexts/reminders/store.ts`, the only caller of `lockReminders` and `writeReminders`); deletes of other topics from Canopy (`contexts/canopy/store.ts`), Identity (`user/endpoints/delete-account.ts:35`, `user/endpoints/update-user-settings.ts:112`) and Absence (`contexts/absence/store.ts`, the sweep of what a vacation mutes); every caller of `helpers/schedule-notification.ts:64`; r: Engagement, Billing, Admin | **MULTI** |
| `oauth-identity` | Identity & Access | `oauthIdentities` | none | |
| `plant-catalog` | Care (inferred) | none (read only) | Content r (`blog-generator/topics.ts:75`) | |
| `plant` | Care | `plants` (the details of a plant, `update`), `plantPhotos`. The Care store inserts and deletes a plant and writes its death and its revival (`contexts/care/store.ts`). | r: Assistant, Canopy, Delegation, Notifications, Weather, Identity, Admin. No write caller outside `services/plants`. | owner columns also written by the Canopy store |
| `processed-chunk` | Assistant | `processedChunks` | none | |
| `raw-document` | Assistant | `rawDocuments` | none | |
| `refresh-token` | Identity & Access | `refreshTokens` | none (`auth`, `internal`, `user`) | |
| `room` | Care (inferred) | `rooms` | Admin r | owner columns also written by the Canopy store |
| `scan` | Care | `plantScans` | none | |
| `subscription` | Billing | `userSubscriptions`, `subscriptionEvents`, `subscriptionUsage`, `revenuecatWebhookEvents` | Admin W (`admin/endpoints/gift-subscription.ts:55`, `revoke-gift-subscription.ts:35`); Notifications r (`overdue-scheduler/scheduler.ts:220`) | **MULTI** |
| `user` | Identity & Access | `users` | Absence W (`contexts/absence/store.ts`, the vacation columns, not through the repository); Admin W (`admin/endpoints/update-user.ts:36`, `update-role.ts:26`, `update-status.ts:26`, `delete-user.ts:41`); r: almost every context | **MULTI** |
| `weather` | Weather | `weatherSnapshots` | Care r (`contexts/care/weather.ts`) | |

**MULTI count: 6** (`dead-letter`, `device-token`, `gift-code`, `notification`, `subscription`, `user`).

Writes that bypass repositories: `internal/endpoints/issue-service-token.ts:60` (`db.update(users)`), `rate-limiter/service.ts:79,118` (`rateLimits`).

## 3. The `plants` table, column by column

Schema: `packages/db/src/schema/plants.ts:23-82`. Every `.insert(plants)` / `.update(plants)` / `.delete(plants)` in `packages/api/src` (grep): `contexts/care/store.ts:456,477,490,499`, `repositories/plant.repository.ts:658` and the `MovePlants` write of `contexts/canopy/store.ts`. `follow.repository.ts:168` only reads.

Write paths, named once:

- **create**: `InsertPlant` in the Care store (`contexts/care/store.ts:456`), decided by `PlantLife.plant`, called only from `services/plants/endpoints/create-plant.ts:60`.
- **update**: `PlantRepository.update` (`plant.repository.ts:658`), called only from `services/plants/endpoints/update-plant.ts:87`. The data is the request minus the four frequency fields, cast to `Record<string, unknown>` (`update-plant.ts:73-83`). So the writable set is `PlantUpdateRequest` (`packages/shared/src/domains/plant/schema.ts:131-148`), not `UpdatePlantData`.
- **bury / revive / remove**: `BuryPlant`, `RevivePlant` and `DeletePlant` in the Care store (`contexts/care/store.ts:477,490,499`), decided by `PlantLife.bury`, `PlantLife.revive` and `PlantLife.remove`, from `mark-plant-dead.ts`, `revive-plant.ts:51` and `delete-plant.ts`.
- **MovePlants**: the one write that changes a plant's owner after insert, in `contexts/canopy/store.ts`. `contexts/canopy/domain/decide.ts` emits it for a share, an unshare, a give-back and the heir's part of a dissolved canopy.

| Column | Proposed owner | Writers |
| --- | --- | --- |
| `id` | Care | create (DB default). |
| `name` | Care | create, update. |
| `description` | Care | create, update. |
| `imageUrl` | Care | create, update (GCS upload inside `update-plant.ts:78-90`). `upload-plant-photo.ts` writes `plantPhotos`, not this column. |
| `category` | Care | create, update. |
| `dateAdded` | Care | DB default only. `EnhancedPlantCreateRequest.plantingDate` exists (`schema.ts:155`) but is not passed to `PlantLife.plant` (`create-plant.ts:60`). |
| `updatedAt` | Care | update and MovePlants set it explicitly; Drizzle `$onUpdate` covers the rest (`plants.ts:36`). |
| `humidityRating`, `lightingRating`, `petToxicityRating`, `wateringRating` | Care | create, update. |
| `health` | Care (condition); Assistant is the intended writer per `packages/api/CONTEXT.md:59` | create only, constant `'HEALTHY'` (`contexts/care/store.ts:460`). No update path: `PlantUpdateRequest` has no `health` key, and no `ai-chat` code calls a `PlantRepository` write. Migration `packages/db/drizzle/0070_health_is_derived.sql` rewrites `NEEDS_ATTENTION` rows to `HEALTHY`, and `0082_plant_health_stored_condition.sql` removes the value from the type. See open question 1. |
| `remindersEnabled` | Notifications policy stored on a Care row (inferred) | No writer found. Accepted by `EnhancedPlantCreateRequest` (`schema.ts:166`) but absent from the insert of the Care store (`contexts/care/store.ts:456`) and from `PlantUpdateRequest`. Column default `true`. Read by `contexts/care/care-reads.ts:220`, `care-schedule.repository.ts:125,226`. |
| `isFavorite` | Care | update only (key in `PlantUpdateRequest`, `schema.ts:144`; not in the `UpdatePlantData` type). |
| `userId` | Care stores it; Canopy changes it | create, MovePlants. FK `onDelete: cascade` from `users` (`plants.ts:46`): deleting a user deletes their plants. |
| `canopyId` | Care stores it; Canopy changes it | create, MovePlants. Check `plants_one_owner` (`plants.ts:76-79`). |
| `createdByUserId` | Care (it is the sharer Canopy gives a plant back to, `HeldPlant.sharer` in `contexts/canopy/domain/canopy.ts`) | create. FK `onDelete: set null`. |
| `potWidthCm`, `potHeightCm` | Care | create, update. |
| `roomId` | Care | create, update, MovePlants (kept, cleared or set). FK `onDelete: set null` from `rooms`. |
| `diedAt`, `deathCause`, `deathNote` | Care | bury, revive. |

Findings:

- One write changes plant ownership after insert: `MovePlants` in the Canopy store. `PlantLife.plant` gives a new row its first owner.
- "Needs attention" is derived by `seePlantCare` (`contexts/care/plant-care.ts:46-54`) and applied in `plant.repository.ts:305,319,338`, `delegation.repository.ts:193`, `engagement.repository.ts:401`. It compares the stored due day with today. The `plant_health` enum no longer lists `NEEDS_ATTENTION` (`packages/db/src/schema/enums.ts`).

## 4. Context relationships

Direction is "upstream -> downstream" for events, "caller -> callee" for calls.

| From -> To | Mechanism | Evidence |
| --- | --- | --- |
| Care -> Engagement | EventBus `CareLogCreated`, `PlantCreated`, `PhotoUploaded`, `PlantScanned`, `AttentionResponded`, `ReminderResponded`, `CareHistoryViewed`, `PlantShared` | `CareLogCreated`, `AttentionResponded` and `PlantCreated` come from `events/care-forwarder.ts`, which consumes the outbox topic `care`. An endpoint publishes each of the others, e.g. `plants/endpoints/upload-plant-photo.ts:56`. Consume `achievements/checker.ts:235-245` |
| Care -> Notifications (Live Activity) | EventBus `CareLogCreated`, `PlantLifecycleChanged` | publish `events/care-forwarder.ts`, from the outbox topic `care`; consume `live-activity/subscriber.ts:152,159` |
| Care -> Reminders | Outbox topic `care`, written in the transaction of the change. Reminders replans the plant after `ScheduleChanged`, `CareRecorded` and `PlantLifeChanged`. `CareAmended` and `CareRemoved` add nothing, because a `ScheduleChanged` comes with them. Care code never calls `Reminders.request`. | consume `contexts/reminders/consumers.ts:46,59`; which event makes what stale in `contexts/reminders/triggers.ts:29` (`staleAfterCare`) |
| Identity -> Reminders | `Reminders.request(Dirty)`: a row on the outbox topic `reminders`, written in the caller's transaction and planned after its commit by the `reminders-replan` consumer. No Care endpoint calls it. | `user/endpoints/update-user-settings.ts:117`, `user/helpers/release-account.ts:33` |
| Canopy -> Reminders | Outbox topic `canopy`, written in the transaction of the change. Seven facts: `MemberJoined`, `MemberLeft`, `PlantsMoved`, `CanopyTimezoneChanged`, `PlantMuted`, `PlantUnmuted`, `CanopyDissolved`. Reminders replans what each one makes stale. Canopy code never calls `Reminders.request`. | publish `contexts/canopy/canopy.ts`; consume `contexts/reminders/consumers.ts` (`canopyConsumer`); which fact makes what stale in `contexts/reminders/triggers.ts` (`staleAfterCanopy`) |
| Notifications, Reminders -> Care | `CareReads.due` (the only published Care read) | `notification-scheduler/dispatch-gate.ts:268`, `contexts/reminders/store.ts`, `contexts/reminders/overdue.ts` |
| Notifications -> Reminders | `Reminders.audienceOf`: who a plant's reminders are addressed to | `notification-scheduler/dispatch-gate.ts:281`, `live-activity/subscriber.ts:125` |
| Notifications -> Care | Direct `PlantRepository.findById` | `live-activity/subscriber.ts:121` |
| Notifications internal | MessageQueue: scheduler enqueues, worker delivers; messages `LiveActivityStart/Update/End` | `notification-scheduler/scheduler.ts:237`, `worker.ts:231` |
| Any context -> Notifications | `recordNotification` / `dispatchNow` helper (writes `notifications`, enqueues) | `helpers/schedule-notification.ts:33,130`; callers e.g. `social/endpoints/send-nudge.ts:66`, `contexts/absence/absence.ts`, `subscriptions/usage-tracker.ts:155`, `engagement-scheduler/scheduler.ts:107` |
| Canopy -> Care | The Canopy store sets the owner columns of `plants` and `rooms` (`MovePlants`, `MoveRooms`). No other code changes them after insert. | `contexts/canopy/store.ts`; `__tests__/architecture/context-boundaries.test.ts` |
| Care -> Canopy | `Canopy.sharePlant`, `Canopy.unsharePlant` and `Canopy.setMute`, each with a `PlantPermit` | `plants/endpoints/share-plant-with-canopy.ts`, `plants/endpoints/unshare-plant.ts`, `plants/endpoints/mute-plant.ts` |
| Care -> Canopy | Shared table join (`canopyMembers`, `canopyPlantMutes`) for visibility | `repositories/helpers/care-visibility.ts` (imports both tables) |
| Canopy -> Absence | `Absence.holdForDeletion` as a lock class of `Canopy.leaveForDeletion`: the user's delegation rows, then their account row, after the canopy row and before any plant. `DelegationRepository.hasOpenDelegationForPlant` before a share. | `contexts/canopy/store.ts`, `contexts/canopy/canopy.ts` |
| Canopy -> Billing | `LimitChecker.checkPlantLimit` for a share and an unshare. A give-back and the heir's part ask no limit. | `contexts/canopy/canopy.ts` |
| Care -> Absence | Shared table join on `careDelegations` | `repositories/plant.repository.ts:411` |
| Absence -> Care | Shared table join on `plants` and `plantCareSchedules`; uses `seeLivingPlantCare` | `repositories/delegation.repository.ts:193,277,394` |
| Absence -> Care | `Care.moveDueDays` with reason `vacation`, inside the transaction of the vacation end | `contexts/absence/store.ts` |
| Absence -> Reminders | Four facts on the outbox topic `absence`, consumed by `reminders-absence` through `staleAfterAbsence` | `contexts/absence/domain/events.ts`, `contexts/reminders/triggers.ts` |
| Absence -> Identity | The vacation columns on `users` (`packages/db/src/schema/users.ts:82-86`), written by the Absence store under a lock of the account row | `contexts/absence/store.ts` |
| Assistant -> Care | `CarePlans.propose`, `CarePlans.linkToDiagnosis` and `CarePlans.linkToMessage`. Assistant writes no plan row itself. | `ai-chat/tools/create-diagnosis.ts:80,89`, `ai-chat/tools/propose-care-plan.ts:39`, `ai-chat/persist-chat-completion.ts:230` |
| Assistant -> Care | Direct reads of schedules and care logs for the prompt | `ai-chat/plant-chat.ts:221,222,230` (the plans of the plant too) |
| Assistant -> Engagement | EventBus `ChatMessageSent`, `DiseaseIdentified` | `ai-chat/persist-chat-completion.ts:157,196` |
| Care -> Billing | `LimitChecker.checkPlantLimit` | `plants/endpoints/create-plant.ts:59`, `plants/endpoints/revive-plant.ts:45` |
| Care, Assistant -> Billing | `UsageTracker.withReservation` | `plants/endpoints/ai-identify.ts:49`, `ai-chat/endpoints/stream-chat-message.ts:170` |
| Absence -> Billing | `LimitChecker.checkDelegationAccess` | `delegation/endpoints/create-delegation.ts:31` |
| Billing -> Engagement | Direct `AchievementRepository.countLivingPlants` (a plant count kept in the achievements repo) | `subscriptions/limit-checker.ts:116` |
| Notifications -> Billing | Direct `SubscriptionRepository` reads | `overdue-scheduler/scheduler.ts:220-221` |
| Identity -> Canopy, Absence, Notifications, Reminders | Account deletion runs inside `Canopy.leaveForDeletion`, which takes the user out of their canopy in the same transaction. Inside it the soft deletion calls `Absence.releaseForDeletion`, deletes pending notifications and asks Reminders for a replan of the recipient. The hard deletion calls `Absence.releaseForDeletion` and deletes the row, in one transaction. | `user/helpers/release-account.ts`, `user/helpers/purge-account.ts` |
| Weather -> Care | `Care.moveDueDays` with reason `weather` | `weather-scheduler/readjust-care-schedules.ts:276` |
| Care -> Weather | Direct `WeatherRepository` reads and `weather/algorithm`, for the weather adjustment of a care logged for today | `contexts/care/weather.ts` |
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
- Care events, Canopy facts and replan requests do not use the EventBus. They are rows in the `outbox` table, written in the writer's transaction, delivered after commit, retried, then dead-lettered (`kernel/outbox.ts`, `kernel/transact.ts`).
- The EventBus is fire-and-forget (`packages/api/CLAUDE.md:34`); `activity-scheduler/scheduler.ts:34` is a safety net for dropped `CareLogCreated`.

## 5. Open questions

1. **Who sets a plant's condition?** The glossary says "A diagnosis sets it" (`packages/api/CONTEXT.md:59`). No code writes `plants.health` after creation (section 3). `ai-chat/tools/create-diagnosis.ts:80` creates a diagnosis and proposes a care plan and never touches the plant. Either the rule is not implemented, or the glossary is ahead of the code.
2. **Reminder planning: decided.** It is a context of its own, `contexts/reminders`. Nothing outside it plans, locks or deletes a row of the five reminder types, and delivery only moves their status (`__tests__/architecture/context-boundaries.test.ts`). The glossary still names reminders in rule 4 of Care (`CONTEXT.md:56`), which is where Care hands over to Reminders. `plants.remindersEnabled` has no writer.
3. **Vacation: decided.** It lives in Absence with delegations. The state stays on `users` (`users.ts:82-86`) and only `contexts/absence/store.ts` gives it a value (`__tests__/architecture/context-boundaries.test.ts`). Ending a vacation moves due days through `Care.moveDueDays`, deletes the muted notifications that are not reminders and publishes `VacationEnded`. Account deletion goes through Absence: `Absence.releaseForDeletion` cancels the open delegations and ends the vacation in the transaction of the deletion, and moves no due day.
4. **Plant ownership: decided.** Canopy is the one writer of the owner of a plant or a room after insert, and of mutes (`contexts/canopy/store.ts`, enforced by `__tests__/architecture/context-boundaries.test.ts`). Care creates the row with its first owner. The glossary defines Owner under Care (`CONTEXT.md:16`) and sharer, give-back, heir and ending under Canopy. A give-back and the heir's part ask no plant limit. That is kept as it was. Whether it lets a user pass their own limit has not been tested (inferred).
5. **Care plans: decided.** They live in Care. `CarePlans` is the one writer of a plan and its steps (`contexts/care/store.ts`, enforced by `__tests__/architecture/context-boundaries.test.ts`). Assistant proposes a plan and links it to a diagnosis or a chat message through `CarePlans` (`create-diagnosis.ts:80,89`, `persist-chat-completion.ts:230`). A care closes the earliest open step of its type in the transaction of the care, and a tick records the care in the transaction of the tick (`contexts/care/domain/plan-decide.ts`). The glossary gives the terms and rules 5 and 6 (`CONTEXT.md`, section Care).
6. **Weather adjustment split.** The rule is Care (`CONTEXT.md:38`), but the algorithm lives in `services/weather/algorithm*` and `services/weather-scheduler/readjust-care-schedules.ts:276` decides the move and hands it to `Care.moveDueDays`.
7. **Billing counts plants through the achievements repository** (`limit-checker.ts:116`). `countLivingPlants` is a Care fact kept in an Engagement repository.
8. **`AttentionResponded` still rests on the derived value `NEEDS_ATTENTION`.** The Care store notes `needsAttention: seen.health === 'NEEDS_ATTENTION'` on the fact of a recorded care (`contexts/care/store.ts:651`), and `events/care-forwarder.ts` publishes the event from it. The event is a Care fact phrased with a value that is no longer stored.
9. **Rooms and plant catalog.** Rooms are owned by a user or a canopy and only place plants; placed in Care by inference. The catalog is read-only reference data used by Care and Content.
10. **`EngagementRepository` and `AnalyticsRepository` are cross-context read models** over raw tables. They need a decision: published reads per context, or an accepted reporting exception.
11. **`dead-letter` is shared** by notification delivery and knowledge ingestion; treated as Platform by inference.
12. **Account deletion orchestrates five contexts** from `user/endpoints/delete-account.ts:26-44`. The hard delete (`user/helpers/purge-account.ts`, called by Admin and `account-cleanup`) runs inside the same command, `Canopy.leaveForDeletion`. No event exists for it.
