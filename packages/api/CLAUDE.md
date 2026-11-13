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

Care and overdue reminders are planned in `contexts/reminders` and nowhere else. Code that changes what they are planned from (a plant, its owner or audience, a schedule, a recipient's settings, a vacation, a delegation) calls `Reminders.request(Dirty.Plants | Dirty.Canopy | Dirty.Recipient)` inside its own transaction, opened with `transact` from `kernel/transact.ts`. The request commits with the change and is replanned after it, with retries, so a failed replan never rolls the change back.

Do not create, re-time, lock or delete a row of a reminder type outside the context. `NotificationRepository.create` and `deletePendingByUserIdAndTypes` reject those types at compile time, and `__tests__/architecture/context-boundaries.test.ts` fails on a new writer. Terms: `CONTEXT.md`, section Reminders.

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
