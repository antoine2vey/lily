# API Package Architecture

## Service Structure

```
services/{domain}/
├── api.ts          # HttpApiEndpoint definitions
├── handlers.ts     # HttpApiBuilder.group — imports endpoints directly
├── helpers/        # Domain helpers (if needed)
└── endpoints/      # Individual endpoint functions
```

**No `service.ts` files.** Handlers call endpoint functions directly. 27 HTTP domains, 16 schedulers, 8 infrastructure services (`ai`, `email`, `event-bus`, `jwt`, `message-queue`, `push`, `rag`, `rate-limiter`), 31 repositories.

## Handlers

```typescript
export const PlantsApiLive = (api: Api) =>
  HttpApiBuilder.group(api, 'plants', (handlers) =>
    handlers
      .handle('getPlant', ({ params: { id } }) =>
        withPlantAuth(id, 'view').pipe(
          Effect.flatMap((plant) => findPlantById(plant)),
          withInfraErrorsAsDefect,
        )
      )
  )
```

## Layer Composition

`AppLive` in `src/layers/index.ts` merges all repositories + infrastructure. Provided once at server root in `src/index.ts`.

- **EventBus** (Redis pub/sub): ephemeral, fire-and-forget (achievement events)
- **MessageQueue** (Redis lists): reliable, at-least-once (notification delivery)

## `withPlantAuth`

`withPlantAuth(id, action)` returns the plant when the caller's `PlantRole` may perform `action` per the table in `services/plants/helpers/plant-access.ts`. No role answers `PlantNotFoundError` with the same body as a missing plant; a role without the action answers `PlantNotAuthorizedError`. Use `Effect.flatMap` when the endpoint needs the plant, `Effect.zipRight` for auth-only. **Endpoints must not re-fetch a plant received from `withPlantAuth`.**

## Schedulers

Use `createScheduler()` from `services/helpers/create-scheduler.ts`:

```typescript
export const startMyScheduler = createScheduler({
  name: 'my-scheduler',
  interval: '1 hour',
  runOnStartup: true,
  task: myTask,
})
```

Error isolation built-in: catch + log + continue, never crash server.

## Naming Conventions

- Requests: `{Entity}CreateRequest`, `{Entity}UpdateRequest`
- Responses: `{Entity}ListResponse`, `{Entity}Response`
- Data types: `Create{Entity}Data`, `Update{Entity}Data`

## Error Handling

Use `publishWithRetry()` for event publishing.

A handler that writes a user id outside the contexts (a room, a device token, a chat message) holds no account. When a hard deletion of that account commits under it, the write breaks the foreign key to `users` and the handler dies on a `SqlError`. The `Authentication` middleware in `services/auth/middleware.impl.ts` answers that case for every such handler: when the handler dies on a `SqlError` and the account of `CurrentUser` no longer exists, the request answers the `UnauthorizedError` its next request would get, and the defect is logged at error level. Every other defect still answers 500. Do not add an account hold to such a writer to fix its answer. `AdminAuth` has no such rule.

## Testing

**Tests are mandatory for new features.**

- Mock at **repository level**, not DB level
- Tests live in `src/__tests__/services/{domain}/`
- Fixtures in `src/__tests__/fixtures/`, mocks in `src/__tests__/mocks/`

```typescript
const result = await Effect.runPromise(
  findUserById('user-1').pipe(
    Effect.provide(createMockUserRepository(mockUsers))
  )
)
```

## Transactions

An operation that is only right inside its caller's transaction requires the `Transaction` service of `kernel/transact.ts`, so it does not compile outside one. Every store lock and `apply`, `Absence.holdForDeletion` and `releaseForDeletion`, `Canopy.holdAsMember`, `Reminders.request` and `outbox.append` require it. `transact` provides it. So does `transactQuietly`, which wakes no relay and is for a body that appends nothing to the outbox. Do not provide `Transaction` anywhere else, and do not capture it in a layer. A test that calls such an operation on its own wraps it in `transactInMemory` from `__tests__/mocks/transaction.ts`.

An endpoint that answers with a row its command wrote reads that row in the same transaction: it wraps the command and the read in `transact`, or reads inside the body of `withOwnerLock`. The command's own transaction becomes a savepoint, so its locks hold until the read is done. A read made after the commit can find the row deleted by a request that waited for the command, and then answers 404 or dies. `__tests__/integration/read-back-races.integration.test.ts` has one race per endpoint.

