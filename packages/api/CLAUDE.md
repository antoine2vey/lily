# API Package Architecture

> Global rules (Effect patterns, formatting) in root `/CLAUDE.md`

## Service Structure

```
services/{domain}/
├── api.ts          # HttpApiEndpoint definitions
├── handlers.ts     # HttpApiBuilder.group — imports endpoints directly
├── helpers/        # Domain helpers (if needed)
└── endpoints/      # Individual endpoint functions
```

**No `service.ts` files.** Handlers call endpoint functions directly. 21 HTTP domains, 10 schedulers, 8 infrastructure services (`ai`, `email`, `event-bus`, `jwt`, `message-queue`, `push`, `rag`, `rate-limiter`), 24 repositories.

## Handlers

Import endpoints directly. **No `Layer.provide` chains** — all deps come from `AppLive` at root.

```typescript
export const PlantsApiLive = (api: Api) =>
  HttpApiBuilder.group(api, 'plants', (handlers) =>
    handlers
      .handle('getPlant', ({ path: { id } }) =>
        withPlantAuth(id).pipe(
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

Returns the authorized plant. Use `Effect.flatMap` when endpoint needs the plant, `Effect.zipRight` for auth-only. **Endpoints must not re-fetch a plant received from `withPlantAuth`.**

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

Typed errors via `Schema.TaggedError`. Use `publishWithRetry()` for event publishing.

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
  owner-only via `withPlantOwnerAuth`. Bury cancels pending notifications and
  publishes `PlantLifecycleChanged`, which the Live Activity subscriber uses to
  refresh the card. Revive re-runs `scheduleCareReminder` for future due dates
  and enforces the plant limit through `countLivingPlants`.
- Deliberately unfiltered: achievements (`countPlants`), admin analytics, and
  care-log history/streaks (past care stays history).
