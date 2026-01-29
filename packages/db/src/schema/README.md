# Database Schema

> PostgreSQL table definitions and relationships using Drizzle ORM

## Overview

The schema directory contains all PostgreSQL table definitions, enums, and relationships for the Lily application. Each schema file represents a logical grouping of related tables, and all schemas are aggregated in `index.ts` for easy importing.

## Schema Organization

```
schema/
├── index.ts                # Aggregates all schemas
├── enums.ts                # PostgreSQL enums (roles, statuses)
├── users.ts                # User accounts & relationships
├── plants.ts               # Plant inventory
├── auth.ts                 # Authentication (accounts, sessions)
├── chat.ts                 # AI chat messages
├── notifications.ts        # Push notifications & device tokens
├── achievements.ts         # User achievements
├── subscriptions.ts        # Billing, tiers, usage tracking
├── plant-history.ts        # Historical plant changes
└── dead-letter.ts          # Failed background events
```

## 10 Schema Files

### Core Entities

#### **users.ts** - User Accounts
**Tables**:
- `users`: User profiles with role and status

**Relations**:
- One-to-many: plants, notifications, device tokens, sessions, accounts, achievements
- One-to-one: subscription
- One-to-many: subscription usage, subscription events

**Key Fields**:
- `role`: user | admin (enum)
- `status`: active | suspended | banned (enum)
- `emailVerified`: boolean
- Notification preferences (JSON)

#### **plants.ts** - Plant Inventory
**Tables**:
- `plants`: User plant collection
- `plant_photos`: Photo gallery per plant
- `care_logs`: Care history (watering, fertilizing, etc.)

**Relations**:
- Many-to-one: user
- One-to-many: photos, care logs, chat messages

**Key Fields**:
- `health`: healthy | needs_attention | critical (enum)
- Watering/fertilizing schedules
- Last/next care dates

### Authentication

#### **auth.ts** - Authentication Tables
**Tables**:
- `accounts`: OAuth/magic link accounts (better-auth)
- `sessions`: Active user sessions

**Relations**:
- Many-to-one: user

**Purpose**: Managed by better-auth library

### Features

#### **chat.ts** - AI Conversations
**Tables**:
- `chat_messages`: Plant-specific AI chat history

**Relations**:
- Many-to-one: plant, user

**Key Fields**:
- `role`: user | assistant (enum)
- `content`: Message text

#### **notifications.ts** - Push Notifications
**Tables**:
- `notifications`: Notification queue
- `device_tokens`: Registered devices for push

**Relations**:
- Many-to-one: user, plant (optional)

**Key Fields**:
- `status`: pending | queued | sent | failed (enum)
- `scheduledFor`: Delivery timestamp
- `platform`: ios | android | web (for device tokens)

#### **achievements.ts** - Gamification
**Tables**:
- `user_achievements`: Unlocked achievements per user

**Relations**:
- Many-to-one: user

**Key Fields**:
- `achievementId`: FIRST_PLANT_ADDED, PLANT_COLLECTOR, etc.
- `unlockedAt`: Timestamp

#### **subscriptions.ts** - Billing System
**Tables**:
- `subscription_tiers`: Tier configuration (free/paid)
- `user_subscriptions`: Per-user subscription state
- `subscription_usage`: Monthly usage tracking
- `subscription_events`: Audit log

**Relations**:
- subscription_tiers: Static configuration (seeded)
- user_subscriptions: One-to-one with user
- subscription_usage: Many-to-one with user
- subscription_events: Many-to-one with user

**Key Fields**:
- Tier limits (maxPlants, maxAiChatsMonthly, etc.)
- Subscription status (active, trialing, canceled, etc.)
- Usage counters (aiChatsCount, cardScansCount, etc.)

### Infrastructure

#### **plant-history.ts** - Change Tracking
**Tables**:
- `plant_history`: Historical snapshots of plant changes

**Purpose**: Future feature for change tracking

#### **dead-letter.ts** - Failed Events
**Tables**:
- `dead_letter`: Failed background event processing

