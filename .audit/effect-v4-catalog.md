# Effect v3 to v4 change catalog for Lily

Scope. Only APIs that Lily actually uses, counted across `packages/*/src` (sources and tests, 1,554 tracked `.ts`/`.tsx` files, no `node_modules`, no `dist`). Current versions are effect 3.19.19, @effect/platform 0.94.5, @effect/sql 0.49, @effect/sql-pg 0.50, @effect/sql-drizzle 0.48, @effect/ai 0.33, @effect/platform-bun 0.87, @effect/opentelemetry 0.44, and @effect/rpc 0.73.2 (patched). The target is effect 4.0.0 (published 2026-10-01) and the matching 4.0.0 satellite packages.

## How to read this

Evidence labels appear on every claim that is not a plain rename.

- **measured.** A script ran against the real 4.0.0 (and, for comparison, 3.19.19) packages. The scripts live in `scratchpad/v4play/` (v4) and `scratchpad/v4play/v3/` (v3).
- **read.** Taken from the 4.0.0 source tarball (`scratchpad/v4/package/src`, `scratchpad/v4pkgs/*/package/src`) or the official annotations.
- **inferred.** A conclusion drawn from code without running it.

"Kind" in every table means one of two things.

- **mechanical.** A rename or import move that a ts-morph codemod can apply without judgment.
- **semantic.** The behavior or the shape changes, so a human has to decide.

Sources of truth, in priority order:

1. The effect@4.0.0 tarball at `scratchpad/v4/package`. Its subpath exports are `effect/http`, `effect/http-api`, `effect/sql`, `effect/rpc`, `effect/ai`, `effect/observability`, `effect/process` and `effect/testing`. There is no `effect/unstable/*`.
2. The official per-API migration annotations from `Effect-TS/effect` main, which is at version 4.0.0. They are copied to `scratchpad/migration4/annotations/*.yaml`, one YAML per v3 module, keyed like `"effect/DateTime#unsafeNow"`. The prose guides are in `scratchpad/migration4/*.md` (MIGRATION.md, v3-to-v4.md, schema.md, services.md, and others).
3. The `Effect-TS/effect-smol` docs are stale. They are at 4.0.0-beta.98 and still say `effect/unstable/http` and `Schema.TaggedErrorClass`. Do not follow them where they disagree with 4.0.0. For example, 4.0.0 keeps `Schema.TaggedError`.

One annotation is wrong against the shipped code. `effect__DateTime.yaml` says `DateTime.distance` "returns signed milliseconds in v4". In 4.0.0 it returns a signed `Duration` (measured: `DateTime.distance(t0, t0+5s)` is a `Duration` of 5000 ms, and the reverse is -5000 ms). See the DateTime rows.

The per-member join of all 503 used `Module.member` pairs against the annotations is in `scratchpad/joined.tsv`, with columns count, v3 API, v4 replacement and note. The raw usage census is in `scratchpad/members.txt`.

## 0. Inventory

| Import specifier | Import lines | Notes |
| --- | --- | --- |
| `effect` | 955 | top named imports: Effect 570, pipe 398, Option 366, Array 321(+31 aliased), Layer 245, Match 128, Schema 106, DateTime 88, Context 55, Exit 51, String 43(+36 aliased), Either 27 |
| `@effect/sql/SqlError` | 170 | |
| `@effect/platform` | 91 | HttpApi* (≈120 named), HttpServer*, HttpClient*, Multipart, FetchHttpClient, CommandExecutor |
| `@effect/sql-drizzle/Pg` | 43 | no v4 release; see SQL |
| `@effect/platform/Multipart` | 16 | |
| `@effect/platform/FileSystem` | 11 | |
| `@effect/platform/Error` | 8 | |
| `@effect/ai` | 5 | packages/mcp only |
| `@effect/platform-bun` | 4 | |
| `@effect/sql-pg` | 3 | |
| `@effect/sql/SqlClient` | 2 | |
| `effect/SchemaAST`, `effect/Duration`, `effect/ConfigError`, `@effect/opentelemetry/NodeSdk` | 1 each | |

Some declared dependencies are never imported (read, grep). These are `@effect/cluster` and `@effect/experimental` (in mcp and db) and `@effect/workflow` (in api). Drop them before migrating. `@effect/vitest` is not used. Tests use plain vitest with `Effect.runPromise`/`runPromiseExit` (932 and 283 calls), and the app uses jest-expo.

Member-access totals per namespace (measured): Effect 5,698, Option 3,141, Schema 2,315, Array 1,737, Match 1,028, Layer 683, DateTime 587, Exit 288, String 204, Console 176, HttpApiEndpoint 143, Order 119, Config 100, Duration 95, HttpApiSchema 82, Either 67, Context 61.

## 1. Package and import moves

| v3 import | v4 import | Kind | Count | Notes |
| --- | --- | --- | --- | --- |
| `effect` (core modules) | `effect` | mechanical (none) | 955 | same barrel |
| `Either` from `effect` | `Result` from `effect` | mechanical (module), semantic (members) | 27 imports, 67 member uses | see section 3 |
| `JSONSchema` from `effect` | `Schema.toJsonSchemaDocument` / `JsonSchema` | semantic | 1 file (`mcp/src/tools/handlers.ts`) | output changes (measured, section 4) |
| `TestClock`, `TestContext` from `effect` | `TestClock` from `effect/testing`; `TestClock.layer()` | semantic | 1 file | no `TestContext`; see section 9 |
| `effect/ConfigError` | `Config.ConfigError` | mechanical | 1 | no `effect/ConfigError` module in v4 (read) |
| `effect/SchemaAST`, `effect/Duration` | same | mechanical (none) | 1 each | `SchemaAST` contents changed; only used by the JSON Schema helper |
| `@effect/platform` `HttpApi*`, `OpenApi` | `effect/http-api` | mechanical | in the 91 lines | see HTTP section |
| `@effect/platform` `Http*`, `FetchHttpClient`, `HttpBody`, `Multipart` | `effect/http` | mechanical | in the 91 lines | `HttpApp` becomes `HttpEffect` |
| `@effect/platform/Multipart` | `effect/http` `Multipart` | mechanical | 16 | `PersistedFile` unchanged |
| `@effect/platform/FileSystem` | `effect` `FileSystem` | mechanical | 11 | |
| `@effect/platform/Error` | `effect` `PlatformError` | semantic | 8 | now one class with `reason` |
| `@effect/platform` `CommandExecutor` | `effect/process` `ChildProcessSpawner` | semantic | 1 test mock | probably delete |
| `@effect/sql/SqlError` | `effect/sql/SqlError` (deep path, not the barrel) | mechanical | 170 | the barrel `effect/sql` exports `SqlError` as a module namespace (read) |
| `@effect/sql/SqlClient` | `effect/sql/SqlClient` | mechanical | 2 | |
| `@effect/sql-drizzle/Pg` | `drizzle-orm/effect-postgres` (drizzle-orm 1.0.0-rc.4) | semantic | 43 | package removed upstream |
| `@effect/sql-pg` | `@effect/sql-pg@4.0.0` | mechanical (plus `Config.Redacted`) | 3 | new native driver, see SQL |
| `@effect/ai` | `effect/ai` | mechanical (module), semantic (members) | 5 | |
| `@effect/platform-bun` `BunContext` | `BunServices` | mechanical | 2 | |
| `@effect/opentelemetry/NodeSdk` | same in 4.0.0, or `effect/observability` `OtlpTracer` | semantic | 1 | 4.0.0 needs OTel SDK 2.x |
| `patches/@effect%2Frpc@0.73.2.patch` | delete | semantic | 1 | fixed upstream (read), see RPC |

Toolchain notes. effect 4.0.0 is ESM-only (`"type": "module"`, exports `"."` and `"./*"` with no `require` condition, read). That suits the root `moduleResolution: "bundler"` and Expo's `bundler` resolution. The app's jest `transformIgnorePatterns` already lets `effect` through Babel. `@effect/language-service` must move from 0.80 to a release that supports v4 (latest is 0.87.3; v4 support is not verified).

## 2. Core: Effect, Layer, Context, services, runtime

| v3 API | v4 replacement | Kind | Count | Notes |
| --- | --- | --- | --- | --- |
| `class X extends Context.Tag('id')<X, Shape>() {}` | `class X extends Context.Service<X, Shape>()('id') {}` | mechanical (argument order) | 57 in 54 files | `X.of(...)` still exists (read) |
| `Effect.Service<X>()('id', { effect, dependencies })` + `X.Default` | `Context.Service<X>()('id', { make })` + an explicit `static layer = Layer.effect(this, this.make).pipe(Layer.provide(deps))` | semantic | 5 classes (`AiService`, `RagService`, `FileService`, `GCSService`, app `ApiClient`), 9 `.Default` refs | no generated `Default` layer and no `dependencies` option (read) |
| `Layer.succeed(Tag, impl)` | same (data-first and curried forms) | none | 110 | measured |
| `Layer.effect`, `merge`, `mergeAll`, `provide`, `provideMerge`, `empty`, `launch`, `buildWithScope`, `effectDiscard` | same | none | 57/60/271/63/11/1/2/2/1 | `buildWithScope` now forks the current MemoMap (read) |
| `Layer.scoped` | `Layer.effect` | mechanical | 3 | `Layer.effect` now excludes `Scope` itself |
| `Layer.scopedDiscard` | `Layer.effectDiscard` | mechanical | 19 | |
| `Layer.unwrapEffect` | `Layer.unwrap` | mechanical | 7 | |
| `Layer.setConfigProvider(p)` | `ConfigProvider.layer(p)` | mechanical | 8 (tests) | |
| `Effect.provide(layer)` | same | none in syntax, semantic in behavior | 1,131 | Layers are now memoized across separate `provide` calls in one fiber tree (read, `layer-memoization.md`). Each `Effect.runPromise` still starts from a fresh MemoMap (`Layer.CurrentMemoMap.forkOrCreate`, read), so per-test isolation holds. Use `Effect.provide(l, { local: true })` or `Layer.fresh` where a test depends on two separate builds inside one run. |
| `Effect.catchAll` | `Effect.catch` | mechanical | 6 | |
| `Effect.catchAllCause` | `Effect.catchCause` | mechanical | 4 | |
| `Effect.either` | `Effect.result` | mechanical (call), semantic (value) | 2 | values become `Result` |
| `Effect.zipRight` | `Effect.andThen` | mechanical | 20 | |
| `Effect.fork` / `forkDaemon` | `Effect.forkChild` / `forkDetach` | mechanical | 7 / 3 | `Fiber` is no longer an Effect; yield `Fiber.join(f)` |
| `Effect.async` | `Effect.callback` | mechanical | 1 (`app/scripts/screenshots/run.ts`) | |
| `Effect.if(cond, { onTrue, onFalse })` | `Effect.suspend(() => cond ? a : b)` | semantic | 1 (`notification-scheduler/scheduler.ts:312`) | |
| `Effect.iterate` | none; write an explicit `Effect.gen` loop or `Effect.whileLoop` | semantic | 3 (`blog-generator/generator.ts:211`, `blog-generator/scheduler.ts:117`, `shared/services/ai/quality-check.ts:32`) | no v4 equivalent |
| `Effect.orElse(() => fb)` | `Effect.catch(() => fb)` | mechanical | 1 | |
| `Effect.tapBoth` | `Effect.tapError` + `Effect.tap` | semantic (small) | 1 | |
| `Effect.timeoutFail` | `Effect.timeoutOrElse` with `Effect.fail(...)` | semantic (small) | 1 | |
| `Effect.timeout` | same; fails with `Cause.TimeoutError` | semantic | 1 + `catchTag('TimeoutException')` at `ai-chat/endpoints/stream-chat-message.ts:225` | tag `TimeoutException` becomes `TimeoutError` |
| `Effect.tryPromise(() => p)` / `Effect.try(() => x)` | same; callback form fails with `Cause.UnknownError` | semantic (tag rename) | 94 / 5; 11 `UnknownException` string refs (`health/handlers.ts`, `weather/cache.live.ts` ×4, `event-bus/redis.provider.ts`, `helpers/error-handling.ts`) | tag `UnknownException` becomes `UnknownError`; `catchTag` on the old tag fails to compile, but the literal union in `error-handling.ts:21` does not (inferred) |
| `Effect.runtime<R>()` + `Runtime.runPromise(rt)(eff)` / `Runtime.runFork(rt)` | `Effect.context<R>()` + `Effect.runPromiseWith(ctx)(eff)` / `Effect.runForkWith(ctx)` | semantic (mechanical pattern) | 3 `Effect.runtime`, 3 `Runtime.runPromise`, 1 `Runtime.runFork`, 1 `Runtime.Runtime` type | `ai-chat/plant-chat.ts:117,182`, `ai-chat/tools/*.ts`, `event-bus/redis.provider.ts:52` |
| `ManagedRuntime.make(layer)`, `.runPromise` | same | none | 6 | `managedRuntime.runtime()` (6 test calls) becomes `managedRuntime.context()` (read) |
| `Effect.withConfigProvider(p)` | `Effect.provideService(ConfigProvider.ConfigProvider, p)` | mechanical | 1 | |
| `Effect.gen`, `fn`, `succeed`, `fail`, `die`, `sync`, `promise`, `map`, `flatMap`, `tap`, `as`, `asVoid`, `void`, `all`, `forEach`, `when`, `sleep`, `retry`, `forever`, `scoped`, `scope`, `addFinalizer`, `forkScoped`, `option`, `orDie`, `orElseSucceed`, `flip`, `ignore`, `mapError`, `matchCauseEffect`, `tapError`, `tapDefect`, `catchTag`, `catchTags`, `provideService`, `context`, `withSpan`, `annotateCurrentSpan`, `log*`, `run*` | same names | none (type-level re-check) | 659 gen, 340 fn, 426 succeed, 209 withSpan, and so on | Generator passing `this` must become `Effect.gen({ self: this }, ...)`; the repo has 0 such uses (measured grep). |
| `Effect.runPromise` / `runSync` rejection value | throws the squashed original error, not a `FiberFailure` | semantic | 932 + 15 (most in tests), 49 in the app | **measured.** v3 throws `(FiberFailure) Boom` with message "An error has occurred", and `e instanceof Boom` is false. v4 throws the `Boom` instance itself, with message `""` when it has no `message` field. The app's `extractErrorMessage` and Sentry grouping see different values. The repo has 0 `FiberFailure` refs and 2 `rejects.toThrow`. |
| Yieldable subtyping | `Option`, `Result`, `Config` and services are still `yield*`-able but not `Effect`s; `Ref`, `Deferred` and `Fiber` are not yieldable | semantic, compile-guided | 0 direct `yield* ref/deferred/fiber` (grep) | passing an `Option` or `Config` to an Effect combinator now fails to compile |

