# Coding Standards

Lily is **Effect-first** (Effect 4): wherever an Effect module covers an operation, write the Effect version. These standards apply to every TypeScript package; package-scoped rules are listed under [Package standards](#package-standards).

## Collections

- Arrays: `Array.map`, `Array.filter`, `Array.reduce`, `Array.some`, `Array.every`, `Array.flatMap` for the methods of the same name. The renamed ones: `Array.findFirst` for `.find`, `Array.contains` for `.includes`, `Array.flatten` for `.flat`.
- First element: `Array.head` (returns an `Option`) for `arr[0]`.
- Records: `Record.keys`, `Record.values`, `Record.toEntries` for `Object.keys`, `Object.values`, `Object.entries`.

## Optional values

- Lift a nullish value with `Option.fromNullishOr` (for `x == null ? none : some(x)`).
- Default with `Option.getOrElse` (for `x ?? y`); branch on presence with `Option.match` (for a null-check ternary).

## Control flow

- Sequence effectful steps with `Effect.gen`; compose pure transforms with `pipe`.
- Branch on a union type with `Match.type<T>().pipe(Match.when(...), Match.exhaustive)` (for `switch`).
- Branch on a value with `Match.value(x).pipe(Match.when(...), Match.orElse(...))` (for nested ternaries).

## Strings

The `String` module (`String.toUpperCase`, `String.includes`, `String.split`, ...) for string methods.

## Dates

- Current time: `DateTime.nowUnsafe()` (for `new Date()`). Parsing: `DateTime.make(iso)`, which returns an `Option` (for `new Date(iso)`).
- Date math: `DateTime.distance` (returns a `Duration`), the `Duration` module, `DateTime.toParts`.
- `DateTime.make` / `makeUnsafe` parts take singular keys (`hour`, `minute`, `second`, `millisecond`). Plural v3 keys (`hours`, ...) typecheck but are silently dropped.
- `@lily/shared` wraps the common cases: `parseApiDate`, `now`, `nowAsDate`, `daysUntil`, `isOverdue`, `isFuture` and more, in `packages/shared/src/domains/common/date/`.

## Imports

- Across packages: the package name (`@lily/shared`, `@lily/api`).
- Inside `packages/app`: the `@/` alias for every import, in place of relative paths or bare `src/`.

## Services and layers

- Declare a service as `class X extends Context.Service<X, Shape>()('X') {}`, the v4 replacement for `Context.Tag` and `Effect.Service`.
- A service that builds itself passes `{ make }` and adds `static readonly layer = Layer.effect(this, this.make)` (e.g. `AiService`). A repository exports its layer beside the class as `XRepositoryLive = Layer.effect(XRepository, ...)`.
- Provide layers once, at the program root (`AppLive` in the api). Handlers and endpoints declare their dependencies in the Effect's requirements and get them from `AppLive`, with no `Layer.provide` of their own.

## Errors

- Define typed errors with `Schema.TaggedError` and let them propagate through the Effect error channel.
- Handle errors by tag (`Effect.catchTag`, `Effect.catchTags`), naming each error you recover from.

## Auth

Read the requesting user from `CurrentUser` (`const { id: userId } = yield* CurrentUser`), provided by the auth middleware. The caller's identity never comes from a `userId` path param.

## Type suppression

Suppress a type error with `@ts-expect-error` plus a one-line rationale; unlike `@ts-ignore`, it fails once the error is gone.

## Package standards

A change under one of these packages also follows that package's `CLAUDE.md`. Read it before writing or reviewing the change:

- **`packages/api/`**: service layout, handlers, `withPlantAuth`, schedulers, naming, tests, dead-plant filtering: `packages/api/CLAUDE.md`.
- **`packages/app/`**: NativeWind styling, theme tokens, component variants, loading states: `packages/app/CLAUDE.md`.
- **`packages/db/`**: tables, keys, timestamps, enums, relations: `packages/db/CLAUDE.md`.
- **`packages/shared/`**: domain schemas, errors, service interfaces, exports: `packages/shared/CLAUDE.md`.
- **`packages/web/`**: Effect in a static build, SEO metadata, i18n, blog posts, components: `packages/web/CLAUDE.md`.
