# Lily - Coding Rules

Plant care app. TypeScript monorepo (Bun 1.3.8, Effect 4.0.0):

- **api** — Backend API server (`effect/http-api`, `@effect/platform-bun`)
- **db** — Drizzle ORM schema and migrations (PostgreSQL)
- **shared** — Shared types, schemas, and utilities
- **app** — React Native mobile app (Expo 54, React Native 0.81)
- **web** — Marketing site (Next.js 16, static export, i18n en/fr)
- **admin** — Admin dashboard (Vite + React 19)
- **mcp** — Model Context Protocol server (`effect/ai` McpServer)
- **knowledge-db** — Pgvector knowledge base for RAG
- **plant-scanner** — iOS-only Expo native AR/ML scanning module

## Imports

- **App package**: always use `@/` alias (never relative or bare `src/`)
- **Cross-package**: use package name (`@lily/shared`, `@lily/api`)

## Effect-First Rules (MANDATORY)

Use Effect modules for everything. Native JS equivalents are **forbidden**:

- `arr.map/filter/reduce/find/some/every/includes/flat/flatMap` → `Array.*`
- `arr[0]` → `Array.head` (returns `Option`), `arr.find` → `Array.findFirst`
- `Object.keys/values/entries` → `Record.keys/values/toEntries`
- `switch` → `Match.type<T>().pipe(Match.when(...), Match.exhaustive)`
- `x ?? y` → `Option.getOrElse`, `x ? a : b` (null check) → `Option.match`
- Nested ternaries → `Match.value().pipe(Match.when(...), Match.orElse(...))`
- `str.toUpperCase/includes/split` → `String.*`
- `new Date()` → `DateTime.nowUnsafe()`, `new Date(iso)` → `DateTime.make()`
- `DateTime.make/makeUnsafe` parts use singular keys (`hour`, `minute`, `second`, `millisecond`). Plural v3 keys (`hours`, ...) typecheck but are silently dropped
- Date math → `DateTime.distance` (returns a `Duration`), `Duration` module, `DateTime.toParts`
- `x == null ? none : some(x)` → `Option.fromNullishOr`

Shared date utilities available in `@lily/shared`: `parseApiDate`, `now`, `nowAsDate`, `daysUntil`, `isOverdue`, `isFuture`, etc.

## Key Rules

1. **Never use userId path params** — use `CurrentUser` from auth middleware
2. Use `Effect.gen` for effectful sequences, `pipe` for pure transforms
3. All deps provided via `AppLive` at root — no per-handler `Layer.provide`
4. Typed errors via `Schema.TaggedError`, propagated through Effect system
5. Services are `class X extends Context.Service<X, Shape>()('id') {}` with a `static readonly layer`; no `Context.Tag` or `Effect.Service`

## Monorepo Discipline

- **tsconfig extends**: every package's `tsconfig.json` MUST `extends: "../../tsconfig.json"`. Exception: a package whose build tool needs a different base (today only the Expo app, on `expo/tsconfig.base`) explicitly mirrors the root's strict-plus flags.
- **package.json `sideEffects`**: every package MUST declare `sideEffects` (either `false` or a precise glob list). Pure libraries are `false`; apps with CSS imports list them.
- **TypeScript version**: every package's `typescript` devDependency MUST match the root version exactly.
- **`@ts-expect-error` over `@ts-ignore`**: suppress a type error with `@ts-expect-error` plus a one-line rationale.
- **CI gate**: CI and the `.husky/pre-push` hook both run lint, `tsc` and tests; a failure blocks the push. Emergency bypass: `HUSKY=0 git push`.
- **Root composite build**: `bun run tsc:build` exercises the project-reference graph end-to-end. Run it locally before large refactors.

## Commands

**Always run commands from the monorepo root** as `bun run <script>`. Never `cd` into a package directory.

## Effect Docs

The repo is on Effect 4. Most online docs, the Effect docs MCP server and `effect-solutions` describe Effect 3 (`Context.Tag`, `@effect/platform`), so check anything from them against v4 before using it.

- `node_modules/.bun/effect@4.0.0/node_modules/effect/AGENTS.md` and its `ai-docs/` are the v4 guides shipped with the package
- The `effect` package source (`.../effect/src`) is the reference for module APIs, including `http`, `http-api`, `sql`, `ai` and `observability`
- The Effect language service reports leftover v3 APIs as `effect(outdatedApi)` in `bun run tsc`

## Agent skills

### Issue tracker

Issues live in GitHub Issues for `antoine2vey/lily`, via the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

Five canonical triage roles, default names (`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`). See `docs/agents/triage-labels.md`.

### Domain docs

Multi-context monorepo: a root `CONTEXT-MAP.md` indexes per-package `CONTEXT.md` glossaries, created lazily (none exist yet). See `docs/agents/domain.md`.
