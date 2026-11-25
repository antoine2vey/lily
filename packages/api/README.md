# @lily/api

`@lily/api` is the backend of Lily. One Bun process serves the HTTP API that the app, the admin dashboard, the MCP server and the web join page call. The same process runs every scheduler, worker and subscriber. It is an Effect `HttpApi` over Postgres (`@lily/db`), the knowledge database for retrieval (`@lily/knowledge-db`) and Redis.

## How a request flows

- `LegacyApiPrefixMiddleware` maps an old `/api/...` URL onto `/api/v1/...`.
- The `Authentication` middleware checks the bearer JWT and the account status, then provides `CurrentUser`. Admin routes use `AdminAuth`, which also requires the admin role and provides `AdminUser`.
- The handler in `src/services/<domain>/handlers.ts` checks access, for a plant with `withPlantAuth`, and calls one endpoint function from `src/services/<domain>/endpoints/`.
- A change to a care, a schedule, a plan, a plant's life, a reminder, a canopy, a delegation or a vacation is a command of a context in `src/contexts/`. The context writes the change and its facts to the `outbox` table in one transaction. After the commit, the consumers listed in `src/layers/outbox.ts` replan reminders and forward the app's events.
- Every other read and write goes through a repository in `src/repositories/`. [CONTEXT-MAP.md](CONTEXT-MAP.md) names the exceptions, such as the reads of `CareReads` and the writes of the rate limiter.
- The EventBus (Redis pub/sub) carries fire-and-forget events, such as the ones that unlock achievements. The MessageQueue (Redis lists) carries notification delivery. It hands a message out at least once, and the worker pushes each notification at most once.

[CONTEXT-MAP.md](CONTEXT-MAP.md) says which context owns each module, repository and table.

## Routes

- `src/api.ts` serves every service group except `health` and `internal` under `/api/v1`. The prefix is `API_PREFIX` from `@lily/shared`, and clients build URLs from the same constant.
- The unversioned `/api/...` paths are a permanent alias of `/api/v1/...`. Installed native app builds call them and cannot be updated. The RevenueCat webhook URL in the RevenueCat dashboard also still points at `/api/...`. `LegacyApiPrefixMiddleware` in `src/middleware/legacy-api-prefix.ts` rewrites the URL before route lookup and sets `http.legacy_api_prefix` on the request span.
- `/health`, `/internal/*`, `/openapi.json` and the Swagger UI at `/docs` stay at the root.

## Commands

Set up the local stack with the Quickstart in the [root README](../../README.md#quickstart). Then run these from the repository root.

| Command | What it does |
| --- | --- |
| `bun run --filter=@lily/api dev` | Starts the server on port 3000 and restarts it on every change |
| `bun run --filter=@lily/api start` | Starts the server once |
| `bun run --filter=@lily/api tsc` | Typecheck |
| `bun run --filter=@lily/api test` | Unit tests with Vitest |
| `bun run test:integration` | Integration tests against the test database |
| `bun run --filter=@lily/api lint` | Biome check |
| `bun run --filter=@lily/api lint:fix` | Biome with autofix |

The server reads `packages/api/.env`, which the Quickstart links to the root `.env`. `.env.example` lists every variable. The integration tests need a test database, and [CLAUDE.md](CLAUDE.md) says how to set one up.

## Production

`Dockerfile.prod` at the repository root builds the production image. At start it applies the migrations of `packages/db` and `packages/knowledge-db`, seeds the tiers, then runs `src/index.ts` with Bun. Bun runs the TypeScript source directly, so production has no build step.

## Related documentation

- [CLAUDE.md](CLAUDE.md) has the layout and the rules for changing this package.
- [CONTEXT.md](CONTEXT.md) defines the domain terms.
- [CONTEXT-MAP.md](CONTEXT-MAP.md) maps the bounded contexts.
- [CODING_STANDARDS.md](../../CODING_STANDARDS.md) has the Effect rules for every package.
- [packages/db](../db/README.md) has the schema and the migrations.
- [packages/shared](../shared/README.md) has the schemas, errors and constants shared with the clients.
- [packages/knowledge-db](../knowledge-db/README.md) has the knowledge database.
