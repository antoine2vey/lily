<div align="center">

# 🌱 Lily

**Never let a houseplant die from neglect again.**

Lily gives every plant you own a personalized, species-aware care schedule — backed by AI diagnosis, a 10,000-species camera scanner, and smart reminders that know your plant, your room, and your local weather.

[![CI](https://github.com/antoine2vey/lily/actions/workflows/ci.yml/badge.svg)](https://github.com/antoine2vey/lily/actions/workflows/ci.yml)
[![License: AGPL v3](https://img.shields.io/badge/License-AGPL_v3-blue.svg)](LICENSE)
[![Bun](https://img.shields.io/badge/Bun-1.3.8-000?logo=bun&logoColor=white)](https://bun.sh)
[![TypeScript](https://img.shields.io/badge/TypeScript-6.0-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org)
[![Effect](https://img.shields.io/badge/Effect-3.19-5C2D91)](https://effect.website)
[![PRs welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](CONTRIBUTING.md)

</div>

## What is Lily

Lily is a cross-platform (iOS/Android) plant-care app for houseplant owners who keep killing their plants by forgetting to care for them. Each plant gets its own profile — photo, species, room, health — plus a personalized watering, fertilizing, and misting schedule that fires push notifications based on species, location, and local conditions. You identify plants with the camera (10,000+ species), log care actions, and chat with an AI that has full context on *your* specific plant for diagnosis like yellowing leaves or root rot.

This repository is the full TypeScript/Bun monorepo behind Lily: backend, mobile app, marketing site, admin dashboard, and supporting AI services.

## Engineering highlights

If you're here to read code, these are the parts worth a look:

- **Effect-first, end to end.** The entire stack — backend, mobile app, web, admin — is built on [Effect](https://effect.website) 3.x. Typed errors (`Schema.TaggedError`), dependency injection via layers, and `Match.exhaustive` over union types, with native JS escape hatches (`Array.map`, `switch`, `??`, `new Date()`) deliberately avoided.
- **Type-safe client/server contract.** [`shared`](packages/shared) defines the domain with Effect Schema; both the API and its clients import the same schemas, so the wire contract is checked at compile time.
- **RAG-grounded AI diagnosis.** [`knowledge-db`](packages/knowledge-db) is a pgvector knowledge base (3,072-dim `halfvec` embeddings, HNSW + full-text hybrid search) that grounds per-plant AI answers in retrieved care knowledge.
- **Native AR/ML scanning.** [`plant-scanner`](packages/plant-scanner) is an iOS Expo native module using ARKit + TensorFlow Lite for on-device plant/pot detection, AR distance measurement, and ambient-light (lux) estimation.
- **Agentic MCP server.** [`mcp`](packages/mcp) exposes Lily to AI assistants (ChatGPT) over the Model Context Protocol with OAuth 2.1 and rich HTML widgets.
- **Monorepo discipline.** Turborepo over Bun workspaces, Biome for format + lint, strict TypeScript project references, and CI gates (`tsc` + `lint` + `test`) enforced on every push.

## Packages

| Package | Description |
| --- | --- |
| [`api`](packages/api) | Effect-based backend API server on Bun with Postgres, Redis, and schedulers |
| [`app`](packages/app) | React Native (Expo) mobile app for plant care management |
| [`web`](packages/web) | Next.js 16 static-export marketing site with i18n (en/fr) and an MDX blog |
| [`admin`](packages/admin) | Vite + React 19 internal admin dashboard for operating Lily |
| [`shared`](packages/shared) | Effect Schema domain types, typed errors, and service interfaces shared across packages |
| [`db`](packages/db) | Primary PostgreSQL schema, migrations, and Drizzle client wired into Effect |
| [`knowledge-db`](packages/knowledge-db) | Pgvector RAG knowledge base: Drizzle schema plus Effect Postgres client layer |
| [`mcp`](packages/mcp) | MCP server exposing Lily plant data and tools to AI clients |
| [`plant-scanner`](packages/plant-scanner) | iOS-only Expo native module for AR plant/pot scanning and measurement |

## Tech stack

Bun 1.3.8 · TypeScript ^6.0 · Effect 3.19 · Turborepo ^2.8 · Biome 2.1 · `@effect/platform` 0.94 · Drizzle ORM ^0.45 · PostgreSQL 15 + pgvector (pg17) · Redis 7 · Expo ~54 / React Native 0.81 · React 19.1 · Next.js ^16 · Vite ^6

## Quickstart

All commands run from the repository **root** — never `cd` into a package (Turbo + Bun workspaces handle per-package execution).

```bash
# 1. Start local infra: postgres, postgres-test, knowledge-db, knowledge-db-test, redis
docker compose up -d

# 2. Install all workspaces (also runs `prepare`: Husky hooks + effect-language-service patch)
bun install

# 3. Provide env: copy the example and fill in the blanks
cp .env.example .env

# 4. Apply the Drizzle schema to local Postgres
#    (dev push — do NOT run `drizzle-kit generate`; migrations are hand-authored)
bun run --filter=@lily/db db:push

# 5. (RAG/knowledge features only) Apply the pgvector knowledge-base schema
bun run --filter=@lily/knowledge-db db:push

# 6. Start everything in watch mode via Turbo
#    (api serves at http://localhost:3000 with Swagger/OpenAPI)
bun run dev
```

**Prerequisites:** [Bun 1.3.8](https://bun.sh) and Docker. The local Postgres/Redis defaults in `.env.example` match `docker-compose.yml`, so the core stack works out of the box.

## Commands

| Command | What it does |
| --- | --- |
| `bun run dev` | Watch mode across all packages that define `dev` (Turbo, persistent) |
| `bun run build` | Build all packages |
| `bun run test` | Run unit tests across all packages (Vitest in `api`/`shared`/`mcp`) |
| `bun run test:integration` | Run `api` integration tests against a real Postgres (loads `.env.test.local`) |
| `bun run db:setup-test` | Provision the test database (push to `DATABASE_URL_TEST` + setup script) |
| `bun run lint` | Biome lint/check across all packages |
| `bun run lint:fix` | Biome lint + autofix across all packages |
| `bun run tsc` | TypeScript typecheck (`tsc --noEmit`) — CI + pre-push gate |
| `bun run tsc:build` | Exercise the full TypeScript project-reference (composite) build graph |
| `bun run clean` | Remove build artifacts across all packages |

Git hooks: `pre-commit` runs `lint:fix` on staged files; `pre-push` runs `lint`, `tsc`, then `test`.

## Architecture

Lily is a TypeScript/Bun monorepo on Effect 3.x, orchestrated by Turborepo over Bun workspaces. The backend [`api`](packages/api) is built on Effect Platform (`HttpApi`/`HttpApiBuilder`) serving REST endpoints with OpenAPI/Swagger on a Bun HTTP runtime (port 3000), layered as endpoints → handlers → services → repositories. The [`app`](packages/app) (React Native/Expo) and [`admin`](packages/admin) dashboard are the two HTTP clients; both depend on [`shared`](packages/shared) for domain schemas, types, and typed errors so the client/server contract stays type-safe. [`db`](packages/db) owns the primary PostgreSQL schema via Drizzle, which `api` reads and writes through the `PgDrizzle` repository layer.

For AI: [`knowledge-db`](packages/knowledge-db) is a *separate* pgvector PostgreSQL database (raw documents → processed chunks → ingest jobs) exposed via its own `KnowledgeDrizzle` tag; `api`'s ai-chat service queries it with vector similarity search to ground per-plant diagnosis in retrieved care knowledge. [`plant-scanner`](packages/plant-scanner) is a native Expo module consumed by the app's add-plant flow (plant/pot detection, lux, AR distance, captured photos). [`mcp`](packages/mcp) is a standalone Effect MCP server that calls `api` over HTTP to expose agentic tools (list-plants, get-care-tasks, ask-plant-question, …). [`web`](packages/web) is the public Next.js marketing funnel, decoupled from the runtime backend.

```
app / plant-scanner ─┐
                     ├─▶ api ─┬─▶ db            (primary state)
admin ───────────────┘        ├─▶ knowledge-db  (pgvector RAG)
                              └─▶ push           (notifications)
mcp ─────────────────▶ api
web  (static marketing, no runtime backend)
```

## Conventions

- **Effect-first.** Use Effect modules everywhere; native JS equivalents (`arr.map`, `Object.keys`, `switch`, `??`, `new Date()`, …) are forbidden. See [`CLAUDE.md`](CLAUDE.md) for the full mapping.
- **Run from root.** Never `cd` into a package — all scripts go through Turbo from the monorepo root.
- **Drizzle, not Prisma.** Database access is Drizzle ORM via `@effect/sql-drizzle`. Migrations are **hand-authored SQL** (`packages/db/drizzle/`); never run `drizzle-kit generate` (the journal is intentionally out of sync). Prod migrations run via `db:migrate:prod`.
- **Typed errors.** Errors are `Schema.TaggedError` propagated through the Effect system and handled by tag — never `catchAll`. Union types use `Match.exhaustive`.
- **Monorepo discipline.** Every package `extends` the root `tsconfig.json`, declares `sideEffects`, and pins the exact root `typescript` version. Use `@ts-expect-error` (with a rationale), never `@ts-ignore`.

Full rules and rationale live in [`CLAUDE.md`](CLAUDE.md).

## Contributing

Contributions are welcome! Start with [`CONTRIBUTING.md`](CONTRIBUTING.md) for the dev workflow, coding conventions, and PR process. Please also read our [Code of Conduct](CODE_OF_CONDUCT.md).

- 🐛 **Found a bug?** [Open an issue](https://github.com/antoine2vey/lily/issues/new?template=bug_report.md).
- 💡 **Have an idea?** [Request a feature](https://github.com/antoine2vey/lily/issues/new?template=feature_request.md).
- 🔒 **Found a vulnerability?** Please report it privately — see [`SECURITY.md`](SECURITY.md).

## License

Lily is licensed under the [GNU Affero General Public License v3.0](LICENSE). In short: you're free to use, study, modify, and share the code, but if you run a modified version as a network service you must make your source available under the same license.

## Docs

- [`CLAUDE.md`](CLAUDE.md) — authoritative project overview: package list, Effect-first coding rules, monorepo discipline, and commands.
- [`packages/api/README.md`](packages/api/README.md) — backend request flow and the endpoints → handlers → services → repositories layering.
- [`packages/db/README.md`](packages/db/README.md) — primary PostgreSQL schema map (users, plants, auth, chat, notifications, achievements).
- [`packages/shared/README.md`](packages/shared/README.md) — the domain model and cross-package contract: schemas, validation, and typed errors.
- [`docs/knowledge-pipeline-architecture.md`](docs/knowledge-pipeline-architecture.md) — design of the pgvector knowledge-db RAG pipeline (ingest → chunk → embed → retrieve).
- [`docs/rag-implementation-plan.md`](docs/rag-implementation-plan.md) — RAG implementation plan backing the `api` ai-chat grounding.
- [`docs/agents/domain.md`](docs/agents/domain.md) — convention for the `CONTEXT-MAP.md` / per-package `CONTEXT.md` + `docs/adr` layout.