## 3. Errors: Either to Result, Cause, error tags

| v3 API | v4 replacement | Kind | Count | Notes |
| --- | --- | --- | --- | --- |
| `Either.Either<A, E>` | `Result.Result<A, E>` | mechanical | 5 | |
| `Either.right` / `Either.left` | `Result.succeed` / `Result.fail` | mechanical | 14 / 5 | includes app test fixtures |
| `Either.isRight` / `isLeft` | `Result.isSuccess` / `isFailure` | mechanical | 5 / 4 | |
| `Either.match({ onLeft, onRight })` | `Result.match({ onFailure, onSuccess })` | mechanical (key rename) | 13 | `worker.ts:436`, `useCareTabBadge.ts:34`, `UnifiedScannerScreen.tsx:319` |
| `Either.map`, `getOrThrow`, `isEither`, `Left`, `Right` | `Result.map`, `getOrThrow`, `isResult`, `Failure`, `Success` | mechanical | 14, 4, 1, 1, 1 | `getOrThrow` now throws the raw failure value |
| `.left` / `.right` properties | `.failure` / `.success` | mechanical (type-guided) | ~10 sites in the app (`ManualAddScheduleScreen.tsx:209,223`, `useDeviceToken.ts:66`, ...) | needs type information, because `.left`/`.right` also appear as style keys |
| `Data.TaggedError('X')<{...}>` | same | none | 26 | still yieldable |
| `Schema.TaggedError<X>()('X', fields, annotations?)` | same in 4.0.0 | none at the call site | 68 | 3rd argument annotations change (`HttpApiSchema.annotations({status})` becomes `{ httpApiStatus }`) |
| `Cause.failureOption` | `Cause.findErrorOption` | mechanical | 28 | |
| `Cause.dieOption` | `Cause.findDefect` (returns `Result`) | semantic (small) | 1 | |
| `Cause.pretty`, `Cause.squash` | same | none | 4, 1 | |
| `result.cause._tag === 'Fail'` then `result.cause.error` | `Cause.findErrorOption(result.cause)` | semantic (mechanical pattern) | 43 `cause._tag` checks + 46 `cause.error` reads, almost all in api tests | v4 `Cause` is `{ reasons: Reason[] }` with no `_tag`. Compile-guided. Write one test helper and apply it everywhere. |
| `Exit.isFailure/isSuccess/match/failCause/Exit` | same | none | 253/27/3/1/4 | |
| tag `ParseError` | `SchemaError` | mechanical | 2 (`mcp/auth/oauth-routes.ts:117`, `event-bus/redis.provider.ts:73`) | measured: `decodeSync` throws `name: "SchemaError"`, `_tag: "SchemaError"` |
| tags `RequestError`/`ResponseError`, `SystemError`/`BadArgument` | `HttpClientError`/`PlatformError` with a `reason` | semantic | 4/4/3/3 | see HTTP |

## 4. Schema

Schema has the most changes. Every row below was checked against `scratchpad/v4/package/src/Schema.ts` and the annotations.

### 4.1 Constructors and combinators

| v3 API | v4 replacement | Kind | Count | Notes |
| --- | --- | --- | --- | --- |
| `Schema.Date` (string to Date) | `Schema.DateFromString` | **mechanical, and the rename is mandatory** | 90 (89 shared, 1 admin) | v4 `Schema.Date` is the old `DateFromSelf`: it accepts only a `Date` instance. Measured: v4 `decodeUnknownSync(Struct({d: Schema.Date}))` rejects an ISO string with "Expected a valid Date". Inside HttpApi the v4 `Schema.Date` would still encode to ISO through its `toCodecJson` link (measured, identical body), but `Schema.fromJsonString`, `decodeSync` and storage round-trips do not apply that link (read, `fromJsonString` at `Schema.ts:9485`). Map every v3 `Schema.Date` to `DateFromString` and the old semantics hold everywhere. |
| `Schema.DateFromString` | same | none (slightly stricter) | 6 | v4 rejects invalid dates; v3 `DateFromString` let `Invalid Date` through (inferred from the v3 docs) |
| `Schema.optional(S)` | same | none at the call site, **wire change** | 214 (199 in shared) | Measured: under `Schema.toCodecJson`, which HttpApi applies to every body, `{ a: undefined }` encodes as `"a": null`. v3 dropped the key, and v3 `Schema.optional(S)` decoders reject `null` (measured). JSON Schema becomes `anyOf: [S, null]` and leaves `required` (measured). Section 7 covers this. |
| `Schema.optionalWith(S, { default })` | `S.pipe(Schema.withDecodingDefaultType(Effect.succeed(v)))` + `Schema.withConstructorDefault(Effect.succeed(v))` when `.make` omits the field | semantic | 67 | Measured: without `withConstructorDefault`, `Struct.make({})` throws "Schema validation failed". v3's default also served as the constructor default (measured `S.make` filled it). Encode passes the value through, so the wire is unchanged (read). |
| `Schema.optionalWith(S, { exact: true })` | `Schema.optionalKey(S)` | mechanical | 20 | |
| `Schema.Literal('a', 'b', ...)` | `Schema.Literals(['a', 'b', ...])` | mechanical | 54 multi-argument (the single-argument form is unchanged, 13) | `Literal(null)` would become `Schema.Null`; the repo has 0 |
| `Schema.Union(A, B)` | `Schema.Union([A, B])` | mechanical | 9 | |
| `Schema.Record({ key, value })` | `Schema.Record(key, value)` | mechanical | 8 | |
| `Schema.UUID` | `Schema.String.check(Schema.isUUID())`, or `Schema.String.check(Schema.isGUID())` to keep v3 acceptance | semantic | 19 (+2 per the HTTP census, 21 `param` sites) | Measured: v4 `isUUID` requires version nibble 1-8 and variant 8/9/a/b. v3 accepted any 8-4-4-4-12 hex. Production ids come from `defaultRandom()` (43 columns), so they are compliant (inferred). 3 fixture literals are not compliant (measured). Prefer `isGUID()` on request paths so old clients keep the exact same contract. |
| `Schema.Struct`, `String`, `Boolean`, `NullOr`, `Array`, `Unknown`, `Void`, `TaggedStruct`, `Class`, `NonEmptyArray`, `mutable`, `instanceOf` | same names | none at the call site | 299, 703, 71, 169, 73, 16, 4, 16, 11, 1, 1, 1 | Types are re-declared; `typeof X.Type` (243 uses) and `Schema.Schema.Type<>` (5) still work |
| `Schema.Number` | same | none at the call site, wire change for non-finite values | 216 | Measured: under `toCodecJson`, `NaN` encodes as `"NaN"` (v3 sent `null`), and the JSON Schema becomes `anyOf: [number, enum ["Infinity","-Infinity","NaN"]]`. Use `Schema.Finite` on wire fields to keep `{type: number}` in OpenAPI and MCP. |
| `Schema.Uint8Array` | v4 `Schema.Uint8Array` (an instance check) when the value is already bytes. Otherwise `Schema.Array(Schema.Number).pipe(Schema.decodeTo(Schema.Uint8Array, SchemaTransformation.transform(...)))`. | semantic | 1 (`shared/services/file/fileservice.ts:52`) | v3 `Uint8Array` decodes from `number[]`. v4 `Uint8Array` is the instance schema, and v4 has no `FromNumbers` variant, only Base64, Base64Url and Hex (read). The field is internal to FileService, so the instance schema is likely what is wanted (inferred). |
| `Schema.extend(Struct, Record)` | `Schema.StructWithRest(Struct, [Schema.Record(String, Unknown)])` | semantic | 1 (`subscriptions/providers/revenuecat.provider.ts:33`) | third-party webhook; keep a decode test with a real payload |
| `Schema.compose(a, b)` | `a.pipe(Schema.decodeTo(b))` | mechanical | 1 (`revenuecat.provider.ts:53`) | |
| `Schema.parseJson(S)` / `parseJson()` | `Schema.fromJsonString(S)` / `Schema.UnknownFromJsonString` | mechanical | 9 | `fromJsonString` does not apply `toCodecJson`. Inner fields must be JSON-native, which is why `Schema.Date` must become `DateFromString`. This matters for on-device storage (`app/utils/storage.ts:17`, `onboarding-storage.ts`, `useOnboardingFlow.ts`): v3-written JSON must still decode. |
| `Schema.filter(pred)` | `Schema.check(Schema.makeFilter(pred))`, or `Schema.refine` for refinements | mechanical | 1 (`services/internal/api.ts:24`) | |
| `Schema.int()`, `Schema.between(a, b)`, `Schema.maxLength(n)`, `Schema.pattern(re, ann)` | `Schema.check(Schema.isInt())`, `Schema.isBetween({ minimum, maximum })`, `Schema.isMaxLength(n)`, `Schema.isPattern(re, ann)` | mechanical (the `isBetween` argument becomes an object) | 1 each | |
| `.annotations({ description })` | `.annotate({ description })` | mechanical | 7 | The other 53 `.annotations` calls are HttpApi status (HTTP section). |
| `Schema.Schema<A>` (`satisfies`) | `Schema.Codec<A>` or `Schema.Schema<A>` (now 1 type parameter) | mechanical | 1 | `Schema.Schema.Any` becomes `Schema.Top` (1) |

### 4.2 Decode and encode functions

| v3 API | v4 replacement | Kind | Count | Notes |
| --- | --- | --- | --- | --- |
| `Schema.decodeSync` / `decodeUnknownSync` / `encodeSync` | same | none | 110 / 5 / 3 | throws `SchemaError` (measured); message text differs |
| `Schema.decodeOption` / `decodeUnknownOption` / `decodeUnknownPromise` | same | none | 1 / 4 / 1 | |
| `Schema.decode` / `decodeUnknown` / `encode` | `Schema.decodeEffect` / `decodeUnknownEffect` / `encodeEffect` | mechanical | 1 / 9 / 3 | |
| `ParseResult.*` | `SchemaIssue`, `SchemaParser` | n/a | 0 imports | |

### 4.3 JSON Schema and OpenAPI output (wire-visible to MCP clients and spec readers)

Measured on the same struct in both versions (`v4play/js4.ts` against `v4play/v3/js3.ts`):

- **Dialect.** v3 emits draft-07 (`$schema` draft-07). v4 `Schema.toJsonSchemaDocument` emits draft-2020-12 (`dialect: "draft-2020-12"`).
- **Closed objects.** v3 emits `additionalProperties: false`. v4 emits `additionalProperties: true` by default (annotation: pass `onExcessProperty: 'error'` to close).
- **UUID.** v3 emits a `$defs.UUID` ref with a loose pattern. v4 inlines `format: "uuid"` with the strict RFC pattern.
- **Number.** v3 emits `{type: number}`. v4 emits `anyOf: [number, enum NaN/Infinity strings]`.
- **Optional fields.** `Schema.optional(String)` was `{type: string}` in v3. In v4 it is `anyOf: [string, null]`.
- **Lost metadata.** `int` loses its `title: "int"` and `description`, and `Date` loses its `$defs.Date` description.
- **No change.** `NullOr` and string literal enums are identical.

Repo consumers: `mcp/src/tools/handlers.ts` (tool `inputSchema`, sent to ChatGPT and claude.ai), and `/openapi.json` plus `/docs`, which nothing in the repo consumes (HTTP section). Both remain `openapi: "3.1.0"`.

## 5. Config, Logger, collections, DateTime, Schedule, Stream

