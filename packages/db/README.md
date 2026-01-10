# Database Package

> PostgreSQL schema management using Drizzle ORM with Effect.js integration

## Overview

The database package manages the PostgreSQL schema, migrations, and database client configuration. It uses Drizzle ORM for type-safe database access and Effect.js for functional composition.

## Architecture

```
Schema Definitions (src/schema/) → Drizzle ORM → PostgreSQL
                                         ↓
                                   Migrations (drizzle/)
                                         ↓
                                   Applied to Database
```

## Project Structure

```
src/
├── schema/                     # Table definitions & relationships
│   ├── index.ts               # Schema aggregation point
│   ├── users.ts               # User accounts
│   ├── plants.ts              # Plant inventory
│   ├── auth.ts                # Authentication tables
│   ├── chat.ts                # AI chat messages
│   ├── notifications.ts       # Push notifications & device tokens
│   ├── achievements.ts        # Achievement/badge system
│   ├── subscriptions.ts       # Subscription tiers & usage tracking
│   ├── plant-history.ts       # Historical plant changes
│   ├── dead-letter.ts         # Failed events queue
│   └── enums.ts               # PostgreSQL enums
├── lib/                        # Database utilities
├── client.ts                   # Drizzle client setup
└── index.ts                    # Package exports

drizzle/                        # Migration files
├── 0001_*.sql                 # Initial schema
├── 0002_*.sql                 # Schema changes
├── ...
├── 0008_zippy_arachne.sql    # Latest migration (subscriptions)
└── meta/                       # Migration metadata
    ├── _journal.json          # Migration history
    └── 0008_snapshot.json     # Schema snapshot

scripts/                        # Database utilities
├── seed-admin.ts              # Create admin user
├── seed-subscription-tiers.ts # Seed free/paid tiers
├── setup-test-db.ts           # Initialize test database
└── list-users.ts              # List all users
```

## Database Schema

### Core Entities

#### Users (`users`)
Central entity for authentication and user management:
- **Fields**: id, email, name, role, status, emailVerified, image, bio, notifications preferences
- **Relations**: plants, sessions, accounts, achievements, subscription, notifications, device tokens
- **Enums**: role (user, admin), status (active, suspended, banned)

#### Plants (`plants`)
User's plant inventory:
- **Fields**: id, userId, name, species, description, health, watering/fertilizing schedules
- **Relations**: user, care logs, photos, AI chat messages
- **Enums**: health (healthy, needs_attention, critical)

#### Care Logs (`care_logs`)
Historical tracking of plant care:
- **Fields**: id, plantId, userId, type, notes, date, photoUrl
- **Relations**: plant, user
- **Types**: watering, fertilizing, repotting, pruning

### Authentication

#### Accounts (`accounts`)
OAuth/magic link authentication via better-auth:
- **Fields**: id, userId, provider, providerAccountId, tokens
- **Relations**: user

#### Sessions (`sessions`)
Active user sessions:
- **Fields**: id, userId, expiresAt, token
- **Relations**: user

### Features

#### Notifications (`notifications`)
Push notification queue:
- **Fields**: id, userId, plantId, type, title, body, status, scheduledFor, sentAt
- **Relations**: user, plant
- **Status**: pending, queued, sent, failed

#### Device Tokens (`device_tokens`)
Expo push notification tokens:
- **Fields**: id, userId, token, platform, isActive
- **Relations**: user
- **Platforms**: ios, android, web

#### Achievements (`user_achievements`)
Unlocked badges and milestones:
- **Fields**: id, userId, achievementId, unlockedAt
- **Relations**: user
- **Types**: FIRST_PLANT_ADDED, PLANT_COLLECTOR, WATERING_NOVICE, etc.

#### AI Chat (`chat_messages`)
Plant-specific AI conversations:
- **Fields**: id, plantId, userId, role, content, createdAt
- **Relations**: plant, user
- **Roles**: user, assistant

### Subscription System

#### Subscription Tiers (`subscription_tiers`)
**Static configuration table** (seeded, not modified by app):
- **Fields**: tier (free/paid), name, priceMonthly, feature limits (maxPlants, maxAiChatsMonthly, etc.)
- **Free Tier**: 5 plants, 10 AI chats/month, 5 card scans/month, 3 plant identifies/month
- **Paid Tier**: Unlimited (null values = unlimited)

#### User Subscriptions (`user_subscriptions`)
**Per-user subscription state**:
- **Fields**: userId, tier, status, trial dates, billing period, Stripe IDs, canceledAt
- **Relations**: user, subscription events, subscription usage
- **Status**: active, trialing, canceled, expired, past_due

#### Subscription Usage (`subscription_usage`)
**Monthly usage tracking** (resets each billing period):
- **Fields**: userId, periodStart, periodEnd, aiChatsCount, cardScansCount, plantIdentifiesCount
- **Relations**: user
- **Purpose**: Enforce tier limits on usage-based features

#### Subscription Events (`subscription_events`)
**Audit log** for subscription state changes:
- **Fields**: id, userId, event, metadata, timestamp
- **Relations**: user
- **Events**: subscription_started, subscription_canceled, tier_changed, payment_failed

### Infrastructure

#### Dead Letter Queue (`dead_letter`)
Failed background events:
- **Fields**: id, eventType, eventData, error, attempts, createdAt
- **Purpose**: Retry/analysis of failed event handling

## Migration Workflow

### Creating Migrations

1. **Modify schema** in `src/schema/*.ts`:
```typescript
export const myNewTable = pgTable('my_new_table', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
})
```

2. **Generate migration**:
```bash
bun run db:generate
```
This creates SQL migration files in `drizzle/` directory.

