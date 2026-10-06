# Lily - Coding Rules

Plant care app. TypeScript monorepo (Bun 1.3.8, Effect 4.0.0).

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
6. Suppress a type error with `@ts-expect-error` (over `@ts-ignore`) plus a one-line rationale

## Commands

**Always run commands from the monorepo root** as `bun run <script>`. Never `cd` into a package directory.

## Situational docs

- **Packages**: locating which package owns a feature, or working in a package with no `CLAUDE.md` of its own: read `packages/README.md`, then that package's README.
- **Monorepo discipline**: adding a package, editing a package's `package.json` or `tsconfig.json`, a push blocked by the pre-push hook, or before a large cross-package refactor: read `docs/agents/monorepo.md`.
- **Effect lookups**: most online docs, the Effect docs MCP server and `effect-solutions` describe Effect 3. Looking up an Effect API, or `bun run tsc` reporting `effect(outdatedApi)`: read `docs/agents/effect-docs.md` for the v4 sources.

## Agent skills

- **Issue tracker**: publishing, fetching or editing issues: read `docs/agents/issue-tracker.md`.
- **Triage labels**: applying a triage role to an issue: read `docs/agents/triage-labels.md`.
- **Domain docs**: naming a domain concept, or exploring an area that may have a glossary or ADRs: read `docs/agents/domain.md`.