| v3 API | v4 replacement | Kind | Count | Notes |
| --- | --- | --- | --- | --- |
| `Config.string` / `boolean` / `duration` / `integer` / `nonEmptyString` / `redacted` | `Config.String` / `Boolean` / `Duration` / `Int` / `NonEmptyString` / `Redacted` | mechanical | 32 / 5 / 2 / 1 / 3 / 12 | Config is Schema-based now (`Config.schema`). `Config.Boolean` accepts exactly the same spellings as v3 `Config.boolean`: `true/false/yes/no/on/off/1/0` decode, and `TRUE` fails in both (measured, `v4play/cfg.ts` against `v4play/v3/cfg3.ts`). |
| `Config.withDefault` / `option` / `all` / `map` / `orElse` | same | semantic (edge) | 27 / 8 / 4 / 5 / 1 | Absent versus invalid handling changed: `withDefault` on an `all` group replaces the whole group, and `orElse` no longer merges failures (annotations) |
| `ConfigProvider.fromMap(new Map(...))` / `fromJson(obj)` | `ConfigProvider.fromUnknown(obj)` (expand delimited keys to nested objects first) or `ConfigProvider.fromEnvRecord(record)` | semantic (small) | 7 / 1 (tests) | flat `KEY: value` maps translate directly to `fromEnvRecord` (inferred) |
| `Logger.*`, `LogLevel.None` | see section 8 (Logger) | | 37 + 5 | |
| `Option.fromNullable` | `Option.fromNullishOr` | mechanical | **1,060** in 273 files | largest single rename; no alias in v4 (read) |
| `Option.*` (others: getOrElse, map, match, flatMap, some, none, isSome, isNone, getOrNull, getOrUndefined, getOrThrow, filter, orElse, all, liftPredicate, flatten) | same | none | 673, 283, 172, 119, ... | `Option` is no longer an Effect subtype |
| `Array.isEmptyArray` / `isEmptyReadonlyArray` / `isNonEmptyArray` / `isNonEmptyReadonlyArray` / `unsafeGet` | `Array.isArrayEmpty` / `isReadonlyArrayEmpty` / `isArrayNonEmpty` / `isReadonlyArrayNonEmpty` / `getUnsafe` | mechanical | 29 / 56 / 18 / 19 / 1 | covers the `Arr`, `A` and `EffectArray` aliases |
| `Array.*` (map, filter, findFirst, head, sort, dedupe, contains, ...) | same | none, semantic edge | 438, 241, 161, 118, 43, 14, 34 | `Equal.equals` is structural by default in v4 (read, `equality.md`), so `Array.dedupe`/`contains` on plain objects change meaning. The 14 `dedupe` sites dedupe ids and strings (inferred from reading the call sites). |
| `Order.number` / `Order.string` / `Order.reverse` | `Order.Number` / `Order.String` / `Order.flip` | mechanical | 16 / 12 / 21 | `Order.Number` puts NaN first (annotation) |
| `Order.Date`, `mapInput`, `min` | same | none | 14, 39, 1 | |
| `Predicate.isRecord` | `Predicate.isObject` | mechanical | 6 | |
| `Struct.entries` | `Object.entries` (native) | mechanical | 1 (`plants/endpoints/update-plant.ts:99`) | conflicts with the "no native" lint rule; use `Record.toEntries` instead |
| `DateTime.unsafeNow` / `unsafeMake` / `unsafeMakeZoned` / `zoneUnsafeMakeNamed` | `DateTime.nowUnsafe` / `makeUnsafe` / `makeZonedUnsafe` / `zoneMakeNamedUnsafe` | mechanical | 112 / 82 / 7 / 9 | also update the `@lily/shared` date helpers (`now`, `parseApiDate`) |
| `DateTime.greaterThan` / `greaterThanOrEqualTo` / `lessThan` / `lessThanOrEqualTo` | `DateTime.isGreaterThan` / ... / `isLessThanOrEqualTo` | mechanical | 9 / 2 / 3 / 7 | |
| `DateTime.toParts(dt).hours/minutes/seconds/millis` | `.hour/.minute/.second/.millisecond` | mechanical (type-guided) | 23 / 13 / 8 / 3 property reads, 60 `toParts` calls | measured: v4 `toParts` returns `{millisecond, second, minute, hour, day, weekDay, month, year}` |
| `DateTime.setParts({ hours, minutes, seconds, millis })` | `{ hour, minute, second, millisecond }` | mechanical | 2 + object literals in `timezone-scheduler.ts:95,206`, `parse.ts:143`, `useSaveCareLog.ts:27`, tests | object-literal excess-property checks flag these |
| `DateTime.add/subtract({ millis })` | `{ milliseconds }` | mechanical | 1 | the other plural keys are unchanged |
| **`DateTime.distance(a, b): number`** | **returns `Duration`**; wrap as `Duration.toMillis(DateTime.distance(a, b))` | semantic | 14 | Measured: returns a signed `Duration` (the annotation is wrong). Arithmetic sites fail to compile, but **`middleware/observability.ts:17` compiles and silently breaks**: it interpolates the value into a log string and passes it to `Effect.annotateCurrentSpan('http.duration_ms', ...)`, which accepts `unknown`. Honeycomb's `http.duration_ms` would stop being a number. `worker.ts:64` passes it to `Duration.lessThan`, which keeps working. |
| `DateTime.Utc`/`DateTime` model `.epochMillis` | `.epochMilliseconds` | mechanical | 0 direct uses (grep) | |
| `DateTime.make`, `formatIso`, `toDateUtc`, `toEpochMillis`, `startOf`, `setZone`, `addDuration`, `zoneMakeNamed`, ... | same | none | 19, 10, 79, 32, 105 `startOf/endOf`, 9, 23, 5 | `startOf` unit names unchanged except `milli` becomes `millisecond` |
| `Duration.greaterThan` / `lessThan` | `Duration.isGreaterThan` / `isLessThan` | mechanical | 1 / 5 | |
| `Duration.*` constructors and `to*` | same | none | | |
| `Deferred.unsafeDone` | `Deferred.doneUnsafe` | mechanical | 1 | |
| `Queue.Dequeue`/`Queue` types | gain an error type parameter | mechanical (type) | 3 / 1 | |
| `Schedule.compose(Schedule.recurs(n))` | `Schedule.max(Schedule.recurs(n))`, or `Effect.retry({ schedule, times: n })` | semantic | 3 (`events/retry-policy.ts:5`, `ai-chat/endpoints/stream-chat-message.ts:34`, `notification-scheduler/worker.ts:258`) | no `compose` in v4 (read). For `exponential` composed with `recurs(n)`, `max` stops after n retries with the exponential delay (inferred). |
| `Schedule.intersect(a, b)` | `Schedule.max(a, b)` | semantic (output shape) | 3 (`knowledge-ingestion/processing/enrichment.ts:33`, `app/contexts/AuthContext.tsx:151,308`) | |
| `Schedule.whileInput(pred)` | `Schedule.while(({ input }) => pred(input))` | semantic (small) | 3 (`reddit.adapter.ts:151`, `AuthContext.tsx:155,315`) | |
| `Schedule.exponential`, `recurs`, `spaced` | same | none | 5, 7, 2 | |
| `Stream.unwrapScoped` | `Stream.unwrap` | mechanical | 1 | |
| `Stream.*` (fromIterable, map, mapEffect, runForEach, fromAsyncIterable, ...) | same | none | | |
| `TestClock.adjust` + `TestContext.TestContext` | `TestClock.adjust` from `effect/testing` + `TestClock.layer()` | mechanical | 9 + 5 (`alerting/service.test.ts`) | |

## 6. HTTP layer (HttpApi, HttpServer, HttpClient, Multipart, Bun platform)

The official per-API notes in `scratchpad/migration4/annotations/effect__platform__Http*.yaml` agree with every replacement below (for example `HttpApiSchema#param` maps to `HttpApiEndpoint#params`, `HttpApiBuilder#middlewareCors` to `HttpRouter#cors`, `HttpApiMiddleware#Tag` to `HttpApiMiddleware#Service`, and `HttpRouter#Default` to "HttpRouter.HttpRouter + HttpRouter.layer").

Sources compared. v3 is `@effect/platform@0.94.5` at `node_modules/.bun/@effect+platform@0.94.5+a91c478e54a5dd97/node_modules/@effect/platform/src` (abbreviated `v3/`). v4 is `effect@4.0.0` at `scratchpad/v4/package/src` (abbreviated `v4/`) and `@effect/platform-bun@4.0.0` at `scratchpad/v4pkgs/platform-bun/package/src` (abbreviated `bun4/`). Counts are member accesses or call sites across `packages/*/src` (src and tests), measured by grep.

Call-site map. The API server lives in `packages/api/src/index.ts`, 27 `*Api` groups under `packages/api/src/services/*/api.ts`, 27 `handlers.ts`, 3 security middlewares (`services/auth/middleware.types.ts`, `services/admin/middleware.types.ts`, `services/internal/middleware.ts`), and `middleware/observability.ts`. Error classes with status annotations live in `packages/shared/src/domains/*/errors.ts`. The mobile app builds a derived client with `HttpApiClient.make(Api)` in `packages/app/src/utils/client.tsx:561`. The admin SPA calls the same JSON endpoints with raw `fetch` (`packages/admin/src/hooks/*`). The MCP server (`packages/mcp/src/index.ts`, `auth/oauth-routes.ts`, `widgets/tool-meta-middleware.ts`, `api-client.ts`) uses the v3 `HttpRouter.Default` and `HttpClient` directly.

### Imports

| v3 import | v4 import | Kind | Count | Notes |
| --- | --- | --- | --- | --- |
| `@effect/platform` `HttpApi*`, `OpenApi` | `effect/http-api` | mechanical | 91 import lines from `@effect/platform` total | `HttpApiSchema`, `HttpApiBuilder`, `HttpApiGroup`, `HttpApiEndpoint`, `HttpApiMiddleware`, `HttpApiSecurity`, `HttpApiSwagger`, `HttpApiClient`, `HttpApi`, `HttpApiError` |
| `@effect/platform` `Http*` (non-Api), `FetchHttpClient`, `HttpBody`, `Multipart` | `effect/http` | mechanical | (same 91) | `HttpApp` module is renamed `HttpEffect` |
| `@effect/platform/Multipart` | `effect/http/Multipart` (or barrel `effect/http`) | mechanical | 16 | `PersistedFile` type still exported (`v4/http/Multipart.ts:180`) |
| `@effect/platform/FileSystem` | `effect/FileSystem` (barrel `effect`) | mechanical | 11 | |
| `@effect/platform/Error` `PlatformError` | `effect/PlatformError` | semantic | 8 | shape change, see errors table |
| `@effect/platform` `CommandExecutor` | `effect/process` `ChildProcessSpawner` | semantic | 1 file (test mock `__tests__/mocks/command-executor.ts`, 8 refs) | different API; rewrite the mock |
| `@effect/platform-bun` `BunContext` | `@effect/platform-bun` `BunServices` | mechanical | 2 | `BunServices.layer` |

### HttpApi definition (API surface)

| v3 API | v4 replacement | Kind | Count | Notes |
| --- | --- | --- | --- | --- |
| ``HttpApiEndpoint.get('id')`/path/${param}` `` (template literal) | `HttpApiEndpoint.get('id', '/path/:param', { params, query, payload, headers, success, error })` | semantic (codemod-able with an AST transform) | 123 template-literal endpoints, 1 string-path endpoint, 75 `${param}` interpolations | v4 has no tagged-template overload and no builder chain; everything moves into the options object (`v4/http-api/HttpApiEndpoint.ts:1047-1167`). `HttpApiEndpoint.del` becomes `HttpApiEndpoint.delete` (`del as delete` re-export) |
| `HttpApiEndpoint.get/post/put/patch/del` | same names except `del` → `delete` | mechanical | get 66, post 44, put 12, patch 5, del 16 | |
| `HttpApiSchema.param('id', Schema.UUID)` | path segment `:id` plus `params: { id: <schema> }` | semantic | 21 | v4 decodes params through `Schema.toCodecStringTree` (`HttpApiEndpoint.ts:1150`). See UUID risk below |
| `.setUrlParams(Struct)` | `query: Struct` (or fields object) | mechanical (inside the endpoint rewrite) | 28 | all repo query schemas are `String` with `optionalWith default`, so string-tree coercion is a no-op |
| `.setPayload(S)` | `payload: S` | mechanical (inside rewrite) | 46 | GET payload becomes query string in both versions |
| `.addSuccess(S)` / `.addSuccess(S, { status: 201 })` | `success: S` / `success: S.pipe(HttpApiSchema.status(201))` | mechanical (inside rewrite) | 140 total, 10 with status | multiple successes become an array |
| `.addError(E, { status: N })` | `error: [E.pipe(HttpApiSchema.status(N)), ...]` | mechanical (inside rewrite) | 326 total, 225 with explicit status | `HttpApiSchema.status` annotates `httpApiStatus` (`HttpApiSchema.ts:143-146`). Per-endpoint overrides survive because the annotation is applied to that endpoint's copy |
| `.addError(Schema.Struct({ error: Schema.String }), { status: 401 })` | same pattern as above | mechanical | 63 | dead declarations in practice (the middleware emits `UnauthorizedError`), but they stay in the v3 client's 401 decode union, so keep them for compat |
| `.middleware(M)` on group/endpoint | `.middleware(M)` | mechanical | 26 (`Authentication` 22, `AdminAuth` 3, `ServiceAuthentication` 1) | |
| `.prefix('/x')` group, `.add(Group.prefix('/api'))` | same | mechanical | 48 | `prefixPath` joins identically (v3 `internal/httpRouter.ts:408-414`, v4 `http/HttpRouter.ts:771-776`). Trailing slash ignored by default in v4 FindMyWay (`http/FindMyWay/internal/router.ts:55`) |
| `HttpApiGroup.make('x')`, `.add(...)` | same | mechanical | 27 | v4 `add` takes varargs endpoints |
| `HttpApi.make('api')` | same | mechanical | 1 | `HttpApi.HttpApi` type now has 2 type params (`Id, Groups`), not 4. Breaks `ExtractError` in `app/src/utils/client.tsx:62-75` |
| `HttpApiSchema.annotations({ status: N })` as 3rd arg of `Schema.TaggedError` | `{ httpApiStatus: N }` as 3rd arg (or `.pipe(HttpApiSchema.status(N))`) | mechanical | 53 (all status-only, mostly `packages/shared/src/domains/*/errors.ts`) | v4 still has `Schema.TaggedError<Self>()(tag, fields, annotations)`; ai-docs fixture `51_http-server/fixtures/domain/UserErrors.ts` uses exactly `{ httpApiStatus: 404 }` |
| `HttpApiSchema.Multipart(Struct)` | `Struct.pipe(HttpApiSchema.asMultipart())` | mechanical | 8 | `HttpApiSchema.ts:870-880`; optional `limits` argument |
| `HttpApiMiddleware.Tag<Self>()(id, { failure, provides, security })` | `HttpApiMiddleware.Service<Self, { provides; requires }>()(id, { error, security, requiredForClient? })` | semantic | 3 | `failure` → `error`; `provides` moves to the type parameter (fixture `51_http-server/fixtures/api/Authorization.ts`) |
| security handler `bearer: (token) => Effect<UserProfile>` | `bearer: (httpEffect, { credential, endpoint, group }) => Effect.provideService(httpEffect, CurrentUser, user)` | semantic | 3 impls (`auth/middleware.impl.ts`, `admin/middleware.impl.ts`, `internal/middleware.impl.ts`) plus `__tests__/mocks/auth.ts` | handler now wraps the downstream effect and provides the service itself (fixture `51_http-server/fixtures/server/Authorization.ts`) |
| `HttpApiSecurity.bearer` / `apiKey({ key, in: 'header' })` | same | mechanical | 2 / 2 | v4 bearer parses the scheme with `getAuthorizationCredential(header, scheme)` (`HttpApiBuilder.ts:553-561`) instead of `slice(7)` (v3 `HttpApiBuilder.ts:1041-1045`). Missing header still yields `Redacted("")` in both |
| `Context.Tag('CurrentUser')` provided by middleware | `Context.Service<CurrentUser, UserProfile>()('CurrentUser')` | mechanical (core-services rename) | 3 tags here | |

### HttpApi server wiring