**Purpose**: Capture failures for retry/debugging

## Drizzle Patterns

### Table Definition

```typescript
import { pgTable, uuid, text, timestamp } from 'drizzle-orm/pg-core'

export const myTable = pgTable('my_table', {
  // Primary key (UUID)
  id: uuid('id').primaryKey().defaultRandom(),

  // Text columns
  name: text('name').notNull(),
  description: text('description'),  // Nullable by default

  // Foreign keys
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id),

  // Timestamps
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
})
```

### Relations

```typescript
import { relations } from 'drizzle-orm'

export const myTableRelations = relations(myTable, ({ one, many }) => ({
  // Many-to-one (this table has userId → users.id)
  user: one(users, {
    fields: [myTable.userId],
    references: [users.id],
  }),

  // One-to-many (other table has myTableId → this table.id)
  children: many(childTable),
}))
```

### Enums

```typescript
import { pgEnum } from 'drizzle-orm/pg-core'

// PostgreSQL enum (recommended for shared enums)
export const myStatusEnum = pgEnum('my_status', [
  'active',
  'inactive',
  'pending',
])

export const myTable = pgTable('my_table', {
  status: myStatusEnum('status').notNull().default('pending'),
})
```

Or use text literals:

```typescript
export const myTable = pgTable('my_table', {
  status: text('status', { enum: ['active', 'inactive', 'pending'] })
    .notNull()
    .default('pending'),
})
```

### Indexes

```typescript
export const myTable = pgTable('my_table', {
  // columns
}, (table) => ({
  // Single column index
  userIdIdx: index('my_table_user_id_idx').on(table.userId),

  // Unique index
  emailIdx: uniqueIndex('my_table_email_idx').on(table.email),

  // Composite index
  userStatusIdx: index('my_table_user_status_idx').on(
    table.userId,
    table.status
  ),
}))
```

## Schema Conventions

### Primary Keys
All tables use UUID v4:
```typescript
id: uuid('id').primaryKey().defaultRandom()
```

### Timestamps
All tables include created/updated timestamps:
```typescript
createdAt: timestamp('created_at').notNull().defaultNow(),
updatedAt: timestamp('updated_at').notNull().defaultNow(),
```

### Foreign Keys
Reference related tables:
```typescript
userId: uuid('user_id')
  .notNull()
  .references(() => users.id)
```

Optional foreign keys:
```typescript
plantId: uuid('plant_id').references(() => plants.id)  // Can be null
```

### Nullable vs Not Null
```typescript
name: text('name').notNull(),        // Required
description: text('description'),     // Optional (nullable by default)
```

### Soft Deletes
Some tables use `deletedAt` for soft deletion:
```typescript
deletedAt: timestamp('deleted_at')
```

Query pattern:
```typescript
.where(isNull(table.deletedAt))  // Only non-deleted records
```

## Example Schema: Subscriptions

### File: subscriptions.ts

