# Lily - Coding Rules

Plant care app. TypeScript monorepo (Bun 1.3.8, Effect 3.19.19):

- **api** — Backend API server (Effect Platform, `@effect/platform` 0.94.5)
- **db** — Drizzle ORM schema and migrations (PostgreSQL)
- **shared** — Shared types, schemas, and utilities
- **app** — React Native mobile app (Expo 54, React Native 0.81)
- **web** — Marketing site (Next.js 16, static export, i18n en/fr)
- **admin** — Admin dashboard (Vite + React 19)
- **mcp** — Model Context Protocol server (@effect/ai, @effect/rpc)
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
- `new Date()` → `DateTime.unsafeNow()`, `new Date(iso)` → `DateTime.make()`
- Date math → `DateTime.distance`, `Duration` module, `DateTime.toParts`

Shared date utilities available in `@lily/shared`: `parseApiDate`, `now`, `nowAsDate`, `daysUntil`, `isOverdue`, `isFuture`, etc.

## Key Rules

1. **Never use userId path params** — use `CurrentUser` from auth middleware
2. Use `Effect.gen` for effectful sequences, `pipe` for pure transforms
3. All deps provided via `AppLive` at root — no per-handler `Layer.provide`
4. Typed errors via `Schema.TaggedError`, propagated through Effect system
5. `Match.exhaustive` for union types

## Commands

**Always run commands from the monorepo root.** Never `cd` into a package directory. Turbo runs scripts across all packages that define them.

```bash
bun run test       # runs test in all packages
bun run tsc        # TypeScript check in all packages
bun run lint       # Biome lint in all packages
bun run lint:fix   # Biome lint + autofix in all packages
```

## Effect Docs

An Effect documentation MCP server is available for looking up module APIs.

<!-- effect-solutions:start -->
## Effect Best Practices

**IMPORTANT:** Always consult effect-solutions before writing Effect code.

1. Run `effect-solutions list` to see available guides
2. Run `effect-solutions show <topic>...` for relevant patterns (supports multiple topics)
3. Search `.reference/effect/` for real implementations (run `effect-solutions setup` first)

Topics: quick-start, project-setup, tsconfig, basics, services-and-layers, data-modeling, error-handling, config, testing, cli.

Never guess at Effect patterns - check the guide first.
<!-- effect-solutions:end -->
