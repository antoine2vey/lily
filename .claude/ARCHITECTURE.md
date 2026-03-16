# Lily Architecture Map

## Monorepo

```
packages/
├── api/            # Backend (Effect Platform) — entry: src/index.ts
├── db/             # Drizzle ORM — entry: src/index.ts
├── shared/         # Types, schemas, utils — entry: src/index.ts
├── app/            # React Native (Expo) — entry: src/App.tsx
├── web/            # Next.js marketing site (static export, i18n en/fr)
├── admin/          # Admin dashboard (Vite + React 19)
├── mcp/            # MCP server (@effect/ai, @effect/rpc)
└── knowledge-db/   # Pgvector knowledge base for RAG
```

## API Services (`packages/api/src/services/`)

### HTTP Domains (21 — each has `api.ts` + `handlers.ts`)

achievements, admin, ai-chat, auth, care-logs, care-tasks, delegation, device-tokens, diagnosis, health, internal, knowledge, knowledge-ingestion, notifications, plants, rooms, social, subscriptions, user, username, weather

### Background Schedulers (10 — all use `createScheduler`)

health (1h), overdue (1h), notification (1m), engagement (1h), weather (1h), delegation (5m), tips (1h), blog-generator (4h), achievement (12h), knowledge-ingestion (30s)

### Infrastructure Services (no `api.ts`)

ai, email, event-bus, jwt, message-queue, push, rag, rate-limiter

## Repositories (24 — `packages/api/src/repositories/`)

achievement, blog-post, care-log, care-schedule, chat, daily-tip, dead-letter, delegation, device-token, diagnosis, engagement, follow, ingest-job, magic-link, notification, plant, processed-chunk, raw-document, refresh-token, room, scan, subscription, user, weather

## Database Schema (20 — `packages/db/src/schema/`)

achievements, auth, blog-posts, care-schedules, chat, daily-tips, dead-letter, delegation, diagnoses, enums, notifications, oauth, plant-history, plants, rooms, social, subscriptions, users, weather

## Shared Domains (21 — `packages/shared/src/domains/`)

achievement, admin, ai-chat, auth, care, care-log, care-task, common (errors, pagination, dates), delegation, device-token, diagnosis, knowledge, knowledge-ingestion, notification, plant, room, social, subscriptions, user, username, weather

## Quick Reference

| To find... | Search pattern |
|------------|----------------|
| Endpoints | `services/{domain}/endpoints/*.ts` |
| API defs | `services/{domain}/api.ts` |
| Handlers | `services/{domain}/handlers.ts` |
| Repos | `repositories/{domain}.repository.ts` |
| Schemas | `shared/src/domains/{domain}/schema.ts` |
| DB tables | `db/src/schema/{table}.ts` |
| Tests | `__tests__/services/{domain}/*.test.ts` |
| Mocks | `__tests__/mocks/{domain}.*.ts` |