3. **Review migration**:
Check the generated SQL in `drizzle/000X_*.sql` to ensure it's correct.

4. **Apply migration**:
```bash
# Development - direct push (no migration file needed)
bun run db:push

# Production - run migrations
bun run db:migrate
```

### Rollback Strategy

Drizzle doesn't have built-in rollback. To rollback:
1. Restore database from backup
2. Or write a new migration that reverts the changes

## Seeding Data

### Admin User
```bash
bun run seed:admin
```
Creates admin user with credentials from environment variables.

### Subscription Tiers
```bash
bun run seed:tiers
```
Seeds free and paid tier configurations. **Run once per database**.

### Test Database
```bash
bun run db:setup-test
```
Pushes schema to test database and seeds initial data.

## Development Workflows

### Local Database Setup

1. **Start PostgreSQL**:
```bash
docker compose up -d postgres
```

2. **Apply schema**:
```bash
bun run db:push
```

3. **Seed data** (optional):
```bash
bun run seed:admin
bun run seed:tiers
```

4. **Explore with Drizzle Studio**:
```bash
bun run db:studio
```
Opens visual database explorer at `https://local.drizzle.studio`

### Test Database Setup

The project uses a separate test database to avoid polluting development data.

1. **Start test PostgreSQL**:
```bash
docker compose up -d postgres-test
```
Runs on port `5433` (vs dev on `5432`)

2. **Setup test schema**:
```bash
bun run db:setup-test
```
or from root:
```bash
bun run db:setup-test
```

3. **Environment variable**:
```bash
DATABASE_URL_TEST=postgresql://lily:lily123@localhost:5433/lily_test
```

### Schema Changes

Typical workflow for adding a new table:

1. **Create schema file** in `src/schema/my-table.ts`:
```typescript
import { pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'

export const myTable = pgTable('my_table', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
})
```

2. **Add relations** (if needed):
```typescript
import { relations } from 'drizzle-orm'

export const myTableRelations = relations(myTable, ({ one, many }) => ({
  user: one(users, {
    fields: [myTable.userId],
    references: [users.id],
  }),
}))
```

3. **Export from `src/schema/index.ts`**:
```typescript
export * from './my-table'
```

4. **Generate and apply migration**:
```bash
bun run db:generate
bun run db:push
```

5. **Update related table relations** (if needed)

## Common Tasks

### Adding a New Column

1. Modify table definition in schema file
2. Generate migration: `bun run db:generate`
3. Review SQL
4. Apply: `bun run db:push`

### Adding a Foreign Key

1. Add column with reference:
```typescript
userId: uuid('user_id').notNull().references(() => users.id),
```
2. Add relation:
```typescript
export const myTableRelations = relations(myTable, ({ one }) => ({
  user: one(users, {
    fields: [myTable.userId],
    references: [users.id],
  }),
}))
```
3. Generate and apply migration

### Creating an Index

```typescript
export const myTable = pgTable('my_table', {
  // columns
}, (table) => ({
  userIdIdx: index('my_table_user_id_idx').on(table.userId),
  emailIdx: uniqueIndex('my_table_email_idx').on(table.email),
}))
```

### Using Enums

**Option 1: PostgreSQL Enum** (recommended for shared enums):
```typescript
import { pgEnum } from 'drizzle-orm/pg-core'

export const myStatusEnum = pgEnum('my_status', ['active', 'inactive'])

export const myTable = pgTable('my_table', {
  status: myStatusEnum('status').notNull().default('active'),
})
```

**Option 2: Literal Type** (simple cases):
```typescript
import { text } from 'drizzle-orm/pg-core'

export const myTable = pgTable('my_table', {
  status: text('status', { enum: ['active', 'inactive'] }).notNull(),
})
```

## Database Patterns

### UUIDs for Primary Keys
All tables use UUID v4 for primary keys:
```typescript
id: uuid('id').primaryKey().defaultRandom()
```

### Timestamps
All tables include creation and update timestamps:
```typescript
createdAt: timestamp('created_at').notNull().defaultNow(),
updatedAt: timestamp('updated_at').notNull().defaultNow(),
```

### Soft Deletes
Some tables use `deletedAt` for soft deletes:
```typescript
deletedAt: timestamp('deleted_at'),
```

### Nullable Foreign Keys
Optional relationships use `.references()` without `.notNull()`:
```typescript
plantId: uuid('plant_id').references(() => plants.id), // Can be null
```

## Related Documentation

- [Root README](../../README.md) - Project overview
- [CLAUDE.md](../../CLAUDE.md) - Repository pattern usage
- [API Package](../api/README.md) - How repositories use this schema
- [Schema Guide](./src/schema/README.md) - Detailed schema patterns
- [Drizzle ORM Docs](https://orm.drizzle.team) - Official Drizzle documentation

## Quick Reference

### Commands
```bash
bun run db:generate         # Generate migration from schema changes
bun run db:push             # Push schema directly (dev)
bun run db:migrate          # Run pending migrations (prod)
bun run db:studio           # Open Drizzle Studio
bun run seed:admin          # Seed admin user
bun run seed:tiers          # Seed subscription tiers
bun run db:setup-test       # Setup test database
```

### Connection Strings
```bash
# Development
DATABASE_URL=postgresql://lily:lily123@localhost:5432/lily

# Test
DATABASE_URL_TEST=postgresql://lily:lily123@localhost:5433/lily_test
```

### Key Files
- `src/schema/index.ts` - Schema exports
- `src/client.ts` - Drizzle client configuration
- `drizzle/meta/_journal.json` - Migration history
- `drizzle.config.ts` - Drizzle kit configuration