| v3 API | v4 replacement | Kind | Count | Notes |
| --- | --- | --- | --- | --- |
| `HttpApiBuilder.group(api, 'g', (handlers) => handlers.handle(...))` | same signature; `handle`, `handleAll`, `handleRaw` exist | mechanical | 27 groups, 141 `.handle` | v4 `Handler` may still return `HttpServerResponse` (`HttpApiEndpoint.ts:629-631`), so the SSE endpoint `ai-chat/endpoints/stream-chat-message.ts` keeps working |
| handler arg `{ path, urlParams, payload, headers, request }` | `{ params, query, payload, headers, request, endpoint, group }` | mechanical (rename destructured keys) | 58 handlers destructure `path`, 19 destructure `urlParams` | `HttpApiEndpoint.ts:113-125` |
| `HttpApiBuilder.api(Api)` | `HttpApiBuilder.layer(Api, { openapiPath: '/openapi.json' })` | semantic | 1 | handler group layers are provided to it the same way |
| `HttpApiBuilder.serve(ObservabilityMiddleware)` | `HttpRouter.serve(appLayer, { middleware: ObservabilityMiddleware })` or `HttpRouter.middleware(..., { global: true })` | semantic | 1 | `http/HttpRouter.ts:1340-1362` |
| `HttpApiBuilder.middlewareCors({ maxAge })` | `HttpRouter.cors({ maxAge })` (a `Layer` registering global middleware) | mechanical | 1 | `HttpRouter.ts:1260-1269`. CORS header logic is line-for-line equivalent (v3 `internal/httpMiddleware.ts:240-307`, v4 `http/HttpMiddleware.ts:364-455`) |
| `HttpApiBuilder.middlewareOpenApi()` | `openapiPath` option of `HttpApiBuilder.layer` | semantic | 1 | v3 default path was `/openapi.json`; pass it explicitly |
| `HttpApiSwagger.layer()` | `HttpApiSwagger.layer(Api, { path? })` | mechanical | 1 | default path still `/docs` (`HttpApiSwagger.ts:72`) |
| `HttpServer.withLogAddress` | exists; `HttpRouter.serve` also logs unless `disableListenLog` | mechanical | 1 | drop it to avoid a duplicate log line |
| `HttpServer.layerContext` (test) | `HttpServer.layerServices` | mechanical | 1 | `__tests__/middleware/observability.test.ts:41` |
| `HttpServerRequest.fromWeb` (test) | same | mechanical | 1 | |
| `HttpMiddleware.make` | same | mechanical | 3 | `middleware/observability.ts`, mcp `index.ts`, mcp `tool-meta-middleware.ts` |
| `BunHttpServer.layer({ port, hostname, idleTimeout })` | same (Bun `ServeOptions` plus `gracefulShutdownTimeout`, `disablePreemptiveShutdown`) | mechanical | 2 | `bun4/BunHttpServer.ts:330-342`; it now also provides `BunServices` |
| `BunRuntime.runMain(effect, { disablePrettyLogger: true })` | `BunRuntime.runMain(effect, { disableErrorReporting?, teardown? })` | semantic | 2 | `disablePrettyLogger` no longer exists (`v4/Runtime.ts:184-207`); logger setup must come from `LoggerLayer` alone |
| `CommandExecutor.makeExecutor` mock | `ChildProcessSpawner` service | semantic | 1 file | |

### HttpServerResponse / HttpServerRequest / HttpRouter (MCP and SSE)

| v3 API | v4 replacement | Kind | Count | Notes |
| --- | --- | --- | --- | --- |
| `HttpServerResponse.json/empty/text/html/redirect/stream/setHeader/setHeaders/setBody` | same names | mechanical | json 9, empty 5, redirect 3, stream 2, others 1 each | |
| `HttpServerRequest.HttpServerRequest` tag | same | mechanical | 16 | |
| `HttpRouter.empty.pipe(HttpRouter.get(...), HttpRouter.post(...), HttpRouter.del(...))` | `Layer.mergeAll(HttpRouter.add('GET', path, handler), ...)` | semantic | get 8, post 4, del 1, empty 1 | v4 router is a service built from layers. No `get`/`post`/`empty` builders (`http/HttpRouter.ts:525-536`) |
| `HttpRouter.Default.use(r => r.concat(AppRoutes))`, `HttpRouter.Default.serve(mw)` | `HttpRouter.serve(Layer.mergeAll(routes, McpServer.layerHttp(...)), { middleware })` | semantic | 2 | `HttpRouter.Default` removed. mcp `index.ts:103,154` |
| `HttpApp.appendPreResponseHandler((req, res) => ...)` | `HttpEffect.appendPreResponseHandler(...)` | mechanical (module rename) | 1 | `http/HttpEffect.ts:255`. `HttpBody` `_tag` is still `"Uint8Array"` (`http/HttpBody.ts:251`), so `tool-meta-middleware.ts` logic survives |
| `HttpMiddleware.cors({ allowedOrigins, ... })` | same, or `HttpRouter.cors` layer | mechanical | 1 | |
| `McpServer.layerHttp({ name, version, path })` mounted on `HttpRouter.Default` | `McpServer.layerHttp({ name, version, path, protocols, allowedOrigins? })` registering on the `HttpRouter` service | semantic | 2 | `protocols` is required in v4 (`ai/McpServer.ts:1550-1561`). v4 registers its own GET/PUT/PATCH/DELETE 405 routes on the MCP path (`McpServer.ts:1571-1575`), so mcp `index.ts:86` (`HttpRouter.del('/mcp', 405)`) would collide. Belongs with the AI/MCP section too |

### HttpClient (mcp `api-client.ts`, app client)

| v3 API | v4 replacement | Kind | Count | Notes |
| --- | --- | --- | --- | --- |
| `HttpClientRequest.bodyUnsafeJson` | `HttpClientRequest.bodyJsonUnsafe` | mechanical | 5 | |
| `HttpClientRequest.get/post/setHeader`, `HttpClient.mapRequest/mapRequestEffect`, `HttpClientResponse.filterStatusOk`, `FetchHttpClient.layer`, `HttpBody.text` | same | mechanical | 4/5/3, 1/2, 3, 2, 1 | |
| `HttpClientError.HttpClientError` union `RequestError | ResponseError`, `err._tag === 'ResponseError'` | single class `HttpClientError` with `reason: RequestError | ResponseError` (`TransportError`, `EncodeError`, `InvalidUrlError`, `StatusCodeError`, `DecodeError`, `EmptyBodyError`) | semantic | 2 sites (`mcp/src/api-client.ts:156-161`, `api/src/services/helpers/error-handling.ts:17-26`) | `http/HttpClientError.ts:37-43,320`. `catchTags({ RequestError, ResponseError })` no longer matches; match `HttpClientError` then `reason._tag` |
| `HttpApiClient.make(Api, { baseUrl, transformClient })` | same options plus `transformResponse` | mechanical | 1 | `http-api/HttpApiClient.ts:515-533`. Requirement now includes `HttpApiGroup.MiddlewareClient<Groups>`, empty unless a middleware sets `requiredForClient: true` |
| client call `client.group.endpoint({ path, urlParams, payload })` | `({ params, query, payload })` | mechanical | app: 64 `path:` objects, 32 `urlParams` | `HttpApiEndpoint.ts:527+` (`ClientRequest`) |

### Multipart and files

| v3 API | v4 replacement | Kind | Count | Notes |
| --- | --- | --- | --- | --- |
| `Multipart.FilesSchema` | same | mechanical | 7 | now `Schema.Array(PersistedFileSchema)` (`http/Multipart.ts:382`) |
| `Multipart.SingleFileSchema` | same | mechanical | 1 | `Multipart.ts:396` |
| `Multipart.PersistedFile` type | same | mechanical | 16 imports | fields `key, name, contentType, path` unchanged (`Multipart.ts:180-186`) |
| `toPersisted` field folding | unchanged | none | n/a | strings stay single unless repeated, files always arrays (v3 `Multipart.ts:520-545`, v4 `Multipart.ts:734-766`) |
| default limits | `MaxFieldSize` 10 MiB, `MaxFileSize`/`MaxParts` unlimited (`Multipart.ts:884-932`) | none | n/a | matches v3 defaults as far as read |
| `FileSystem.FileSystem` (reading persisted temp files) | `effect/FileSystem` | mechanical | 11 | provided by `BunServices` |
| `PlatformError` = `SystemError | BadArgument` (tags `SystemError`/`BadArgument`) | `PlatformError` class (`_tag: "PlatformError"`) with `reason: BadArgument | SystemError` | semantic | 8 type refs + `error-handling.ts` `catchTags` keys | `v4/PlatformError.ts:37,110,158`. `withInfraErrorsAsDefect` keys `SystemError`/`BadArgument`/`RequestError`/`ResponseError`/`UnknownException` all stop matching; new keys are `PlatformError`, `HttpClientError`, `UnknownError` |

### Wire-format risks (old mobile builds call the new server)

Measured end to end. `scratchpad/v4play/http4.ts` and `http4b.ts` run a v4.0.0 `HttpApiBuilder.layer` app through `HttpRouter.toWebHandler`, and `scratchpad/v4play/v3/http3.ts` runs the same endpoints on `@effect/platform@0.94.5` through `HttpApiBuilder.toWebHandler`. Raw results:

| Case | v3 status, body | v4 status, body |
| --- | --- | --- |
| success, `note: Schema.optional(String)` returned as `undefined`, `n: NaN` | 200 `{"id":..,"when":"1970-01-01T00:00:00.000Z","n":null}` (key dropped) | 200 `{"id":..,"note":null,"when":"1970-01-01T00:00:00.000Z","n":"NaN"}` |
| same endpoint with `disableCodecs: true` (v4 only) | n/a | 200 `{"id":"a","when":"1970-01-01T00:00:00.000Z"}` (key dropped, v3 parity) |
| `Schema.optionalKey(String)` returned as `undefined` (v4 only) | n/a | 400 empty (encode failure) |
| domain error 404 | 404 `{"plantId":..,"_tag":"PlantNotFoundError"}` | 404 `{"_tag":"PlantNotFoundError","plantId":..}` (same keys, order differs) |
| per-endpoint status override (`status(403)`) | n/a | 403 `{"_tag":"UnauthorizedError","message":"no"}` |
| path param `aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee` | 200 (`Schema.UUID`) | 400 empty (`isUUID()`); 200 with `isGUID()` |
| payload missing required field | 400 `{"issues":[{"_tag":"Missing","path":["name"],"message":"is missing"}],"message":"...","_tag":"HttpApiDecodeError"}` | 400 empty |
| malformed JSON body | 400 empty | 400 empty |
| 201 success, query default, trailing slash, 204 delete | same in both | same in both |
| handler defect | 500 empty | 500 empty |

The v3 client schema rejects the v4 success body. `Schema.decodeUnknownEither(Item)` in v3 returns `Left` for `note: null` and for `n: "NaN"` (measured in `http3.ts`).

0. **`Schema.optional` fields set to `undefined` now serialize as `null` (highest risk).** HttpApi wraps every success, error and payload schema in `Schema.toCodecJson` unless the endpoint sets `disableCodecs: true` (`HttpApiEndpoint.ts:1148-1167,1427-1450`). `toCodecJson` encodes an optional field holding `undefined` as `null`. v3 omitted the key. An old v3 client decoding the response with `Schema.optional(X)` fails with a ParseError on a 200 response, so the screen errors out. The repo has 214 `Schema.optional` and 87 `Schema.optionalWith` fields, and 112 `Option.getOrUndefined` calls that produce exactly these `undefined` values. Switching fields to `Schema.optionalKey` is not a fix, because returning `undefined` under `optionalKey` fails encoding and yields an empty 400 (measured). The measured opt-out is `disableCodecs: true` on each endpoint, which restores v3 output (key dropped). It also disables string-tree coercion of params and query, which is harmless here since all are strings. Alternatively, keep codecs on and add an encode-side transform that drops `undefined` keys, or make handlers omit the keys. Either way, it needs a test that snapshots response bodies against the v3 client decoder.

1. **Request validation 400 body becomes empty.** v3 returns `400` with JSON `{ "_tag": "HttpApiDecodeError", "issues": [...], "message": "..." }` (v3 `HttpApiError.ts:34-60`, raised from `HttpApiBuilder.ts:699-701`, and the same class wraps success-encode failures). v4 raises `HttpApiSchemaError` (`Data.TaggedClass`, `kind`, `cause`) and renders it as `HttpServerResponse.empty({ status: 400 })` (v4 `http-api/HttpApiError.ts:22,477-501`). Response-encode failures die with the same Respondable and also become empty 400 (`HttpApiBuilder.ts:892-909`, `http/HttpServerError.ts:313-318`). The old v3 client decodes 400 bodies through `parseJsonOrVoid` and a union of the endpoint's 400 schemas (v3 `HttpApiClient.ts:160-175,416-520`). An empty body decodes to `undefined`, fails the union, and surfaces as a `ParseError` instead of an `HttpApiDecodeError`. The app maps both to `UnknownError` (`app/src/utils/client.tsx:240-276`), so the category holds but the user-visible message changes. Restore the v3 body with `HttpApiMiddleware.layerSchemaErrorTransform` (`http-api/HttpApiMiddleware.ts:489-506`) emitting a v3-shaped `HttpApiDecodeError` with status 400.
2. **Path params with `Schema.UUID` get stricter.** v3 `Schema.UUID` accepts any 8-4-4-4-12 hex (`effect@3.19.19/src/Schema.ts:5334`). v4 `Schema.isUUID()` requires version nibble 1-8 and variant 8/9/a/b, plus the nil and max UUIDs (`v4/Schema.ts:6738-6745`). Production ids come from Postgres and should pass (inferred). The repo has 3 non-RFC literals (`00000000-0000-0000-0000-000000000001`, `aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee`, and the nil UUID) that would 400. `Schema.isGUID()` (`v4/Schema.ts:6793-6827`) reproduces the v3 regex. Use it for the 21 `param(..., Schema.UUID)` sites to keep the contract byte-identical. Measured, `aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee` returns 200 on v3, an empty 400 on v4 with `isUUID()`, and 200 on v4 with `isGUID()`.
3. **Domain error bodies stay the same shape.** v4 `Schema.TaggedError` is a `Class` over `TaggedStruct<Tag, Fields>` (`v4/Schema.ts:15547-15561`), so the body is still `{ _tag, ...fields }` and `isKnownError` in the app keeps matching on `_tag`. Statuses carry over if each `HttpApiSchema.annotations({ status })` becomes `{ httpApiStatus }` and each `.addError(E, { status })` becomes `E.pipe(HttpApiSchema.status(N))`. The default when a status is missing is still 500 for errors and 200 for successes (`HttpApiSchema.ts:1090-1129`). A missed annotation silently turns a 4xx into a 500, which also fires the 5xx alerter in `middleware/observability.ts`.
4. **Automatic JSON codec on every body, other effects.** Besides risk 0, `toCodecJson` encodes `NaN`/`Infinity` numbers as the strings `"NaN"`/`"Infinity"`, where v3 `JSON.stringify` produced `null`. Both break the v3 client, so this only matters if a handler can emit non-finite numbers. The repo's wire schemas are otherwise JSON-native (0 uses of `DateFromSelf`, `Option`, `OptionFromNullOr`, `BigInt`, `Redacted` in api/shared, 1 `Uint8Array`). v4 `Schema.Date` (a Date instance) encodes to an ISO string through its `toCodecJson` link (`v4/Schema.ts:9348-9367`). Measured, `"when":"1970-01-01T00:00:00.000Z"` is identical in both versions, so HttpApi output for the 90 `Schema.Date` fields is unchanged. Manual `Schema.decode*` calls on those schemas outside HttpApi change meaning. That belongs to the Schema section.
5. **Built-in statuses unchanged.** Route not found is an empty 404, an unhandled defect an empty 500, client abort 499, server abort 503, in both versions (v3 `HttpServerError.ts:82,104`, `internal/httpServerError.ts:101-103`; v4 `http/HttpServerError.ts:136,173,372-375`).
6. **Auth semantics.** Bearer extraction now checks the scheme (`HttpApiBuilder.ts:553-561`). A header like `bearer x` or `Token x` decodes differently from v3's blind `slice(7)`. The app sends `Bearer ${t}` (`client.tsx:575`), so this is a guess-level risk only for third-party callers. The middleware failure body (`UnauthorizedError`, 401) keeps its shape.
7. **OpenAPI.** Both versions emit `openapi: "3.1.0"` (v3 `OpenApi.ts:241`, v4 `http-api/OpenApi.ts:335`). JSON Schema output is regenerated by the new Schema `toJsonSchema` pipeline, so the document will differ in detail (UUID now carries `format: "uuid"` plus a stricter pattern, `Schema.isUUID` `toJsonSchema` at `v4/Schema.ts:6784`). No repo code or test consumes `/openapi.json` (grep finds only `index.ts:184`).
8. **Routes and prefixes unchanged.** Prefix joining is identical and trailing slashes are ignored by default in v4 FindMyWay, so `/api/plants` and `/api/plants/` still both resolve.

