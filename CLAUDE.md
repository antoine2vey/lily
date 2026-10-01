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

## Formatting (Biome)

2-space indent, single quotes, no semicolons, 80-char width, ES5 trailing commas.

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
- `DateTime.make/makeUnsafe` parts use singular keys (`hour`, `minute`, `second`, `millisecond`). Plural v3 keys typecheck but are silently dropped; `scripts/effect-v4-dateparts-check.ts` catches them
- Date math → `DateTime.distance` (returns a `Duration`), `Duration` module, `DateTime.toParts`
- `x == null ? none : some(x)` → `Option.fromNullishOr`

Shared date utilities available in `@lily/shared`: `parseApiDate`, `now`, `nowAsDate`, `daysUntil`, `isOverdue`, `isFuture`, etc.

## Key Rules

1. **Never use userId path params** — use `CurrentUser` from auth middleware
2. Use `Effect.gen` for effectful sequences, `pipe` for pure transforms
3. All deps provided via `AppLive` at root — no per-handler `Layer.provide`
4. Typed errors via `Schema.TaggedError`, propagated through Effect system
6. Services are `class X extends Context.Service<X, Shape>()('id') {}` with a `static readonly layer`; no `Context.Tag` or `Effect.Service`
5. `Match.exhaustive` for union types

## Monorepo Discipline

- **tsconfig extends**: every package's `tsconfig.json` MUST `extends: "../../tsconfig.json"`. Exception: packages whose build tool needs a different base (Expo app uses `expo/tsconfig.base`, Next.js-specific overrides) — in those cases, explicitly mirror the root's strict-plus flags.
- **package.json `sideEffects`**: every package MUST declare `sideEffects` (either `false` or a precise glob list). Pure libraries are `false`; apps with CSS imports list them.
- **TypeScript version**: every package's `typescript` devDependency MUST match the root version exactly. No drift.
- **No `@ts-ignore`**: use `@ts-expect-error` with a one-line rationale. `@ts-ignore` fails CI lint.
- **CI gate**: `bun run tsc` is enforced in CI and as a pre-push hook (`.husky/pre-push`). Type errors block merges. Emergency bypass: `HUSKY_SKIP_TSC=1 git push`.
- **Root composite build**: `bun run tsc:build` exercises the project-reference graph end-to-end. Run it locally before large refactors.

## Commands

**Always run commands from the monorepo root.** Never `cd` into a package directory. Turbo runs scripts across all packages that define them.

```bash
bun run test       # runs test in all packages
bun run tsc        # TypeScript check in all packages
bun run lint       # Biome lint in all packages
bun run lint:fix   # Biome lint + autofix in all packages
```

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

Multi-context monorepo: root `CONTEXT-MAP.md` points to per-package `CONTEXT.md` files. See `docs/agents/domain.md`.