An effect that is only right once the change is committed, such as the enqueue of a notification the worker then reads, is registered inside the transaction with `Transaction.afterCommit`. It runs after the outermost commit, so a caller may wrap the command in its own `transact`, and it is dropped when that transaction or one around it rolls back. Do not run such an effect after `transact` returns. Under a caller's transaction, that is before the commit. `Canopy.join`, `invite`, `leave`, `removeMember` and `leaveForDeletion`, and the delegation commands of `Absence`, enqueue their notifications this way.

## Reminders

Care and overdue reminders are planned in `contexts/reminders` and nowhere else. Code that changes what they are planned from (a recipient's settings, the release of an account) calls `Reminders.request(Dirty.Plants | Dirty.Canopy | Dirty.Recipient)` inside its own transaction, opened with `transact` from `kernel/transact.ts`. The request commits with the change and is replanned after it, with retries, so a failed replan never rolls the change back. A change made through a `Care`, `Canopy` or `Absence` command needs no request. The context publishes a fact on its outbox topic, and Reminders replans what the fact makes stale.

Do not create, re-time, lock or delete a row of a reminder type outside the context. `NotificationRepository.create` and `deletePendingByUserIdAndTypes` reject those types at compile time, and `__tests__/architecture/context-boundaries.test.ts` fails on a new writer. Terms: `CONTEXT.md`, section Reminders.

## Canopy

A canopy, its members, links, invitations and mutes are changed in `contexts/canopy` and nowhere else. The same holds for the owner of a plant or a room once the row exists. A caller runs one command of the `Canopy` service from `@lily/api/contexts/canopy`: `create`, `update`, `leave`, `removeMember`, `dissolve`, `leaveForDeletion`, `createLink`, `revokeLink`, `join`, `invite`, `withdrawInvitation`, `declineInvitation`, `sharePlant`, `unsharePlant` or `setMute`. The plant commands take a `PlantPermit` from `withPlantPermit`. The others take the id of the acting user.

Each command opens its own transaction, takes its locks in the one order of `CanopyStore.lockAndLoad`, applies the rules of `domain/decide.ts`, writes, records the notifications it owes and publishes what happened on the outbox topic `canopy`. Reminders consumes that topic and replans by itself, so no caller of a Canopy command calls `Reminders.request`. `CanopyRepository` is the read side. It has no write and no lock.

A command holds the account of every user its rows name until it commits, so a hard deletion of that account waits for it or the command finds no account. A member of the canopy the command holds is held by the canopy row. `leaveForDeletion` takes the per-user key of `lockUser` first, as `create` and `join` do, so the deletion always finds the canopy of a member and waits for its row. A user who is not a member yet is named in the `accounts` of the lock plan and read `FOR KEY SHARE`: the creator of `create`, the joiner of `join` and the invitee of `invite`. `create` then takes no other lock, and the other two take only invitation rows of a canopy they already hold. A missing account is a refusal. `create` answers the `UnauthorizedError` of a request with no account behind it, `join` answers `CanopyInviteNotFoundError` and `invite` answers `UserNotFoundError`. A new command that writes the id of a user who may not be a member names that user in `accounts`.

Do not write `canopies`, `canopy_members`, `canopy_invites`, `canopy_direct_invites` or `canopy_plant_mutes` outside `contexts/canopy/store.ts`, do not set `user_id` or `canopy_id` on an existing plant or room there either, and do not lock a canopy row. `__tests__/architecture/context-boundaries.test.ts` fails on each of these, and on an import of `contexts/reminders` from Canopy code. A new refusal does not compile until `errorOf` in `contexts/canopy/canopy.ts` gives it an error, and a new fact does not compile until `staleAfterCanopy` in `contexts/reminders/triggers.ts` says what it makes stale. Terms: `CONTEXT.md`, section Canopy.

## Absence

A delegation is opened and changed, and a vacation is set, called off, started and ended, in `contexts/absence` and nowhere else. A caller runs one command of the `Absence` service from `@lily/api/contexts/absence`: `openDelegation`, `respondToDelegation`, `cancelDelegation`, `completeDelegation`, `setVacation`, `cancelVacation`, `advanceDelegations` or `advanceVacations`. The first six take the id of the acting user. The two schedulers call the last two at startup and then at their interval. An account deletion calls two more, `holdForDeletion` and `releaseForDeletion`, which open no transaction and run in the one `Canopy.leaveForDeletion` opened. Each due delegation or vacation gets a transaction of its own, so one that fails is counted and the next still runs. A delegation still pending at its start is due too: the tick cancels it and tells the owner with `delegation_canceled` and the param `unanswered`.

Each command opens its own transaction, takes its locks in the one order of `AbsenceStore` (the per-user keys of the owner and the caretaker of a new delegation, both in one statement and in key order, the delegation row, the account row of a vacation, the accounts and the plants a new delegation names, then the plants a vacation end moves, then the waiting notifications a vacation sweeps), applies the table `RULES` of `domain/delegation.ts` or `domain/vacation.ts`, writes, records the notifications it owes and publishes what happened on the outbox topic `absence`. Reminders consumes that topic and replans by itself, so no caller of an Absence command calls `Reminders.request`. `DelegationRepository` is the read side.

Do not write `care_delegations` or `delegation_plants` outside `contexts/absence/store.ts`, do not lock a delegation row outside it, and do not give `vacation_status`, `vacation_start` or `vacation_end` a value there either. Absence must not import `contexts/canopy` or `contexts/reminders`; it reads memberships through `CanopyRepository`. `__tests__/architecture/context-boundaries.test.ts` fails on each of these. Canopy imports `contexts/absence` for `holdForDeletion` only, so `CanopyLive` is built over `AbsenceLive`. A new command or status does not compile until `RULES` has its cell, a new refusal until `absence.ts` gives it an error, and a new fact until `staleAfterAbsence` in `contexts/reminders/triggers.ts` says what it makes stale. Terms: `CONTEXT.md`, section Absence.

A vacation command locks the account row `FOR NO KEY UPDATE`, so it never waits on a care that only references the account. An account deletion takes the per-user key of `lockUser` first. An opening takes the key of each of its two users, so the deletion finds every delegation that names the account, and an opening behind it finds no account and is refused. The deletion then takes the same lock through `holdForDeletion`, right after the user's delegation rows and before any plant or notification row. A command on an existing delegation holds its row, which the deletion of either party waits for, so the notifications it records for them never name a deleted account. It then takes every plant its delete writes, in one statement in id order (`PlantScope.Leaver` in `contexts/canopy/store.ts`): the plants of the canopy, the user's own, those the user created and those with a plan the user wrote. A new path that updates an account row and then deletes that user's waiting notifications must take the account row first too, or it can deadlock with a deletion.

Whether a caretaker tends a plant is one SQL condition, `tending()` in `repositories/helpers/tending.ts`: the delegation is active and the caretaker's account is reachable. Use it in every query that gives a caretaker access to a plant or picks who is reminded. Do not compare `careDelegations.status` with `'active'` for that.

## Care

A care, a care schedule, a care plan and the life of a plant are changed in `contexts/care` and nowhere else. A caller runs one command of one of three services from `@lily/api/contexts/care`. All three write through one `CareStore` and publish on one outbox topic, `care`.

- `Care` records and edits cares and schedules: `record`, `recordOne`, `amend`, `remove`, `correctLastCare`, `setSchedules` or `moveDueDays`.
- `PlantLife` creates, buries, revives and removes a plant: `plant`, `bury`, `revive` or `remove`. The cemetery section below has its rules.
- `CarePlans` proposes and runs a care plan: `propose`, `accept`, `dismiss`, `delete`, `tickStep`, `untickStep`, `dropStep`, `linkToDiagnosis` or `linkToMessage`.

A command on a plant takes a `PlantPermit` from `withPlantPermit` or `withPermittedPlant`. A command on a plan takes a `PlanPermit` from `withCarePlanAuth`. Two commands take no permit. `moveDueDays` serves the weather readjustment and Absence, and `linkToMessage` serves the chat save. No Care code reads the current user.

Each command opens its own transaction and locks the plant row, `FOR NO KEY UPDATE` in every command except `PlantLife.remove`, which takes it `FOR UPDATE`. A command on several plants locks them in id order. A plan command locks the plant of its plan, so no command locks a plan row. A command whose rows name the acting user (`Care.record`, `recordOne`, `correctLastCare`, `CarePlans.propose` and `tickStep`) loads through `CareStore.lockAndLoadFor`, which reads that user's account row `FOR KEY SHARE` after the plant rows, never before. The foreign key of the row takes that lock at the write anyway, so the order against an account deletion is the same: the delete of the account waits for the command, or the command waits for the delete and then finds no account. It is then refused as `ActorGone` and answers `PlantNotFoundError`, as someone with no role on the plant. `PlantLife.plant` has no plant row to lock, so `CareStore.lockAndLoadForPlanting` reads the accounts the new row names (its creator, and its owner when a user owns it) `FOR KEY SHARE` right after the owner lock. A missing one is refused as `CreatorGone` and answers the `UnauthorizedError` of a request with no account behind it. The command then applies the rules of `domain/decide.ts`, `domain/life.ts` or `domain/plan-decide.ts`, writes, and publishes what happened on the topic `care`. Reminders consumes that topic and replans by itself, and `events/care-forwarder.ts` turns the facts the app listens to into EventBus events. So no caller of a Care command calls `Reminders.request` or publishes a care event. `linkToMessage` is the one exception to the shape. It is a single statement on a column no rule reads, with no plant lock and no fact. `CareReads.due` is the read side for due cares. `CareLogRepository`, `CareScheduleRepository` and `CarePlanRepository` only read.

A dead plant takes part in nothing. It accepts no new care, no correction, no schedule change, no due-day move and no plan command except `CarePlans.delete`, and a proposal for it answers as a plant that does not exist. Its past cares can still be edited or removed.

A day is stored, not derived. The due day of a schedule is `plant_care_schedules.due_day` and the day of a care is `care_logs.care_day`. The store writes both in the plant's care timezone, and a stored day stays put when the owner changes timezone. Do not compute a day from `next_care_at` or from `date`. Both columns stay nullable until `packages/db/gated/README.md` has been followed. Until then, read a day through `storedDay` and filter due days with `dueOnOrBefore`, both in `contexts/care/stored-day.ts`. They give a row without a day the day of its instant. An insert into either table in a test or a seed script names its day column.

Do not write `care_logs`, `plant_care_schedules`, `care_plans` or `care_plan_steps` outside `contexts/care/store.ts`. Care must not load `contexts/canopy`, `contexts/absence` or `contexts/reminders`, directly or through a module it imports. `__tests__/architecture/context-boundaries.test.ts` fails on each of these. A new refusal does not compile until `errorOf` in `contexts/care/refusals.ts` gives it an error. A new life state does not compile until `LIFE` in `domain/life.ts` has its cell, and a new plan command or status until `RULES` and `DEAD_PLANT_TAKES` in `domain/plan.ts` have theirs. A new fact does not compile until `staleAfterCare` in `contexts/reminders/triggers.ts` says what it makes stale and `events/care-forwarder.ts` says what the app hears. Terms: `CONTEXT.md`, section Care.

## Dead plants (the cemetery)

A plant with `died_at IS NOT NULL` is in the user's cemetery. It keeps every
row (schedules, photos, care logs) but must not take part in care tasks,
reminders, digests, nudges, health updates, user-facing counts, or the Live
Activity.

- Apply `isLivingPlant()` / `livingPlantSql` from
  `src/repositories/helpers/living-plant.ts` to every new query that joins or
  counts `plants` for one of those paths. For a `leftJoin` put the predicate in
  the join condition, not the WHERE, or rows without plants disappear.
- `PlantRepository.findAll`: `filter: 'dead'` lists the cemetery; every other
  filter is living-only unless the caller passes `includeDead: true` (admin).
- A plant is created, buried, revived and removed by one command of
  `PlantLife` from `@lily/api/contexts/care`: `plant`, `bury`, `revive` or
  `remove`. The lifecycle endpoints (`markPlantDead`, `revivePlant`,
  `deletePlant`) take the plant and a permit from
  `withPermittedPlant(id, 'markDead' | 'revive' | 'delete')`. Each command
  publishes `PlantLifeChanged` on the Care topic in its own transaction.
  Reminders replans from that fact, and the EventBus forwarder turns it into
  `PlantCreated` or `PlantLifecycleChanged`, which the Live Activity
  subscriber uses to refresh the card. So no lifecycle endpoint calls
  `Reminders.request` or publishes an event. Delivery drops any other
  notification of a dead plant (`plant-gone`).
- `plant` and `revive` add a living plant to an owner, a user or a Canopy.
  They take the `OwnerHeld` proof that `withOwnerLock` gives its body, and
  the endpoint asks `LimitChecker.checkPlantLimit` under that lock. Revive
  restarts every due day at today plus the schedule's frequency, in the
  plant's care timezone.
- Do not insert or delete a `plants` row, or give `died_at` a value, outside
  `contexts/care/store.ts`. `__tests__/architecture/context-boundaries.test.ts`
  fails on it.
- Deliberately unfiltered: achievements (`countPlants`), admin analytics, and
  care-log history/streaks (past care stays history).