### Not found / no v4 equivalent

`HttpApiEndpoint` builder methods `addSuccess`, `addError`, `setPayload`, `setPath`, `setUrlParams`, `setHeaders` are gone, replaced by constructor options. Tagged-template endpoint paths are gone. `HttpApiSchema.param`, `HttpApiSchema.annotations`, `HttpApiSchema.Multipart`, `HttpApiMiddleware.Tag`, `HttpApiBuilder.api/serve/middlewareCors/middlewareOpenApi`, `HttpRouter.Default/empty/get/post/del`, `HttpApiDecodeError`, `BunContext`, and the `disablePrettyLogger` runMain option have no same-name v4 export. Each has the replacement listed above.

## 7. Wire-format changes, consolidated

Old mobile builds decode the new server's responses with v3 schemas, and the admin SPA uses raw `fetch`, so any byte-level change below can break clients that are already in the wild. Each item says what changed, how we know, and the fix that preserves the contract.

| # | Change | Evidence | Who breaks | Contract-preserving fix |
| --- | --- | --- | --- | --- |
| W1 | `Schema.optional` field holding `undefined` is serialized as `null` (v3 omitted the key) | measured (`v4play/wire.ts`, `wire2.ts`, `http4.ts` against `v3/http3.ts`) | old app: v3 `Schema.optional(X)` rejects `null`, so the whole 200 response fails to decode | `disableCodecs: true` on endpoints (measured to restore v3 output), or strip `undefined` keys before encoding. `optionalKey` is not a fix (measured: empty 400). |
| W2 | `Schema.Number` `NaN`/`Infinity` serialized as `"NaN"`/`"Infinity"` (v3: `null`) | measured | old app (rejects both forms anyway) | `Schema.Finite` on wire fields; it also cleans the OpenAPI and MCP JSON Schema |
| W3 | Request-validation 400 body becomes empty (v3: `{_tag:"HttpApiDecodeError", issues, message}`) | measured | old app error message; admin form errors | `HttpApiMiddleware.layerSchemaErrorTransform` emitting the v3 shape |
| W4 | `Schema.UUID` path params reject non-RFC-4122 ids | measured | callers using fixture or legacy ids; prod ids are compliant (inferred) | `Schema.String.check(Schema.isGUID())` |
| W5 | Status codes come from `httpApiStatus` annotations; any missed conversion becomes 500 | read | every client; also triggers the 5xx alerter | codemod all 53 + 225 + 10 sites; add a status snapshot test per endpoint |
| W6 | Domain error bodies `{_tag, ...fields}` unchanged (key order differs) | measured | nobody | none |
| W7 | Success dates: `Schema.Date` fields still go out as ISO strings | measured | nobody, as long as the codemod maps them to `DateFromString` | `DateFromString` |
| W8 | 201/204, prefixes, trailing slashes, CORS headers, 404/500 empty bodies unchanged | measured / read | nobody | none |
| W9 | OpenAPI and JSON Schema documents: draft-2020-12, `additionalProperties: true`, `anyOf null` for optionals, NaN enums for Number, strict UUID pattern | measured | MCP clients (tool `inputSchema`); no in-repo OpenAPI consumer | snapshot `tools/list` and `/openapi.json` before and after |
| W10 | MCP HTTP transport: `GET /mcp` becomes 405 (repo serves 200 for ChatGPT); 406/415/403 enforcement on POST; string `outputSchema`/`structuredContent` for `ask_plant_question`; protocol 2024-10-07 dropped | read | ChatGPT and claude.ai connectors | live test against both clients before cutover |
| W11 | `SqlError.message`/`cause` content changes; with drizzle 1.0 `EffectDrizzleQueryError.message` embeds SQL and parameters | read | any handler that echoes `error.message` into a body or a user-visible log | audit the 33 `SqlError` handlers |
| W12 | pg `int8` decodes to `bigint` | read | any response that includes a raw `count(*)` without `Number(...)`; `JSON.stringify` throws | keep the casts; audit the 24 `db.execute` sites |
| W13 | Railway log `level` casing (`INFO` instead of `info`) and loss of log span events unless `Logger.tracerLogger` is kept | read | log-based alerting, Honeycomb views | explicit formatter; include `Logger.tracerLogger` |
| W14 | `http.duration_ms` span attribute becomes a `Duration` object (`DateTime.distance` return type) | measured type change, inferred effect on Honeycomb | Honeycomb queries and boards on `http.duration_ms` | `Duration.toMillis(DateTime.distance(...))` |

## 8. RPC/MCP, AI, SQL, OpenTelemetry, process, cluster/workflow, Logger: v3 to v4

Sources. v4 = `scratchpad/v4/package/src` (effect 4.0.0) and `scratchpad/v4pkgs/*/package/src` (@effect/sql-pg, platform-bun, opentelemetry, vitest 4.0.0). v3 = installed `node_modules/.bun/...`. Paths below are abbreviated: `v4:` = `scratchpad/v4/package/src/`, `v4pg:` = `scratchpad/v4pkgs/sql-pg/package/src/`, `v4otel:` = `scratchpad/v4pkgs/opentelemetry/package/src/`. Repo paths are relative to `/Users/antoine2vey/projects/lily`.

### RPC patch (`patches/@effect%2Frpc@0.73.2.patch`)

What it fixes in v3 `RpcSerialization.jsonRpc` (two things):

1. String JSON-RPC ids. v3 converts request ids through `BigInt`/`Number`, so a non-numeric id such as `"init_1"` (sent by claude.ai) crashed, and string ids came back as numbers. The patch keeps a module-global `Map` from a synthetic numeric id back to the original string.
2. Single-element batch unwrapping. v3 encoded an array response of length 1 as `[ {...} ]`; the patch emits the bare object.

Status in v4: both fixed upstream, so the patch and the `patchedDependencies` entry in root `package.json:42-44` should be deleted (there is no `@effect/rpc` package in v4 to patch).

- `v4:rpc/RpcMessage.ts:47,56` defines `RequestId = Branded<string | number>` and the constructor is an identity cast. No `BigInt` anywhere in `v4:rpc/RpcServer.ts` (grep for `BigInt` returns nothing; ids flow through `RequestId(request.id)` at `RpcServer.ts:778,820,1164`).
- `v4:rpc/RpcSerialization.ts:335` decodes `id: request.id ?? ""` (raw value, no stringification); `encodeJsonRpcMessage` (`:448-505`) writes `id: response.requestId` back unchanged.
- `v4:rpc/RpcSerialization.ts:431-433` (`encodeJsonRpcResponse`): `if (encoded.length === 1) return encoded[0]`, the same unwrap the patch adds.
- `v4:ai/McpSchema.ts:108` `RequestId` is `Union[String, Number]`; `v4:ai/McpServer.ts:1105` passes ids through `RpcMessage.RequestId(request.id)`; `mcpJsonRpcSerialization` (`McpServer.ts:1672-1712`) tracks cancelled ids as `string | number`.

Confidence: high (read the code paths). Verify with one request carrying `"id":"init_1"` against the v4 server before deleting the patch.

### @effect/ai (MCP server). Only `packages/mcp` uses it (6 files); `packages/api` does not import `@effect/ai`

| v3 API | v4 replacement | Kind | Count | Notes |
|---|---|---|---|---|
| `import { McpServer, McpSchema, Tool, Toolkit } from '@effect/ai'` | `from 'effect/ai'` (barrel, same namespaces) | mechanical | 6 imports | `@effect/ai` package removed. |
| `Tool.make(name, { parameters: { a: S, b: S } })` | `Tool.make(name, { parameters: Schema.Struct({ a, b }) })` | mechanical (wrap) | 4 of 6 tools (`packages/mcp/src/tools/definitions.ts:22,34,57,83`) | v4 `parameters` is a `Schema.Constraint`, not a fields record (`v4:ai/Tool.ts:1264-1305`). Default is `Tool.EmptyParams = Schema.Record(String, Never)` (`Tool.ts:2179`). |
| `Schema.optionalWith(X, { exact: true }).annotations({description})` inside params | `Schema.optionalKey(X).annotate({ description })` | mechanical | 3 (`definitions.ts:23,72,90`) | Covered by the Schema section. |
| `tool.annotate(Tool.Readonly, true)` | unchanged | none | 5 | `Readonly/Destructive/Idempotent/OpenWorld` are now `Context.Reference<boolean>` (`Tool.ts:1874-1957`), so `Context.get(tool.annotations, Tool.Readonly)` returns the default when unset. |
| `AiTool.Any`, `tool.parametersSchema`, `tool.name`, `tool.description`, `tool.annotations` | same names | none | 7 | `v4:ai/Tool.ts:256-274`. |
| `Toolkit.make(AskPlantQuestion)`, `TextToolkit.toLayer(Effect.gen(...))` | unchanged | none | 2 | `v4:ai/Toolkit.ts:102,491`. |
| `McpServer.toolkit(TextToolkit)` | unchanged name | semantic | 1 (`index.ts:174`) | v4 `registerToolkit` now emits `outputSchema` from the success schema and `structuredContent` = encoded result (`McpServer.ts:1873-1893,1924`). With `success: Schema.String` this yields `outputSchema: {type:"string"}` and a string `structuredContent`. The MCP spec requires an object for both. Inferred risk: strict clients may reject `ask_plant_question`. Use an object success schema, or keep custom `addTool` registration. |
| `new McpSchema.Tool({...})` | unchanged (still `Schema.Class`, `McpSchema.ts:1690`) | none | 2 | v4 adds `title`, `outputSchema`, `icons`, and **`_meta`** fields. |
| `new McpSchema.ToolAnnotations({...})` | plain object literal | semantic (small) | 1 (`handlers.ts:83`) | `ToolAnnotations` is now `Schema.Opaque` (`McpSchema.ts:1587`), not a constructible class. |
| `new McpSchema.CallToolResult({ content, structuredContent, _meta })` | unchanged | none | 2 | `McpSchema.ts:1772`. |
| `registry.addTool({ tool, handle })` | `registry.addTool({ tool, annotations: tool.annotations, handle })` | mechanical | 2 (`handlers.ts:222,250`) | `annotations: Context.Context<never>` is required (`McpServer.ts:203-225`). `handle` returns `Effect<CallToolResult \| InputRequired, InternalError \| InvalidParams, McpRequestContext>`. |
| `Schema.decodeUnknown(tool.parametersSchema)` | `Schema.decodeUnknownEffect(...)` | mechanical | 1 (`handlers.ts:221`) | |
| `JSONSchema.fromAST(ast, { definitions, topLevelReferenceStrategy: 'skip' })` + hand-rolled `makeJsonSchema` | `Tool.getJsonSchema(tool)` / `Tool.getJsonSchemaFromSchema(schema)` | semantic | 1 helper (`handlers.ts:44-68`) | Delete the helper. v4 emits **JSON Schema draft-2020-12** via `Schema.toJsonSchemaDocument` (`Tool.ts:1786-1810`); v3 emitted draft-07. Wire change for MCP clients: `$defs` placement, the encoding of `optionalKey`, and literal unions may differ. Snapshot the `tools/list` response before and after. |
| `McpSchema.param('plantId', Schema.String)` + ``McpServer.resource`plant://${p}`({ content: (uri, plantId) => ... })`` | unchanged | none | 1 + 6 `resource` | `v4:ai/McpSchema.ts:3365`, `McpServer.ts:2241-2340`. `content` may return `ReadResourceResult \| string \| Uint8Array`. |
| `McpServer.layerHttp({ name, version, path })` | `McpServer.layerHttp({ name, version, path, protocols: [McpProtocol.v2025_06_18, McpProtocol.v2025_03_26, McpProtocol.v2024_11_05], allowedOrigins })` | semantic | 1 (`index.ts:184`) | `protocols` is required (`McpServer.ts:1550-1562`; adapters at `v4:ai/McpProtocol.ts:211-254`). v3 accepted 2025-06-18, 2025-03-26, 2024-11-05, 2024-10-07 (`@effect/ai/src/McpServer.ts:308-313`); 2024-10-07 has no v4 adapter. Requires `HttpRouter.HttpRouter` (the v4 router service), not `HttpRouter.Default`. |
| `server.initializedClients` (used to delay `notifications/tools/list_changed`) | **no v4 equivalent** | semantic | 1 (`index.ts:116-131`) | The v4 `McpServer` service shape (`McpServer.ts:203-290`) has no `initializedClients`. `server.notifications[...]` still exists (broadcast RpcClient). This hack only exists so ChatGPT sees `_meta`, so redesign it away (next row). |
| `toolMetaMiddleware` (patches the `tools/list` body via `HttpApp.appendPreResponseHandler`) | `tool.annotate(Tool.Meta, { ui: { resourceUri }, 'openai/outputTemplate': uri })` | semantic, a simplification | 1 file (`widgets/tool-meta-middleware.ts`) | v4 reads `Tool.Meta` into `McpSchema.Tool._meta` (`McpServer.ts:1849,1904`; `Tool.ts:1849`). That makes the body-rewriting middleware and `ToolsListChangedOnConnectLayer` deletable. For custom `addTool`, set `_meta` on `new McpSchema.Tool`. If kept, `HttpApp.appendPreResponseHandler` becomes `HttpEffect.appendPreResponseHandler` (`v4:http/HttpEffect.ts:255`). |

