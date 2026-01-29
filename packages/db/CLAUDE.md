# DB Package Architecture

This document describes the architecture and patterns specific to the database package.

> **Global rules** (Effect patterns, code conventions) are in the root `/CLAUDE.md`

## Schema Location

All database schemas are in `src/schema/`:

```
src/schema/
├── index.ts          # Re-exports all schemas
├── enums.ts          # PostgreSQL enum types
├── users.ts          # users table
├── auth.ts           # magic_links, refresh_tokens, rate_limits
├── plants.ts         # plants, plant_photos
├── plant-history.ts  # plant_history (care events)
├── care-logs.ts      # care_logs
├── notifications.ts  # notifications, device_tokens
├── achievements.ts   # user_achievements
├── chat.ts           # chat_messages
├── subscriptions.ts  # subscription_tiers, user_subscriptions, subscription_usage
└── dead-letter.ts    # dead_letter_messages
```

## Conventions

### Primary Keys

- Always use UUIDs for primary keys
- Use `uuid('id').primaryKey().defaultRandom()`

### Timestamps

Always include these timestamp columns:

```typescript
createdAt: timestamp('created_at', { withTimezone: true })
  .notNull()
  .defaultNow(),
updatedAt: timestamp('updated_at', { withTimezone: true })
  .notNull()
  .defaultNow()
  .$onUpdate(() => new Date()),
```

### Table Naming

- Use **snake_case** for table and column names in the database
- Use **camelCase** for the TypeScript property names (Drizzle handles mapping)

### Foreign Keys

Always define `onDelete` behavior:

```typescript
userId: uuid('user_id')
  .notNull()
  .references(() => users.id, { onDelete: 'cascade' }),
```

### Enums

Define PostgreSQL enums in `enums.ts`:

```typescript
export const userRoleEnum = pgEnum('user_role', ['user', 'admin'])
```

## Migration Workflow

```bash
bun run db:generate    # Generate migrations from schema changes
bun run db:push        # Push schema directly (dev only)
bun run db:migrate     # Run pending migrations (production)
bun run db:studio      # Open Drizzle Studio
```

## Relations

Define relations separately from table definitions:

```typescript
export const usersRelations = relations(users, ({ many }) => ({
  plants: many(plants),
  subscriptions: many(userSubscriptions),
}))

export const plantsRelations = relations(plants, ({ one, many }) => ({
  user: one(users, { fields: [plants.userId], references: [users.id] }),
  photos: many(plantPhotos),
}))
```