```typescript
import { pgTable, uuid, text, integer, timestamp, boolean } from 'drizzle-orm/pg-core'
import { relations } from 'drizzle-orm'
import { users } from './users'

// Tier configuration (static, seeded data)
export const subscriptionTiers = pgTable('subscription_tiers', {
  tier: text('tier', { enum: ['free', 'paid'] }).primaryKey(),
  name: text('name').notNull(),
  priceMonthly: integer('price_monthly').notNull(),
  // null = unlimited
  maxPlants: integer('max_plants'),
  maxAiChatsMonthly: integer('max_ai_chats_monthly'),
  maxCardScansMonthly: integer('max_card_scans_monthly'),
  maxPlantIdentifiesMonthly: integer('max_plant_identifies_monthly'),
})

// User subscription state
export const userSubscriptions = pgTable('user_subscriptions', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id).unique(),
  tier: text('tier', { enum: ['free', 'paid'] }).notNull().default('free'),
  status: text('status', {
    enum: ['active', 'trialing', 'canceled', 'expired', 'past_due'],
  }).notNull().default('active'),

  // Trial period
  trialStartsAt: timestamp('trial_starts_at'),
  trialEndsAt: timestamp('trial_ends_at'),

  // Billing period
  currentPeriodStart: timestamp('current_period_start').notNull(),
  currentPeriodEnd: timestamp('current_period_end').notNull(),

  // RevenueCat integration
  externalSubscriptionId: text('external_subscription_id'),
  externalCustomerId: text('external_customer_id'),
  provider: text('provider').default('revenuecat'),

  // Cancellation
  canceledAt: timestamp('canceled_at'),

  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
})

// Monthly usage tracking
export const subscriptionUsage = pgTable('subscription_usage', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id),

  // Billing period
  periodStart: timestamp('period_start').notNull(),
  periodEnd: timestamp('period_end').notNull(),

  // Usage counters (reset each period)
  aiChatsCount: integer('ai_chats_count').notNull().default(0),
  cardScansCount: integer('card_scans_count').notNull().default(0),
  plantIdentifiesCount: integer('plant_identifies_count').notNull().default(0),

  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
})

// Subscription event audit log
export const subscriptionEvents = pgTable('subscription_events', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id),
  event: text('event').notNull(),  // subscription_started, subscription_canceled, etc.
  metadata: text('metadata'),      // JSON metadata
  createdAt: timestamp('created_at').notNull().defaultNow(),
})

// Relations
export const userSubscriptionsRelations = relations(
  userSubscriptions,
  ({ one, many }) => ({
    user: one(users, {
      fields: [userSubscriptions.userId],
      references: [users.id],
    }),
    usage: many(subscriptionUsage),
    events: many(subscriptionEvents),
  })
)

export const subscriptionUsageRelations = relations(
  subscriptionUsage,
  ({ one }) => ({
    user: one(users, {
      fields: [subscriptionUsage.userId],
      references: [users.id],
    }),
  })
)

export const subscriptionEventsRelations = relations(
  subscriptionEvents,
  ({ one }) => ({
    user: one(users, {
      fields: [subscriptionEvents.userId],
      references: [users.id],
    }),
  })
)
```

## Adding a New Table

### Step 1: Create Schema File

Create new file or add to existing schema file:

```typescript
// schema/my-feature.ts
import { pgTable, uuid, text, timestamp } from 'drizzle-orm/pg-core'

export const myFeature = pgTable('my_feature', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id),
  name: text('name').notNull(),
  description: text('description'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
})
```

### Step 2: Add Relations

```typescript
import { relations } from 'drizzle-orm'

export const myFeatureRelations = relations(myFeature, ({ one }) => ({
  user: one(users, {
    fields: [myFeature.userId],
    references: [users.id],
  }),
}))
```

### Step 3: Update User Relations

In `users.ts`, add relation:

```typescript
export const usersRelations = relations(users, ({ many, one }) => ({
  // ... existing relations
  myFeatures: many(myFeature),  // Add new relation
}))
```

### Step 4: Export from index.ts

```typescript
// schema/index.ts
export * from './my-feature'
```

### Step 5: Generate Migration

```bash
cd packages/db
bun run db:generate
```

Review the generated SQL in `drizzle/000X_*.sql`.

### Step 6: Apply Migration

```bash
bun run db:push
```

## Migration Workflow

### Development (Schema Push)

Direct schema push for rapid iteration:

```bash
bun run db:push
```

Applies schema changes directly to database without creating migration files.

### Production (Migrations)

Versioned migrations for production:

1. **Generate migration**:
```bash
bun run db:generate
```

2. **Review migration SQL**:
```bash
cat drizzle/000X_*.sql
```

3. **Apply migration**:
```bash
bun run db:migrate
```

### Migration Files

Located in `packages/db/drizzle/`:
- `0001_initial.sql` - Initial schema
- `0002_add_notifications.sql` - Add notifications table
- ...
- `0008_zippy_arachne.sql` - Latest (subscription system)

### Rollback

Drizzle doesn't have built-in rollback. Options:
1. Restore from database backup
2. Write reverse migration manually
3. Use database transaction snapshots