MCP transport behavior changes that clients will see (wire-visible, verified in `v4:ai/McpServer.ts:1520-1615`):

- `GET /mcp` now returns **405** with `allow: POST`, registered by `layerHttp` itself (`:1572`). The repo registers its own `GET /mcp → 200` ("ChatGPT checks this endpoint", `index.ts:81-84`) and `DELETE /mcp → 405`. Both collide with routes `layerHttp` adds for GET/PUT/PATCH/DELETE/OPTIONS. Expect a duplicate-route error at startup, or a 405 where ChatGPT wanted 200. This needs a decision and a live test.
- `POST /mcp` returns **415** unless `content-type` is `application/json`, and **406** unless `Accept` includes both `application/json` and `text/event-stream` (`:1603-1609`). v3 did not enforce this. Old or lenient clients may break.
- Requests carrying an `Origin` header get **403** unless the origin is in `allowedOrigins` (`:1600`). Pass the existing `McpAllowedOrigins` config through. Server-side connectors usually send no Origin (guess, not verified).
- `OPTIONS /mcp` is answered by `layerHttp` with 405. The repo's CORS middleware wraps the app, so preflight should still short-circuit in middleware. Verify.

### SQL

#### `@effect/sql` / `@effect/sql-pg`

| v3 API | v4 replacement | Kind | Count | Notes |
|---|---|---|---|---|
| `import { SqlError } from '@effect/sql/SqlError'` | `import { SqlError } from 'effect/sql/SqlError'` | mechanical | 171 files (170 src, 1 test) | `effect/sql/SqlError` resolves via the `"./*": "./dist/*.js"` export. Do NOT use the `effect/sql` barrel with `{ SqlError }`, because there `SqlError` is the module namespace (`v4:sql/index.ts:30`). |
| `SqlError` as a type, and in `catchTag('SqlError')` / `catchTags({ SqlError })` | unchanged | none | ~307 type positions, 33 handlers | `_tag` is still `"SqlError"` (`v4:sql/SqlError.ts`, class `SqlError` `TaggedError(...)("SqlError", { reason })`). |
| `new SqlError({ cause, message })` | `new SqlError({ reason: new UnknownError({ cause, message }) })` | semantic | 2 (`packages/api/src/repositories/ingest-job.repository.ts:68`, `packages/api/src/__tests__/services/rag/rag-service.test.ts:126`) | v4 `SqlError` holds `reason: SqlErrorReason`, a union of `ConnectionError`, `AuthenticationError`, `AuthorizationError`, `SqlSyntaxError`, `UniqueViolation{constraint}`, `ConstraintError`, `DeadlockError`, `SerializationError`, `LockTimeoutError`, `StatementTimeoutError`, `UnknownError`. `cause` getter = `reason`, `message` = `reason.message \|\| reason._tag`, and it adds `isRetryable`. Anything that logged or serialized `error.cause` (e.g. `engagement-scheduler/scheduler.ts:640` `String(error.cause)`) now prints the reason object, not the pg error. |
| `import * as SqlClient from '@effect/sql/SqlClient'`, `SqlClient.SqlClient`, `sql.withTransaction` | `'effect/sql/SqlClient'`, same members | mechanical | 2 files / 4 uses | `v4:sql/SqlClient.ts:61`. |
| `PgClient.layerConfig({ url: Config.redacted('DATABASE_URL') })` | `PgClient.layerConfig({ url: Config.Redacted('DATABASE_URL') })` | mechanical | 3 (`packages/db/src/index.ts`, `packages/knowledge-db/src/index.ts:12`) | `v4pg:PgClient.ts:377` takes `Config.Wrap<PgPoolConfig>`. Error type is `ConfigError \| SqlError`. Pool idle default is still 10s, `minConnections` 0 (`v4pg:PgPool.ts:158-163`), so the "first query per tick pays reconnect" profile from memory persists. Set `minConnections: 1+` to fix it. |
| `Layer.scoped` + `Layer.buildWithScope(KnowledgePgClientLive, scope)` | `Layer.effect` + `Layer.buildWithScope` | mechanical + semantic note | 1 (`knowledge-db/src/index.ts:22-31`) | v4 `buildWithScope` builds with a **fork of the current MemoMap** (`v4:Layer.ts`, `CurrentMemoMap.forkOrCreate`). It is no longer a fresh map: lookups fall through to the parent (`MemoMapImpl.get` → `parent?.get`). Still safe because `KnowledgePgClientLive` is a distinct layer object, but the code comment's guarantee changes. |

#### Driver change: v4 `@effect/sql-pg` is a native protocol client, not `pg`

`v4pkgs/sql-pg/package.json` has no dependencies, only peer `effect`. `PgConnection`/`PgProtocol`/`PgTypes` implement the wire protocol, **binary result format only** (`v4pg:PgTypes.ts:1-30`, `decode` at `:1683-1695`). Value decoding changes against v3 `pg` defaults:

| PG type | v3 (pg) | v4 | Impact here |
|---|---|---|---|
| `int8` / `count(*)` without a cast | `string` | **`bigint`** (`PgTypes.ts:1250-1262`) | Drizzle `count()` uses `mapWith(Number)`: fine. Raw `COUNT(*)` in `achievement.repository.ts:215,331` is wrapped in `Number(...)`: fine. Any unwrapped bigint reaching `JSON.stringify` throws. Grep finds none uncast in repos, but audit `db.execute` (24 sites). |
| `numeric` | `string` | `string` | none |
| `date` | `Date` (local midnight) | **`"YYYY-MM-DD"` string** (`dateCodec`, `:1092-1098`) | One column, `date('date', { mode: 'string' })`. Drizzle's string mode handles both. Raw `db.execute` reading a `date` column changes type. |
| `timestamp` (no tz), 23 columns | `Date` parsed in **process local TZ** | `Date` with wall-clock as **UTC fields** | Identical when TZ=UTC (Railway, presumably). Differs on a dev machine or in tests running in a non-UTC TZ. |
| `timestamptz` | `Date` | `Date` | none |
| `json`/`jsonb` | parsed | parsed | none |
| unknown OIDs (pgvector `halfvec(3072)`, enums) | text format → string | binary bytes **decoded as UTF-8** | Enums are fine (binary = label). **`halfvec` binary is not text**, so `vector.fromDriver` (`knowledge-db/src/schema/processed-chunks.ts:22-25`) would produce `NaN[]` for any query that SELECTs `embedding`. Register a `halfvec` codec via `types: PgTypes.Registry`, or never select the column (inferred from code, not run). |
| Parameters | text | typed binary; `Date` params bind as `timestamptz` (`PgTypes.ts:23-27`); `prepare` option (named prepared statements) | Drizzle sends strings for timestamps, so no change. Check pgbouncer/Railway proxy compatibility with prepared statements (`prepare?: boolean`, `v4pg:PgClient.ts:142`). |

`executeRaw` result keeps `{ command, rowCount, oid, rows, fields }` (`v4pg:PgConnection.ts:162-168`). `unwrapPgRows` (`api/src/repositories/helpers/pagination.ts:45`) keeps working if the bridge still returns `{ rows: [header] }`.

#### `@effect/sql-drizzle/Pg`: no v4 release

npm `@effect/sql-drizzle` latest is 0.51.0 (peers `effect ^3.22`, `@effect/sql ^0.52`). No 4.x, no beta, no rc. **No v4 equivalent.** 43 files import it (`PgDrizzle.PgDrizzle` ×47, `.layer` ×2, `.make` ×2).

How the v3 bridge works (`node_modules/.bun/@effect+sql-drizzle@0.48.1.../src`, about 120 LOC total):

- `Pg.ts`: `drizzle(remoteCallback)` from `drizzle-orm/pg-proxy`. `PgDrizzle` is a `Context.Tag` over `PgRemoteDatabase`. `patch(QueryPromise.prototype)` and `patch(PgSelectBase.prototype)` make every drizzle query an `Effect<T, SqlError>`, which is why the repo writes `yield* db.select()...`.
- `internal/patch.ts`: `Effectable.CommitPrototype` + `commit()` grabs `Effect.runtime()`, stashes it in a module-global `currentRuntime`, and calls `this.execute()`. The remote callback runs `client.unsafe(sql, params)` (`.raw` for `execute`, `.values` for `all`/`values`, `.withoutTransform` otherwise) with `Runtime.runPromise(currentRuntime)`. Capturing the caller's runtime is what makes drizzle queries join `sql.withTransaction` (`care-multiple-plants.ts:55`).

In-repo v4 port, estimated at roughly 100 LOC, as a new `packages/db/src/drizzle-effect.ts`:

- Replace `Effectable.CommitPrototype` with `Effectable.Prototype({ label, evaluate(fiber) })` (`v4:Effectable.ts:32-50`; `Mixin`/`Class` also available), installed onto `QueryPromise.prototype` and `PgSelectBase.prototype` via `Object.defineProperties`. `evaluate` receives the fiber, so `fiber.context` replaces `Effect.runtime()`. Watch `Mixin`'s note that Effect proto shadows `pipe`, `toString`, `toJSON`, and `[Symbol.iterator]`.
- Replace `Runtime.runPromise(runtime)` with `Effect.runPromiseWith(context)` (`v4:Effect.ts:17936`); `Effect.either` becomes `Effect.result`.
- Replace `Context.Tag("@effect/sql-drizzle/Pg")` with `Context.Service<PgDrizzle, PgRemoteDatabase>()("...")`.
- Replace `new SqlError({ cause, message })` with the `reason` form.
- `Statement.raw/values/withoutTransform` still exist (`v4:sql/Statement.ts:77-81`).
- Keep the `declare module "drizzle-orm" { interface QueryPromise<T> extends Effect.Effect<T, SqlError> }` augmentation. In v4, `Effect` is an interface with `[Symbol.iterator]` and `asEffect`, and type-level conformance must be rechecked under the new `Effect` interface.
- Risk: the module-global `currentRuntime` handoff relies on `this.execute()` calling the callback synchronously. Same assumption as v3; keep a transaction test (`care-multiple-plants`) as the guard.

Alternative: drop `pg-proxy` and use `drizzle-orm/node-postgres` with `pg` directly, giving up `SqlClient` transactions. Rejected for this catalog because it changes the transaction model.

#### Official replacement: `drizzle-orm/effect-postgres` (drizzle-orm 1.0.0-rc.4)

The 4.0.0 migration annotations (`scratchpad/migration4/annotations/effect__sql-drizzle__Pg.yaml`) declare `@effect/sql-drizzle` removed, with these mappings: `Pg.make` → `drizzle-orm/effect-postgres#makeWithDefaults`, `Pg.layer` → `Layer.effect(AppDb, PgDrizzle.makeWithDefaults())`, `PgDrizzle` tag → `EffectPgDatabase` type plus an app-defined service. The export exists only in drizzle-orm **1.0.0-rc.4** (`rc` tag; `latest` is still 0.45.3). Peers are `effect >=4.0.0`, `@effect/sql-pg >=4.0.0`, both optional. Read from the packed tarball at `scratchpad/drizzle1/package`.

| Concern | v3 bridge (`@effect/sql-drizzle` 0.48 + drizzle 0.45) | drizzle 1.0 `effect-postgres` | Repo impact |
|---|---|---|---|
| Construction | `PgDrizzle.layer` (needs `SqlClient`) | `make(config)` needs `PgClient` + `EffectLogger` + `EffectCache`; `makeWithDefaults(config)` provides no-op logger/cache (`effect-postgres/driver.js`) | Define `class Db extends Context.Service<Db, EffectPgDatabase>()("Db")`. Rewrite `packages/db/src/index.ts` (`DrizzleLive`) and `packages/knowledge-db/src/index.ts` (`KnowledgeDrizzleLive`). The 43 files use `PgDrizzle.PgDrizzle` as a tag: a codemod renames the tag import, and `yield* PgDrizzle.PgDrizzle` becomes `yield* Db`. |
| `yield* db.select()...` | `QueryPromise` patched with `Effectable.CommitPrototype` + runtime handoff | Query builders get `Effectable.Prototype({ evaluate() { return this.execute() } })` (`effect-core/query-effect.js`); `execute()` returns a real Effect | Still works. Builders are Effects, so no global-runtime hack. |
| Error channel | `SqlError` | **`EffectDrizzleQueryError`** `{ query, params, cause: Cause.fail(SqlError) }` (`pg-core/effect/session.js:63-69`, `effect-core/errors.js`); also `EffectDrizzleError` and `EffectTransactionRollbackError` | **Semantic, large.** Every repository signature `Effect<A, SqlError>` (~307 type positions, 171 imports) and the 33 `SqlError:` handlers / `catchTag('SqlError')` must become `EffectDrizzleQueryError`, or each repo boundary maps it back. tsc flags `catchTag` on an absent tag, so this is compile-guided, not silent. The default `message` is `Failed query: <sql>\nparams: <params>`, which may leak SQL and params if any handler echoes `error.message` into an HTTP body or logs. |
| Transactions | `sql.withTransaction(effect)` works because the bridge captured the caller runtime | `db.transaction(tx => Effect)` → `client.withTransaction(...)` (`effect-postgres/session.js`). Plain `sql.withTransaction` also works because queries are real Effects in the same fiber | `care-multiple-plants.ts:55` keeps working. Zero `db.transaction(` calls in src. |
| Relational queries (RQB) | v1 `relations()` + `db.query.x.findMany` | RQB v2 (`defineRelations`); v1 `relations` moved to `drizzle-orm/_relations` | **0** `db.query.*.findMany/findFirst` calls in `packages/*/src`. The 43 `relations(...)` definitions in `packages/db/src/schema` (imported from `'drizzle-orm'`) are unused by queries. Delete them, or re-point the import to `drizzle-orm/_relations` if the integration tests' `drizzle(pool, { schema })` needs them. |
| Type decoding | pg-proxy + v3 `pg` parsers | `effectPgCodecs` cast `timestamp`/`timestamptz`/`date`/`interval` to text in SQL and normalize in JS (`textToDateWithTz` treats tz-less timestamps as UTC); `bigint` columns normalize via `BigInt` (`effect-postgres/codecs.js`) | Typed column selects are consistent and UTC-defined, an improvement over v3 local-TZ parsing. Raw `db.execute` (24 sites) still sees v4 sql-pg binary decoding (int8 → bigint, date → string). The `halfvec` customType still decodes from binary unless given a text cast or codec (`pg-core/columns/custom.d.ts:206-253` documents casts). |
| drizzle-kit | 0.31.8 | must move to 1.0 rc with drizzle-orm | Prod migrations do not depend on it: `packages/db/scripts/migrate.ts` reads flat `drizzle/*.sql` with `bun` SQL and its own `__drizzle_migrations`. Kit 1.0 uses a new migrations folder layout (expected from the 1.0 release line, not verified in the tarball). Any future `db:generate` output may stop being picked up by `migrate.ts`, which only globs top-level `*.sql`. `db:push` (local workflow) needs kit/orm version parity. The journal-drift memory note is unaffected because `_journal.json` is not read by `migrate.ts`. |

