# Task 01 — DB Delegation Schema

[x] DONE

## Context

First V2 task — no V2 dependencies (but assumes V1 follow system exists).
Creates the `care_delegations` and `delegation_plants` tables for the vacation care delegation feature.

## Files to create

- `packages/db/src/schema/delegation.ts` — new schema file for delegation tables + relations + enums

## Files to modify

- `packages/db/src/schema/enums.ts` — add `delegationStatusEnum`
- `packages/db/src/schema/index.ts` — add `export * from './delegation'`
- `packages/db/src/schema/users.ts` — add delegation relations
- `packages/db/src/schema/plants.ts` — add delegation relation

## Implementation

### Enum: `delegationStatusEnum`

Add to `packages/db/src/schema/enums.ts`:

```typescript
export const delegationStatusEnum = pgEnum('delegation_status', [
  'pending',    // created, waiting for caretaker response
  'accepted',   // caretaker accepted, waiting for startDate
  'rejected',   // caretaker rejected
  'active',     // in progress (between startDate and endDate)
  'completed',  // finished (endDate passed or manually completed)
  'canceled',   // owner canceled before active
])
```

### Table: `care_delegations`

```typescript
export const careDelegations = pgTable('care_delegations', {
  id: uuid('id').primaryKey().defaultRandom(),
  ownerId: uuid('owner_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  caretakerId: uuid('caretaker_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  status: delegationStatusEnum('status').notNull().default('pending'),
  message: text('message'), // optional message from owner to caretaker
  startDate: timestamp('start_date', { withTimezone: true }).notNull(),
  endDate: timestamp('end_date', { withTimezone: true }).notNull(),
  respondedAt: timestamp('responded_at', { withTimezone: true }),
  canceledAt: timestamp('canceled_at', { withTimezone: true }),
  completedAt: timestamp('completed_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
})
```

### Table: `delegation_plants`

Junction table linking delegations to specific plants:

```typescript
export const delegationPlants = pgTable(
  'delegation_plants',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    delegationId: uuid('delegation_id')
      .notNull()
      .references(() => careDelegations.id, { onDelete: 'cascade' }),
    plantId: uuid('plant_id')
      .notNull()
      .references(() => plants.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex('delegation_plants_delegation_plant_idx').on(
      table.delegationId,
      table.plantId
    ),
  ]
)
```

### Relations

```typescript
export const careDelegationsRelations = relations(careDelegations, ({ one, many }) => ({
  owner: one(users, {
    fields: [careDelegations.ownerId],
    references: [users.id],
    relationName: 'delegationsAsOwner',
  }),
  caretaker: one(users, {
    fields: [careDelegations.caretakerId],
    references: [users.id],
    relationName: 'delegationsAsCaretaker',
  }),
  plants: many(delegationPlants),
}))

export const delegationPlantsRelations = relations(delegationPlants, ({ one }) => ({
  delegation: one(careDelegations, {
    fields: [delegationPlants.delegationId],
    references: [careDelegations.id],
  }),
  plant: one(plants, {
    fields: [delegationPlants.plantId],
    references: [plants.id],
  }),
}))
```

In `users.ts`, add to `usersRelations`:
```typescript
delegationsAsOwner: many(careDelegations, { relationName: 'delegationsAsOwner' }),
delegationsAsCaretaker: many(careDelegations, { relationName: 'delegationsAsCaretaker' }),
```

### Key design decisions

- **owner** = the person going on vacation (delegating their plants)
- **caretaker** = the person accepting responsibility (caring for plants)
- **status flow**: `pending → accepted → active → completed` (happy path)
- **No overlapping**: enforced at application layer — check for active/accepted delegations on same plants before creating
- **Junction table**: allows delegating specific plants, not all plants
- **Cascade delete**: if user or plant deleted, delegation records clean up

### Migration

Run `bun drizzle-kit generate` from `packages/db` to auto-generate the migration.

## Reference

- Copy table pattern from `packages/db/src/schema/subscriptions.ts` (multi-table with enum)
- Copy junction table pattern — similar to any many-to-many relationship

## Tests

No unit tests for schema — verified by migration + typecheck.

## Review checklist

After implementing, run these agents before committing:
1. **Code review agent** — check for bugs, logic errors, adherence to project conventions (Effect patterns, no native JS methods, etc.)
2. **Security agent** — check for injection vulnerabilities, auth bypass, data leakage, OWASP top 10
3. **Scalability check** — review DB queries for N+1, missing indexes, pagination correctness
4. **Code quality agent** — simplify, remove duplication, ensure consistency with existing codebase

## Verify

```bash
cd packages/db && bun drizzle-kit generate
cd packages/db && bun run typecheck
```

## Commit

```
feat(delegation): add care_delegations and delegation_plants schema and migration
```
