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

## Reminders

Care and overdue reminders are planned in `contexts/reminders` and nowhere else. Code that changes what they are planned from (a plant's life, a recipient's settings) calls `Reminders.request(Dirty.Plants | Dirty.Canopy | Dirty.Recipient)` inside its own transaction, opened with `transact` from `kernel/transact.ts`. The request commits with the change and is replanned after it, with retries, so a failed replan never rolls the change back. A change made through a `Care`, `Canopy` or `Absence` command needs no request. The context publishes a fact on its outbox topic, and Reminders replans what the fact makes stale.

Do not create, re-time, lock or delete a row of a reminder type outside the context. `NotificationRepository.create` and `deletePendingByUserIdAndTypes` reject those types at compile time, and `__tests__/architecture/context-boundaries.test.ts` fails on a new writer. Terms: `CONTEXT.md`, section Reminders.

## Canopy

A canopy, its members, links, invitations and mutes are changed in `contexts/canopy` and nowhere else. The same holds for the owner of a plant or a room once the row exists. A caller runs one command of the `Canopy` service from `@lily/api/contexts/canopy`: `create`, `update`, `leave`, `removeMember`, `dissolve`, `leaveForDeletion`, `createLink`, `revokeLink`, `join`, `invite`, `withdrawInvitation`, `declineInvitation`, `sharePlant`, `unsharePlant` or `setMute`. The plant commands take a `PlantPermit` from `withPlantPermit`. The others take the id of the acting user.

Each command opens its own transaction, takes its locks in the one order of `CanopyStore.lockAndLoad`, applies the rules of `domain/decide.ts`, writes, records the notifications it owes and publishes what happened on the outbox topic `canopy`. Reminders consumes that topic and replans by itself, so no caller of a Canopy command calls `Reminders.request`. `CanopyRepository` is the read side. It has no write and no lock.

Do not write `canopies`, `canopy_members`, `canopy_invites`, `canopy_direct_invites` or `canopy_plant_mutes` outside `contexts/canopy/store.ts`, do not set `user_id` or `canopy_id` on an existing plant or room there either, and do not lock a canopy row. `__tests__/architecture/context-boundaries.test.ts` fails on each of these, and on an import of `contexts/reminders` from Canopy code. A new refusal does not compile until `errorOf` in `contexts/canopy/canopy.ts` gives it an error, and a new fact does not compile until `staleAfterCanopy` in `contexts/reminders/triggers.ts` says what it makes stale. Terms: `CONTEXT.md`, section Canopy.

## Absence

A delegation is opened and changed, and a vacation is set, called off, started and ended, in `contexts/absence` and nowhere else. A caller runs one command of the `Absence` service from `@lily/api/contexts/absence`: `openDelegation`, `respondToDelegation`, `cancelDelegation`, `completeDelegation`, `setVacation`, `cancelVacation`, `advanceDelegations` or `advanceVacations`. The first six take the id of the acting user. The two schedulers call the last two at startup and then at their interval. An account deletion calls two more, `holdForDeletion` and `releaseForDeletion`, which open no transaction and run in the one `Canopy.leaveForDeletion` opened. Each due delegation or vacation gets a transaction of its own, so one that fails is counted and the next still runs. A delegation still pending at its start is due too: the tick cancels it and tells the owner with `delegation_canceled` and the param `unanswered`.

Each command opens its own transaction, takes its locks in the one order of `AbsenceStore` (the owner's advisory key, the delegation row, the account row of a vacation, the accounts and the plants a new delegation names, then the plants a vacation end moves, then the waiting notifications a vacation sweeps), applies the table `RULES` of `domain/delegation.ts` or `domain/vacation.ts`, writes, records the notifications it owes and publishes what happened on the outbox topic `absence`. Reminders consumes that topic and replans by itself, so no caller of an Absence command calls `Reminders.request`. `DelegationRepository` is the read side.

Do not write `care_delegations` or `delegation_plants` outside `contexts/absence/store.ts`, do not lock a delegation row outside it, and do not give `vacation_status`, `vacation_start` or `vacation_end` a value there either. Absence must not import `contexts/canopy` or `contexts/reminders`; it reads memberships through `CanopyRepository`. `__tests__/architecture/context-boundaries.test.ts` fails on each of these. Canopy imports `contexts/absence` for `holdForDeletion` only, so `CanopyLive` is built over `AbsenceLive`. A new command or status does not compile until `RULES` has its cell, a new refusal until `absence.ts` gives it an error, and a new fact until `staleAfterAbsence` in `contexts/reminders/triggers.ts` says what it makes stale. Terms: `CONTEXT.md`, section Absence.

A vacation command locks the account row `FOR NO KEY UPDATE`, so it never waits on a care that only references the account. An account deletion takes the same lock through `holdForDeletion`, right after the user's delegation rows and before any plant or notification row. A new path that updates an account row and then deletes that user's waiting notifications must take the account row first too, or it can deadlock with a deletion.

Whether a caretaker tends a plant is one SQL condition, `tending()` in `repositories/helpers/tending.ts`: the delegation is active and the caretaker's account is reachable. Use it in every query that gives a caretaker access to a plant or picks who is reminded. Do not compare `careDelegations.status` with `'active'` for that.

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
- Lifecycle endpoints (`markPlantDead`, `revivePlant`, `deletePlant`) are
  gated by `withPlantAuth(id, 'markDead' | 'revive' | 'delete')`. Bury and
  revive call `Reminders.request` for the plant and publish
  `PlantLifecycleChanged`, which the Live Activity subscriber uses to refresh
  the card. Delivery drops any other notification of a dead plant
  (`plant-gone`). Revive enforces the limit of the plant's owner, a user or a
  Canopy, through `LimitChecker.checkPlantLimit`.
- Deliberately unfiltered: achievements (`countPlants`), admin analytics, and
  care-log history/streaks (past care stays history).