Recommendation: adopt `drizzle-orm/effect-postgres`, which is the official path, over the in-repo port. Accept the rc pin. Run the error-type rename as a dedicated codemod step, since the tag rename is mechanical but handler bodies need review.

### OpenTelemetry

| v3 API | v4 replacement | Kind | Count | Notes |
|---|---|---|---|---|
| `NodeSdk.layer(() => ({ resource: { serviceName }, spanProcessor: new BatchSpanProcessor(new OTLPTraceExporter({ url, headers })) }))` (`packages/api/src/telemetry/otel.ts`) | Option A: `@effect/opentelemetry@4` `NodeSdk.layer`, same `Configuration` shape (`v4otel:NodeSdk.ts:37-51,113`). Option B, recommended: `OtlpTracer.layer` from `effect/observability` (no OTel SDK; needs an `HttpClient` layer such as `FetchHttpClient.layer`). | A mechanical, B semantic | 1 | Option A requires upgrading the OTel SDK to **2.x**. v4 peers are `@opentelemetry/resources >=2`, `sdk-trace-base >=2`, `sdk-trace-node >=2`, and `api-logs`/`sdk-logs >=0.203`. The repo pins `resources ^1.22`, `sdk-trace-base ^1.22`, `sdk-trace-node ^1.22`, `exporter-trace-otlp-http ^0.57` (`packages/api/package.json`). All peers are optional (`peerDependenciesMeta`). Option B: use `Otlp.layer` only if logs and metrics are wanted too. It exports `/v1/logs` and `/v1/metrics` as well (`v4:observability/Otlp.ts:37-62`), which would start shipping logs to Honeycomb (volume and cost change). For traces only, use `OtlpTracer.layer`. |
| `Config.boolean/string` in otel.ts | `Config.Boolean/String` | mechanical | 4 | See the core section. |

Honeycomb continuity (verified by grep, both versions): HTTP server span name `http.server <METHOD>` with `http.request.method`, `url.path`, `http.response.status_code` (`v4:http/HttpMiddleware.ts:139,233-276`), plus `http.route` (`v4:http/HttpRouter.ts:231`). SQL spans `sql.execute` with `db.operation.name`, `db.query.text` (`v4:sql/Statement.ts:1290-1291,1357`) and transaction events `db.transaction.commit/rollback/savepoint`. Names and attributes match v3. `Effect.fn("name")` and `withSpan` names are unchanged. Not verified: the `db.system.name` attribute set by v3 sql-pg (`@effect/sql-pg/src/PgClient.ts:30`); check `v4pg:PgClient.ts` `spanAttributes` defaults before relying on it in queries. The resource `service.name` must stay `lily-api` (dataset routing).

### process / CommandExecutor

| v3 API | v4 replacement | Kind | Count | Notes |
|---|---|---|---|---|
| `CommandExecutor.CommandExecutor/makeExecutor/ExitCode/ProcessId/ProcessTypeId/Process` | `effect/process/ChildProcessSpawner` (`ChildProcessSpawner` service, `make(spawn)`, `ExitCode`, `ProcessId`, `makeHandle`) (`v4:process/ChildProcessSpawner.ts:40-262`) | semantic | 1 file, 8 uses (`packages/api/src/__tests__/mocks/command-executor.ts`), used by 6 test files | Test-only mock. It exists because `BunContext.layer` pulled in `CommandExecutor`. v4 `BunServices.layer` (`v4pkgs/platform-bun/src/BunServices.ts:41`) replaces `BunContext.layer` and bundles `ChildProcessSpawner`, `FileSystem`, `Path`, and the rest. Likely deletable rather than portable. |

### @effect/cluster, @effect/workflow, @effect/experimental, @effect/rpc

Zero imports anywhere in `packages/*/src` (grep). They are declared only in `packages/mcp/package.json` (`@effect/cluster ^0.56.4`, `@effect/experimental ^0.58.0`), `packages/db/package.json:47` (`@effect/experimental`), and `packages/api/package.json:37` (`@effect/workflow ^0.16.0`). Drop them before the migration. `@effect/rpc` is not a direct dependency; it is only the `patchedDependencies` target. Drop the patch.

### Logger / LogLevel

| v3 API | v4 replacement | Kind | Count | Notes |
|---|---|---|---|---|
| `Logger.withMinimumLogLevel(LogLevel.None)` | `Effect.provideService(References.MinimumLogLevel, "None")` | mechanical | 37 (13 test files + src) | `v4:References.ts:199-344`. `LogLevel` is now a string union `"All" \| "Fatal" \| ... \| "None"` (`v4:LogLevel.ts:67`). |
| `Logger.make((options) => ...)` with `options.logLevel.label` | `Logger.make(...)` with `options.logLevel` (a string) | semantic | 1 (`packages/api/src/logger.ts:14-21`) | |
| `Logger.jsonLogger.log(options)` then string-replace `"logLevel":"INFO"` with `"level":"info"` | `Logger.map(Logger.formatStructured, (s) => ({ ...s, level: s.level.toLowerCase() }))` piped to JSON and `console.log`, or `Logger.formatJson` | semantic | 1 | **Silent wire change.** v4 structured output already uses key `level` with an UPPERCASE value (`v4:Logger.ts:655-690`). The existing `.replace('"logLevel":...')` no longer matches, so Railway would receive `"level":"INFO"`. Severity classification may break silently. `fiberId` format also changes. |
| `Logger.replace(Logger.defaultLogger, railwayLogger)` | `Logger.layer([railwayLogger, Logger.tracerLogger])` | semantic | 1 | `v4:Logger.ts:1162`. Per `migration4/annotations/effect__Logger.yaml:64-66`, v4 replaces the whole active set. Omitting `Logger.tracerLogger` drops log lines as span events, which Honeycomb shows today. |
| `Logger.pretty` | `Logger.layer([Logger.consolePretty(), Logger.tracerLogger])` | mechanical | 1 | Annotation `effect__Logger.yaml:52-54`. |

### No v4 equivalent (flagged)

1. `@effect/sql-drizzle` (43 files). Removed upstream. The official replacement is `drizzle-orm/effect-postgres`, which only ships in drizzle-orm 1.0.0-rc.4 and changes the error type from `SqlError` to `EffectDrizzleQueryError`. The fallback is a roughly 100 LOC in-repo port that keeps `SqlError` and drizzle 0.45.
2. `McpServer.McpServer.initializedClients` (`mcp/src/index.ts:121`). Replace the hack with the `Tool.Meta` annotation.
3. MCP protocol `2024-10-07`. v4 adapters start at 2024-11-05.
4. `CommandExecutor` mock. Superseded by `BunServices`; delete it.
5. The `@effect/rpc` patch. Obsolete; delete it.

### Wire-format risks (old clients in the wild)

1. MCP `tools/list` input schemas switch from draft-07 to draft-2020-12 generation. Snapshot-diff them.
2. MCP `GET /mcp` changes from 200 to 405, and `POST` now enforces `Accept`/`Content-Type`/`Origin`. ChatGPT and claude.ai connectors may break.
3. `ask_plant_question` gains `outputSchema`/`structuredContent` of type string, which violates the spec.
4. Railway log `level` changes from lowercase to UPPERCASE silently, and log span events disappear unless `Logger.tracerLogger` is listed.
5b. With drizzle 1.0, `EffectDrizzleQueryError.message` embeds the SQL text and params. Check that no HTTP error body or user-facing log forwards `error.message`.
5. pg `int8` becomes `bigint`, which crashes `JSON.stringify` if one ever reaches a response body. `halfvec` binary decodes as garbage.
6. `SqlError.cause`/`.message` content changes in logs and error reporting. HTTP bodies are only affected if a handler echoes `error.message`. The 33 `SqlError:` handlers should be audited by the HttpApi owner.

## 9. Testing

| v3 pattern | v4 | Kind | Count | Notes |
| --- | --- | --- | --- | --- |
| vitest + `Effect.runPromise(eff.pipe(Effect.provide(mocks)))` | unchanged | none | 932 runPromise, 283 runPromiseExit | mocks stay at the repository level |
| `Exit.isFailure(r) && r.cause._tag === 'Fail'` then `r.cause.error` | `Cause.findErrorOption(r.cause)` | semantic (one helper) | 43 + 46 | compile-guided |
| `Logger.withMinimumLogLevel(LogLevel.None)` | `Effect.provideService(References.MinimumLogLevel, 'None')` | mechanical | 37 | |
| `Layer.setConfigProvider(ConfigProvider.fromMap(...))` | `ConfigProvider.layer(ConfigProvider.fromUnknown(...))` | semantic (small) | 8 | |
| `managedRuntime.runtime()` | `managedRuntime.context()` and `Effect.runPromiseWith` | mechanical | 6 | ai-chat tool tests |
| `TestContext.TestContext` | `TestClock.layer()` | mechanical | 5 | |
| `@effect/vitest` | optional; 4.0.0 peers `vitest >=5 <6` (read) while the repo is on vitest 3.2 | n/a | 0 | adopting it means a vitest major bump; not required |
| `CommandExecutor` mock (`__tests__/mocks/command-executor.ts`) | delete; `BunServices` replaces `BunContext` | semantic | 1 file, 6 consumers | |
| `HttpServer.layerContext` (observability test) | `HttpServer.layerServices` | mechanical | 1 | |

## 10. React Native app and other clients

The app ships `HttpApiClient.make(Api)` built from the server's `@lily/api/api` definition (`app/src/utils/client.tsx:561`). Old builds therefore decode new server responses with v3 schemas. Every wire-format item in section 7 applies to them, as well as to the admin SPA, which uses raw `fetch`.

| Concern | Detail | Kind | Evidence |
| --- | --- | --- | --- |
| **`import.meta` breaks the Hermes bundle** | `effect/dist/ConfigProvider.js:709` contains `...import.meta?.env` in executable code. The `effect` barrel re-exports `ConfigProvider`, so every app bundle includes it. babel-preset-expo 54 throws "`import.meta` is not supported in Hermes" unless `unstable_transformImportMeta: true` (default `isServerEnv`, so false for iOS and Android). v3 has 0 `import.meta` uses. | semantic, one-line config fix | **measured.** Running babel-preset-expo on the v4 file for `platform: ios` throws, and it passes with `unstable_transformImportMeta: true`. Set it in `packages/app/babel.config.js` for both the Metro and test branches. Jest goes through the same preset. |
| Client call shape | `client.group.endpoint({ path, urlParams, payload })` becomes `({ params, query, payload })`; 64 `path:` and 32 `urlParams` sites | mechanical | read (HTTP section) |
| `HttpApi.HttpApi` type arity | 4 type parameters become 2; `ExtractGroups`/`ExtractError` in `client.tsx:62-75` break | semantic | read |
| `Effect.Service` `ApiClient` + `ApiClient.Default` | `Context.Service` + an explicit layer | semantic | read |
| Either in the react-query cache | 26 app files use `Either`; values are in-memory only, and there is no react-query persister (grep), so no stored `Either` shapes need migrating | mechanical | measured grep |
| On-device JSON (`storage.ts` `UserProfileJson = Schema.parseJson(UserProfile)`, onboarding storage) | v3-written JSON must still decode. Safe only if `Schema.Date` becomes `DateFromString` and no field relies on `toCodecJson` | semantic check | read |
| Error messages shown to users | `Effect.runPromise` now rejects with the raw error; tagged errors without a `message` field have `message === ""` (v3: "An error has occurred") | semantic | measured |
| `Schedule.intersect` / `whileInput` in `AuthContext.tsx` | token-refresh retry policy; must keep "stop on auth failure" semantics | semantic | read |
| Bundle weight | `effect/http-api` barrel re-exports `HttpApiSwagger` (1.98 MB) and `HttpApiScalar` (3.25 MB) inline bundles. v3 `@effect/platform` already ships the same two files (1.96 MB, 3.40 MB), so this is not a regression. Importing `effect/http-api/HttpApiSchema`-style deep paths in shared and app code would drop about 5 MB from the Hermes bundle. | opportunity | measured file sizes |
| Hermes built-ins | `FinalizationRegistry` in `http/HttpClient.js` is feature-guarded exactly like v3. `this.#x` private fields (Metric, ai/Tool) are transpiled by Metro's Babel. `Symbol.asyncDispose` only appears as a computed method key. | none | read |
| Metro `nodeOnlyPackages` | `@effect/sql`, `@effect/workflow` and `@effect/experimental` stop existing as packages; their v4 code lives under `effect/sql` and similar subpaths, which Metro cannot exclude by package name. That is harmless as long as the app never imports them, so trim the list. | mechanical | read `metro.config.js` |
| Jest | `transformIgnorePatterns` already includes `effect`; ESM-only v4 is fine through Babel (inferred). The `import.meta` fix also applies to tests. | none | read |

