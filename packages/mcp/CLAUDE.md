# packages/mcp

The Model Context Protocol server that lets an AI client such as ChatGPT read and change a user's Lily account. Bun runs it as one HTTP server with the `effect/ai` `McpServer` on `/mcp` and its own OAuth 2.1 authorization server next to it. It is a client of the API, not a part of it. Every plant, care and knowledge operation is an HTTP call to `@lily/api`. Through `@lily/db` it touches only its own OAuth tables and the API's `rate_limits` table, where `/oauth/register` counts registrations per client IP.

## Commands

Run every command from the monorepo root.

| Command | What it does |
|---|---|
| `bun run --filter=@lily/mcp dev` | Watch mode on `MCP_PORT`, default 3001 |
| `bun run --filter=@lily/mcp test` | Vitest over `src/__tests__/` |
| `bun run --filter=@lily/mcp tsc` | Typecheck |
| `bun run --filter=@lily/mcp lint` | Biome |

## Layout

- `src/index.ts` composes the server. One global middleware runs CORS, then the security headers, then the endpoint guard, so a preflight skips auth and a 401 carries the CORS headers. The guard answers a request without a bearer with a 401 whose `WWW-Authenticate` points at the protected-resource metadata, which starts the OAuth flow. It answers `GET /mcp` with 200, because ChatGPT probes it before `tools/call` and stops on the 405 that `McpServer.layerHttp` registers for GET.
- `src/api-client.ts` is the only code that calls the API. `ApiClientLive` reads `API_BASE_URL` and `SERVICE_TOKEN_SECRET`. Tool calls go through `authedClient` with the user's API JWT, and login calls through `internalClient` with `X-Service-Secret`. A request times out after 15 seconds and a knowledge query after 45, which outlasts the API's own embedding deadline.
- `src/tools/` has one file per tool with its `<name>Effect`. `src/tools/definitions.ts` declares each tool's parameters, and `src/tools/handlers.ts` registers each one with the scope it needs. A new tool needs all three, plus an export from `src/tools/index.ts`.
- `src/auth/` is the OAuth 2.1 authorization server, with dynamic client registration, PKCE with S256 only, magic-link login and token rotation. `provideAuth(scope)` in `src/auth/resolve-user.ts` turns the bearer into `CurrentJwt` and `CurrentUserId`, rejects a connection that lacks the scope, and refreshes an expired API JWT. Wrap every handler that calls the API in it.
- `src/auth/confirm.ts` and `src/auth/verify.ts` carry the pending authorization in the signed `lily_mcp_pending` cookie, not in the emailed link, so a magic link completes only in the browser that asked for it. The cookie lives 10 minutes, as long as the API's magic link.
- `src/widgets/` holds the HTML templates ChatGPT renders for widget tools. `src/widgets/resources.ts` serves them as `ui://widget/...` resources, and `widgetMeta()` in `src/widgets/constants.ts` links a tool to one.
- `src/__tests__/` holds every test. `createMockApiClient()` in `src/__tests__/mocks/api-client.ts` stubs the API, so tests stay off the network.

## Rules

- **Import with `@lily/mcp/*`**, as in `import { ApiClient } from '@lily/mcp/api-client'`, including between files of one folder. `tsconfig.json` maps the package name to `src`, and vitest resolves it with `vite-tsconfig-paths`.
- **Public routes start with `API_PREFIX`.** Build every user route as `` `${baseUrl}${API_PREFIX}/plants` ``, with `API_PREFIX` from `@lily/shared`. `/internal/magic-link` and `/internal/service-token` stay unprefixed, because the API mounts its internal group outside `/api/v1`. `API_BASE_URL` is the bare API origin.
- **Show users `publicApiFailure()` text.** The message of an API `ExternalServiceError` holds the internal API URL. `errorResult` in `src/tools/handlers.ts` replaces it with `publicApiFailure()` and the full error goes to the logs. Let new API failures reach the user through that path.
- **A tool fails as a result.** `src/tools/handlers.ts` turns every failure into a `CallToolResult` with `isError: true`, so the model reads it. A JSON-RPC error makes the client mark the tool unavailable.
- **Tool input schemas are closed.** `inputJsonSchema` emits `additionalProperties: false` so a model does not invent arguments, while decoding stays lenient.
- **Escape every user-written string.** A plant or room name reaches the model and the widget. Pass it through `escapeInlineMarkdown()` from `src/tools/markdown.ts` in text output, and through the widgets' `esc()` from `src/widgets/templates/styles.ts` in HTML.
- **Widget buttons send a follow-up message.** A button calls `window.openai.sendFollowUpMessage` with a prompt, and the model then calls the tool, because `callTool` crashes ChatGPT.
- **A widget tool carries `_meta` twice.** ChatGPT binds `structuredContent` to the widget only when `_meta` is on the tool in `tools/list` and on the `tools/call` result. `successResult` adds both for any tool annotated with `Tool.Meta`.
- **Sessions live in memory.** `McpServer.layerHttp` keeps each `Mcp-Session-Id` in the process. After a restart the server answers an old session id with 404 and the client initializes again. Run one instance, or route each session to the same one.
- **CORS fails closed.** `MCP_ALLOWED_ORIGINS` is an allowlist, and an empty one denies every browser origin. A client outside a browser authenticates with its bearer and needs no origin.
