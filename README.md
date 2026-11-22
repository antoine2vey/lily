<div align="center">

# 🌱 Lily

**Never let a houseplant die from neglect again.**

Lily gives every plant you own a personalized, species-aware care schedule. AI diagnosis, a 10,000-species camera scanner and smart reminders know your plant, your room and your local weather.

[![CI](https://github.com/antoine2vey/lily/actions/workflows/ci.yml/badge.svg)](https://github.com/antoine2vey/lily/actions/workflows/ci.yml)
[![License: AGPL v3](https://img.shields.io/badge/License-AGPL_v3-blue.svg)](LICENSE)
[![Bun](https://img.shields.io/badge/Bun-1.4.3-000?logo=bun&logoColor=white)](https://bun.sh)
[![TypeScript](https://img.shields.io/badge/TypeScript-7.0-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org)
[![Effect](https://img.shields.io/badge/Effect-4.0-5C2D91)](https://effect.website)
[![PRs welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](CONTRIBUTING.md)

</div>

## What is Lily

Lily is an iOS and Android plant care app for houseplant owners who keep killing their plants by forgetting them. Each plant gets a profile with its photo, species, room and health. It also gets a watering, fertilizing and misting schedule that sends push notifications based on the species, the room and local conditions. You identify plants with the camera, log care, and chat with an AI that knows the history of *your* plant when you ask about yellow leaves or root rot.

This repository is the whole TypeScript and Bun monorepo behind Lily: the backend, the mobile app, the marketing site, the admin dashboard and the AI services.

## Engineering highlights

If you are here to read code, these parts are worth a look.

- **Effect everywhere.** The backend, the mobile app, the web site and the admin dashboard are all built on [Effect](https://effect.website) 4. Errors are typed (`Schema.TaggedError`), dependencies are injected through layers, unions are matched exhaustively, and native JS shortcuts such as `arr.map`, `switch`, `??` and `new Date()` are replaced by Effect modules.
- **One contract for client and server.** [`shared`](packages/shared) defines the domain with Effect Schema. The API and every client import the same schemas, and the app derives its HTTP client from the API definition, so the compiler checks the wire contract.
- **Bounded contexts in the backend.** The care, reminders, canopy and absence contexts under [`packages/api/src/contexts`](packages/api/src/contexts) each own their tables, and an architecture test fails the build when one reaches into another.
- **Retrieval-grounded AI diagnosis.** [`knowledge-db`](packages/knowledge-db) is a pgvector knowledge base with 3,072-dimension `halfvec` embeddings and hybrid HNSW plus full-text search. It grounds each answer about a plant in retrieved care knowledge.
- **Native AR and ML scanning.** [`plant-scanner`](packages/plant-scanner) is an iOS Expo module that uses ARKit and TensorFlow Lite for on-device plant and pot detection, AR distance measurement and light estimation.
- **An MCP server for AI assistants.** [`mcp`](packages/mcp) exposes Lily to assistants such as ChatGPT over the Model Context Protocol, with OAuth 2.1 and HTML widgets.
- **Monorepo discipline.** Turborepo runs over Bun workspaces, Biome formats and lints, and TypeScript uses strict project references. Docs, lint, `tsc` and tests gate every push through the pre-push hook, and every pull request and push to `main` through CI.

## Packages

| Package | Description |
| --- | --- |
| [`api`](packages/api) | Effect backend on Bun with Postgres, Redis and schedulers |
| [`app`](packages/app) | React Native and Expo mobile app |
| [`web`](packages/web) | TanStack Start marketing site and blog in English and French, prerendered to static HTML |
| [`admin`](packages/admin) | Vite and React internal dashboard for operating Lily |
| [`shared`](packages/shared) | Effect Schema domain types, typed errors and service interfaces shared across packages |
| [`db`](packages/db) | Primary PostgreSQL schema, migrations and the Drizzle client wired into Effect |
| [`knowledge-db`](packages/knowledge-db) | pgvector knowledge base: Drizzle schema plus its Effect client layer |
| [`mcp`](packages/mcp) | MCP server that exposes Lily plant data and tools to AI clients |
| [`plant-scanner`](packages/plant-scanner) | iOS-only Expo native module for AR plant and pot scanning |

How the packages depend on each other, and which one owns each domain term, is in [`CONTEXT-MAP.md`](CONTEXT-MAP.md).

## Tech stack

Bun · TypeScript 7 with `@effect/tsgo` · Effect 4 · Turborepo · Biome · Vitest · Drizzle ORM · PostgreSQL with pgvector · Redis · Expo and React Native · React · TanStack Start · Vite. Exact versions are in each `package.json`.

## Quickstart

Run every command from the repository **root**. Turbo and Bun workspaces run each package's scripts, so you never `cd` into a package.

```bash
# 1. Start local infra. Name the services, because a bare `up` also starts
#    the compose `api` on port 3000, which `bun run dev` needs
docker compose up -d postgres postgres-test knowledge-db knowledge-db-test redis

# 2. Install all workspaces (also runs `prepare`: Husky hooks + `effect-tsgo patch`)
bun install

# 3. Provide env. A package script reads the .env in its own folder, and Turbo
#    passes nothing from the root, so link the root file into each package that reads it
cp .env.example .env
for p in api db knowledge-db mcp; do ln -s ../../.env packages/$p/.env; done

# 4. Apply the Drizzle schema to local Postgres
#    (a dev push; migrations are hand-authored, never generated)
bun run --filter=@lily/db db:push

# 5. (RAG and knowledge features only) Create the pgvector extension and apply
#    the knowledge-base migrations
bun run --filter=@lily/knowledge-db db:migrate:prod

# 6. Start everything in watch mode via Turbo
#    (the api serves at http://localhost:3000 with Swagger/OpenAPI). The web dev
#    server and mcp both use port 3001 by default, so set MCP_PORT and
#    MCP_SERVER_URL in .env to a free port first
bun run dev
```

**Moving from Postgres 15.** `postgres` and `postgres-test` now run `ghcr.io/railwayapp-templates/postgres-ssl:17`, the Postgres 17 image production runs, and keep their data in the new volumes `postgres17_data` and `postgres17_test_data`. A 15 data directory cannot start on 17, so the old volumes stay untouched. To keep local rows, `pg_dump` them before you switch. Then rebuild both databases:

```bash
docker compose up -d postgres postgres-test
bun run --filter=@lily/db db:push
bun run db:setup-test
```

Remove the old volumes once you no longer need them. `docker volume ls --filter name=postgres_` lists them.

**Prerequisites.** [Bun 1.4.3](https://bun.sh) and Docker. The local Postgres and Redis defaults in `.env.example` match `docker-compose.yml`, so the core stack works out of the box.

## Commands

| Command | What it does |
| --- | --- |
| `bun run dev` | Watch mode across every package that defines `dev` |
| `bun run build` | Build all packages |
| `bun run test` | Run unit tests across all packages |
| `bun run test:integration` | Run the `api` integration tests against a real Postgres (loads `.env.test.local`) |
| `bun run db:setup-test` | Provision the test database: apply the SQL migrations to `DATABASE_URL_TEST` and seed tiers |
| `bun run lint` | Biome lint and format check across all packages |
| `bun run lint:fix` | Biome lint with autofix across all packages |
| `bun run tsc` | TypeScript typecheck, also a CI and pre-push gate |
| `bun run tsc:build` | Exercise the full TypeScript project-reference build graph |
| `bun run clean` | Remove build artifacts across all packages |

Git hooks. `pre-commit` runs `lint:fix` and re-stages the files you had staged. `pre-push` runs `scripts/check-docs.sh`, `scripts/check-migrations.sh`, `lint`, `tsc`, then `test`.

## Architecture

The backend [`api`](packages/api) is built on Effect's `HttpApi`. It serves REST endpoints under `/api/v1`, with OpenAPI and Swagger, on a Bun HTTP runtime. Requests flow from endpoints to handlers, services and repositories. The core domain is split into bounded contexts that own their tables. The [`app`](packages/app), the [`admin`](packages/admin) dashboard and the [`mcp`](packages/mcp) server are HTTP clients of the api, and all three depend on [`shared`](packages/shared) for domain schemas and typed errors. [`db`](packages/db) owns the primary PostgreSQL schema through Drizzle.

For AI, [`knowledge-db`](packages/knowledge-db) is a *separate* pgvector PostgreSQL database of raw documents, processed chunks and ingest jobs. The api's chat service searches it to ground each answer about a plant in retrieved care knowledge. [`plant-scanner`](packages/plant-scanner) is a native Expo module that the app's add-plant flow uses for plant and pot detection, light, AR distance and photos. [`web`](packages/web) is the public marketing site. It calls the api only for invite previews.

```
app ────┐
admin ──┼─▶ api ─┬─▶ db            (primary state)
mcp ────┤        ├─▶ knowledge-db  (pgvector RAG)
web ────┘        └─▶ push          (notifications)

app ─▶ plant-scanner   (on-device scanning, iOS)
mcp ─▶ db              (its own OAuth tables)
```

How each package reaches production, from Railway deploys to OTA updates and store builds, is in [`docs/agents/releases.md`](docs/agents/releases.md).

## Conventions

- **Effect-first.** Use Effect modules everywhere. Native JS equivalents such as `arr.map`, `Object.keys`, `switch`, `??` and `new Date()` are not allowed. [`CODING_STANDARDS.md`](CODING_STANDARDS.md) has the full mapping.
- **Run from root.** All scripts go through Turbo from the monorepo root.
- **Drizzle, not Prisma.** Database access is Drizzle ORM through Effect. Migrations are **hand-authored SQL** in `packages/db/drizzle/`, and production applies them on each API deploy.
- **Typed errors.** Errors are tagged classes that travel through Effect and are handled by tag. Unions are matched with `Match.exhaustive`.
- **Monorepo discipline.** Every package except the Expo app `extends` the root `tsconfig.json`. The app extends `expo/tsconfig.base` and mirrors the root's strict flags. Every package declares `sideEffects` and pins the exact root `typescript` version. Use `@ts-expect-error` with a reason, never `@ts-ignore`.

The full coding rules are in [`CODING_STANDARDS.md`](CODING_STANDARDS.md), and the package rules are in [`docs/agents/monorepo.md`](docs/agents/monorepo.md).

## Contributing

Contributions are welcome. Start with [`CONTRIBUTING.md`](CONTRIBUTING.md) for the dev workflow, the coding conventions and the PR process. Please also read our [Code of Conduct](CODE_OF_CONDUCT.md).

- 🐛 **Found a bug?** [Open an issue](https://github.com/antoine2vey/lily/issues/new?template=bug_report.md).
- 💡 **Have an idea?** [Request a feature](https://github.com/antoine2vey/lily/issues/new?template=feature_request.md).
- 🔒 **Found a vulnerability?** Please report it privately. [`SECURITY.md`](SECURITY.md) explains how.

## License

Lily is licensed under the [GNU Affero General Public License v3.0](LICENSE). You are free to use, study, modify and share the code. If you run a modified version as a network service, you must make its source available under the same license.

## Docs

- [`CODING_STANDARDS.md`](CODING_STANDARDS.md) holds the Effect-first coding rules and points to each package's own rules.
- [`CLAUDE.md`](CLAUDE.md), also `AGENTS.md`, is the entry point for coding agents. Each package has its own `CLAUDE.md` too.
- [`CONTEXT-MAP.md`](CONTEXT-MAP.md) maps the packages, their relationships and each package's glossary.
- [`packages/README.md`](packages/README.md) lists the packages and how to add one.
- [`docs/agents/releases.md`](docs/agents/releases.md) explains deploys, migrations, OTA updates and store builds.
- [`packages/knowledge-db/README.md`](packages/knowledge-db/README.md) describes the knowledge base from ingest to search.
- [`docs/seo/strategy.md`](docs/seo/strategy.md) is the working SEO plan for the marketing site.