## 11. No v4 equivalent (flagged)

| v3 API | Count | What to do |
| --- | --- | --- |
| `@effect/sql-drizzle` (whole package) | 43 files | Option 1: `drizzle-orm/effect-postgres` (drizzle-orm 1.0.0-rc.4, prerelease). Option 2: an in-repo port of about 100 lines that keeps drizzle 0.45 and `SqlError`. See section 8. |
| `Effect.iterate` | 3 | explicit `Effect.gen` loop or `Effect.whileLoop` |
| `Schedule.compose` | 3 | `Schedule.max(Schedule.recurs(n))` or `Effect.retry({ times })` |
| `Effect.Service` `dependencies` + generated `.Default` | 5 classes | explicit `static layer` |
| `HttpApiEndpoint` builder methods and tagged-template paths | 123 endpoints | options-object constructor (AST codemod) |
| `HttpApiDecodeError` body | all 400s | `layerSchemaErrorTransform` |
| `HttpRouter.Default/empty/get/post/del` | mcp | `HttpRouter.add` layers |
| `McpServer.initializedClients` | 1 | replace the list_changed hack with `Tool.Meta` |
| MCP protocol `2024-10-07` | n/a | no adapter in v4; accept the drop |
| `BunRuntime.runMain(..., { disablePrettyLogger })` | 2 | configure loggers only through the logger layer |
| `TestContext.TestContext` | 5 | `TestClock.layer()` |
| `Runtime.Runtime` values | 4 | `Context` + `Effect.run*With` |
| `Schema.Uint8Array` (from `number[]`) | 1 | explicit transform or the instance schema |
| `CommandExecutor` mock | 1 file | delete (BunServices) |
| `patches/@effect%2Frpc@0.73.2.patch` | 1 | delete; fixed upstream (`rpc/RpcMessage.ts:47,56`, `RpcSerialization.ts:335,431`) |

## 12. Top 10 risks

1. **Optional fields serialize `undefined` as `null` (W1), which breaks old app builds on ordinary 200 responses.** Measured end to end on a v4 HttpApi. It hits 214 `Schema.optional` and 87 `optionalWith` fields, fed by 112 `Option.getOrUndefined` call sites. This is the first thing to fix. Either set `disableCodecs: true` per endpoint (measured to restore v3 bytes) or strip `undefined` keys. Gate the cutover on a contract test that decodes v4 responses with the v3 client schemas.
2. **`Schema.Date` flips meaning.** A naive same-name migration keeps `Schema.Date`, which in v4 means a `Date` instance. HttpApi output still looks right (measured), so the bug hides. Meanwhile `parseJson`/`fromJsonString` storage (on-device user profile and onboarding JSON) and every manual `decodeSync` on a string start failing (measured). Map all 90 uses to `Schema.DateFromString`.
3. **The mobile bundle fails to build.** `effect/ConfigProvider.js` contains `import.meta`, and babel-preset-expo 54 rejects that for Hermes unless `unstable_transformImportMeta: true` (measured with the repo's own preset). It blocks the app and its jest tests until one config line is added.
4. **`@effect/sql-drizzle` no longer exists.** The official path is drizzle-orm 1.0.0-rc.4 `effect-postgres`. It changes the query error type from `SqlError` to `EffectDrizzleQueryError`, which touches about 307 type positions and 33 handlers, and its message embeds SQL text and parameters. It also forces drizzle-kit 1.0. The alternative is an in-repo bridge of about 100 lines. Either way it is the largest piece of non-mechanical work (read).
5. **v4 `@effect/sql-pg` is a new native-protocol driver, not `pg`.** `int8` becomes `bigint` (`JSON.stringify` throws), `date` becomes a string, `timestamp` without a time zone is read as UTC, the binary `halfvec` embeddings decode as garbage, and prepared statements must work through Railway's proxy (read). The knowledge-db RAG path is most exposed.
6. **Request-validation 400 bodies go empty, and status annotations must all be converted.** The old app's error union stops matching on 400 (measured). Any missed `{ status }` → `httpApiStatus` conversion out of 288 silently becomes a 500 and fires the 5xx alerter (read).
7. **MCP connectors can break on the transport layer.** v4 `layerHttp` answers `GET /mcp` with 405, where the repo serves 200 because ChatGPT checks it, and the two routes collide. It also enforces `Accept`, `Content-Type` and `Origin`, emits a non-object `outputSchema` for `ask_plant_question`, and switches tool schemas to draft-2020-12 (read).
8. **Some silent observability regressions compile cleanly.**
   - `DateTime.distance` now returns `Duration`, and `observability.ts:17` feeds it into a log line and the `http.duration_ms` span attribute (measured type).
   - The Railway JSON logger's `logLevel` rewrite stops matching (read).
   - Replacing loggers without `Logger.tracerLogger` drops log span events (read).
   - `NodeSdk` 4.0.0 needs the OTel SDK 2.x (read).
9. **Error values change shape at the edges.**
   - `Effect.runPromise` now rejects with the raw error instead of a `FiberFailure` (measured). App error messages for tagged errors without `message` become empty strings.
   - `UnknownException`/`TimeoutException`/`ParseError` become `UnknownError`/`TimeoutError`/`SchemaError`.
   - `RequestError`/`ResponseError`/`SystemError`/`BadArgument` collapse into `HttpClientError`/`PlatformError` with a `reason`. The literal tag union in `helpers/error-handling.ts:21` will not be flagged by tsc (inferred).
10. **Stricter UUID validation on the 21 path params (measured).** Also, `optionalWith({ default })` no longer provides a constructor default: `.make` throws at runtime unless `withConstructorDefault` is added (measured). Both are easy to miss in review because the code still reads naturally.

## 13. Renames safe for a ts-morph codemod

These are pure symbol or argument-shape rewrites with identical semantics. Use type information where noted, because some names are shared with unrelated code (`.left` style props, `Array`/`String` aliases `A`, `Arr`, `Str`, `EffectString`, `EffectArray`, `Rec`).

Imports:
- Move `@effect/platform` named imports to `effect/http-api` (HttpApi*, OpenApi) or `effect/http` (Http*, FetchHttpClient, HttpBody, Multipart). `HttpApp` becomes `HttpEffect`.
- `@effect/platform/FileSystem` → `effect`. `@effect/platform/Multipart` → `effect/http`. `@effect/platform/Error` → `effect` (`PlatformError`).
- `@effect/sql/SqlError` → `effect/sql/SqlError`. `@effect/sql/SqlClient` → `effect/sql/SqlClient`.
- `@effect/ai` → `effect/ai`. `effect/ConfigError` → `Config.ConfigError`.
- `BunContext` → `BunServices`. `Either` import → `Result`.

Option, Array, Order, Predicate, Struct:
- `Option.fromNullable` → `Option.fromNullishOr` (1,060).
- `Array.isEmptyArray/isEmptyReadonlyArray/isNonEmptyArray/isNonEmptyReadonlyArray/unsafeGet` → `isArrayEmpty/isReadonlyArrayEmpty/isArrayNonEmpty/isReadonlyArrayNonEmpty/getUnsafe`.
- `Order.number/string/reverse` → `Order.Number/String/flip`.
- `Predicate.isRecord` → `Predicate.isObject`.
- `Struct.entries` → `Record.toEntries`.

DateTime, Duration, Deferred:
- `DateTime.unsafeNow/unsafeMake/unsafeMakeZoned/zoneUnsafeMakeNamed` → `nowUnsafe/makeUnsafe/makeZonedUnsafe/zoneMakeNamedUnsafe`.
- `DateTime.greaterThan/greaterThanOrEqualTo/lessThan/lessThanOrEqualTo` → `isGreaterThan/...`. `Duration.greaterThan/lessThan` → `isGreaterThan/isLessThan`.
- `DateTime.distance(a, b)` → `Duration.toMillis(DateTime.distance(a, b))`. This keeps v3's signed-number semantics. Leave the `Duration.lessThan(DateTime.distance(...))` site alone.
- DateTime parts keys (`hours/minutes/seconds/millis` → `hour/minute/second/millisecond` in `toParts` reads and `setParts` literals; `millis` → `milliseconds` in `add/subtract`). Needs type information.
- `Deferred.unsafeDone` → `doneUnsafe`.

Effect, Layer, Stream:
- `Effect.catchAll/catchAllCause/zipRight/either/fork/forkDaemon/async/orElse` → `catch/catchCause/andThen/result/forkChild/forkDetach/callback/catch`.
- `Effect.withConfigProvider(p)` → `Effect.provideService(ConfigProvider.ConfigProvider, p)`.
- `Layer.scoped/scopedDiscard/unwrapEffect` → `effect/effectDiscard/unwrap`. `Layer.setConfigProvider(p)` → `ConfigProvider.layer(p)`.
- `Stream.unwrapScoped` → `Stream.unwrap`.

Config and Cause:
- `Config.string/boolean/duration/integer/nonEmptyString/redacted` → `String/Boolean/Duration/Int/NonEmptyString/Redacted` (accepted values are identical, measured for Boolean). `ConfigProvider.fromJson` → `fromUnknown`.
- `Cause.failureOption` → `Cause.findErrorOption`.

Either to Result:
- `Either.right/left/isRight/isLeft/isEither/Either/Left/Right/map/getOrThrow` → `Result.succeed/fail/isSuccess/isFailure/isResult/Result/Failure/Success/map/getOrThrow`.
- `Either.match({onLeft, onRight})` → `Result.match({onFailure, onSuccess})`.
- `.left/.right` on Either-typed values → `.failure/.success`. Needs type information.

Services and logging:
- `class X extends Context.Tag(id)<X, S>() {}` → `class X extends Context.Service<X, S>()(id) {}`.
- `Logger.withMinimumLogLevel(LogLevel.None)` → `Effect.provideService(References.MinimumLogLevel, 'None')`.
- `TestContext.TestContext` → `TestClock.layer()`. `managedRuntime.runtime()` → `managedRuntime.context()`, then paired `Runtime.runPromise(rt)` → `Effect.runPromiseWith(ctx)`.

Error tag strings in `catchTag`/`catchTags` keys:
- `'UnknownException'` → `'UnknownError'`.
- `'TimeoutException'` → `'TimeoutError'`.
- `'ParseError'` → `'SchemaError'`.

Schema:
- `Schema.Date` → `Schema.DateFromString`. Mandatory; see risk 2.
- `Schema.decode/decodeUnknown/encode` → `decodeEffect/decodeUnknownEffect/encodeEffect`.
- `Schema.parseJson(S)` → `Schema.fromJsonString(S)`, and `parseJson()` → `UnknownFromJsonString`.
- `Schema.Literal(a, b, ...)` → `Schema.Literals([a, b, ...])`. `Schema.Union(a, b)` → `Schema.Union([a, b])`. `Schema.Record({key, value})` → `Schema.Record(key, value)`.
- `Schema.optionalWith(S, { exact: true })` → `Schema.optionalKey(S)`.
- `.annotations({ description })` → `.annotate({ description })`.
- `Schema.int()/maxLength(n)/pattern(re)` → `Schema.check(Schema.isInt()/isMaxLength(n)/isPattern(re))`. `Schema.between(a, b)` → `Schema.check(Schema.isBetween({ minimum: a, maximum: b }))`.
- `Schema.UUID` → `Schema.String.check(Schema.isGUID())`. This preserves the v3 contract; `isUUID()` would be a behavior change.
- `Schema.compose(a, b)` → `a.pipe(Schema.decodeTo(b))`. `Schema.Schema.Any` → `Schema.Top`.

HTTP:
- `HttpApiSchema.annotations({ status: N })` → `{ httpApiStatus: N }`.
- `HttpApiEndpoint.del` → `HttpApiEndpoint.delete`. `HttpApiSchema.Multipart(S)` → `S.pipe(HttpApiSchema.asMultipart())`.
- `HttpClientRequest.bodyUnsafeJson` → `bodyJsonUnsafe`. `HttpServer.layerContext` → `layerServices`. `HttpApiBuilder.middlewareCors(o)` → `HttpRouter.cors(o)`. `HttpApiSwagger.layer()` → `HttpApiSwagger.layer(Api)`.
- Handler destructuring `path` → `params` and `urlParams` → `query`; app client calls likewise. Needs type information.

Codemod-able but structural, so review the output by hand:
- The HttpApiEndpoint builder chain to options object: 123 endpoints, `.addSuccess/.addError(E, {status})/.setPayload/.setUrlParams/.setPath` → `{ success, error: [E.pipe(HttpApiSchema.status(N))], payload, query, params }`, with template-literal paths → `:param` strings.
- `Effect.Service` → `Context.Service` + `static layer`.
- `optionalWith(S, { default })` → `withDecodingDefaultType` + `withConstructorDefault`.
- `Cause` `_tag === 'Fail'` checks in tests → one helper.

Not codemod material (needs judgment): W1/W3 contract decisions, drizzle and sql-pg driver migration, MCP transport, Logger/OTel wiring, `Schedule` rewrites, `Effect.iterate`, `Effect.if`, auth middleware redesign, `Schema.extend` with a record rest, `Schema.Uint8Array`.

## Appendix: evidence scripts

All are in `scratchpad/`. `v4play/` has effect@4.0.0 installed, and `v4play/v3/` has effect@3.19.19 and @effect/platform@0.94.5.

- `members.txt` holds the usage census; `joined.tsv` joins it with the official annotations; `check.sh` checks v4 exports; `g.sh` greps the repo file list.
- `v4play/wire.ts`, `wire2.ts` and `v3/wire3.ts` compare optional, NaN, Date, Class and TaggedError encoding.
- `v4play/js4.ts` and `v3/js3.ts` compare JSON Schema output.
- `v4play/dt.ts` checks the `DateTime.distance` type and `toParts` keys.
- `v4play/rp.ts` and `v3/rp3.ts` compare `runPromise` rejection values.
- `v4play/mk.ts` checks the `make` default and the `SchemaError` shape.
- `v4play/cfg.ts` and `v3/cfg3.ts` compare `Config.Boolean` spellings.
- `v4play/http4.ts`, `http4b.ts` and `v3/http3.ts` compare HttpApi bodies end to end (HTTP agent).
- `im.cjs` runs babel-preset-expo on the v4 `ConfigProvider.js` (the Hermes `import.meta` check).