## Schema Best Practices

1. **UUIDs for IDs**: Always use `uuid().defaultRandom()` for primary keys
2. **Timestamps**: Include createdAt/updatedAt on all tables
3. **Foreign Keys**: Use `.references()` for relationships
4. **Not Null**: Be explicit with `.notNull()` for required fields
5. **Enums**: Use pgEnum for shared enums, text literals for table-specific
6. **Indexes**: Add indexes on foreign keys and frequently queried columns
7. **Unique Constraints**: Use `.unique()` for one-to-one relationships
8. **Defaults**: Set sensible defaults with `.default()`
9. **Relations**: Define both sides of relationships
10. **Naming**: Use snake_case for column names (PostgreSQL convention)

## Common Patterns

### One-to-Many

```typescript
// Parent table
export const users = pgTable('users', { /* ... */ })

// Child table
export const plants = pgTable('plants', {
  userId: uuid('user_id').notNull().references(() => users.id),
  // ...
})

// Relations
export const usersRelations = relations(users, ({ many }) => ({
  plants: many(plants),  // User has many plants
}))

export const plantsRelations = relations(plants, ({ one }) => ({
  user: one(users, {     // Plant belongs to one user
    fields: [plants.userId],
    references: [users.id],
  }),
}))
```

### One-to-One

```typescript
export const userSubscriptions = pgTable('user_subscriptions', {
  userId: uuid('user_id').notNull().references(() => users.id).unique(),  // Unique!
  // ...
})

export const usersRelations = relations(users, ({ one }) => ({
  subscription: one(userSubscriptions),  // User has one subscription
}))
```

### Many-to-Many (Junction Table)

```typescript
// Not yet implemented in Lily, but pattern:
export const plantTags = pgTable('plant_tags', {
  plantId: uuid('plant_id').notNull().references(() => plants.id),
  tagId: uuid('tag_id').notNull().references(() => tags.id),
}, (table) => ({
  pk: primaryKey(table.plantId, table.tagId),  // Composite primary key
}))
```

### Soft Delete

```typescript
export const myTable = pgTable('my_table', {
  // ...
  deletedAt: timestamp('deleted_at'),
})

// Query only non-deleted
db.select().from(myTable).where(isNull(myTable.deletedAt))
```

## Type Inference

Drizzle provides type inference:

```typescript
// Infer select type (database result)
type User = typeof users.$inferSelect

// Infer insert type (for inserts)
type NewUser = typeof users.$inferInsert

// Use in repository
export interface IUserRepository {
  create: (data: typeof users.$inferInsert) => Effect.Effect<User, SqlError>
}
```

## Related Documentation

- [Database Package README](../../README.md) - Schema overview & migrations
- [CLAUDE.md](../../../../CLAUDE.md) - Repository patterns
- [Repositories](../../../api/src/repositories/README.md) - How repositories use schemas
- [Drizzle ORM Docs](https://orm.drizzle.team) - Official documentation

## Quick Reference

### Table Definition
```typescript
export const myTable = pgTable('my_table', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
})
```

### Relations
```typescript
export const myTableRelations = relations(myTable, ({ one, many }) => ({
  parent: one(parentTable, { fields: [...], references: [...] }),
  children: many(childTable),
}))
```

### Common Column Types
```typescript
uuid('id')                    // UUID
text('name')                  // Text
integer('count')              // Integer
boolean('is_active')          // Boolean
timestamp('created_at')       // Timestamp
text('status', { enum: [] })  // Enum (text)
pgEnum('status', [])          // Enum (PostgreSQL)
```

### Constraints
```typescript
.notNull()                    // Required
.unique()                     // Unique constraint
.default(value)               // Default value
.references(() => table.id)   // Foreign key
.primaryKey()                 // Primary key
```

### Commands
```bash
bun run db:generate           # Generate migration
bun run db:push               # Push schema (dev)
bun run db:migrate            # Run migrations (prod)
bun run db:studio             # Open Drizzle Studio
```
