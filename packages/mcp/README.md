# @lily/mcp

A Model Context Protocol server that lets AI assistants such as ChatGPT work with a user's Lily account over OAuth 2.1.

An assistant connected to it can list and add plants, read a plant's details and care history, record a care, fetch the care schedule and ask the knowledge base a question. ChatGPT renders plant cards and task lists as HTML widgets. The server runs on Bun with `effect/ai` `McpServer` at `/mcp`, on port 3001 by default.

## How it fits

```
ChatGPT or another MCP client
        │  OAuth 2.1 bearer
        ▼
  CORS, security headers, endpoint guard
        │
   McpServer (/mcp)
   ├── tools       ─▶ src/api-client.ts ─▶ @lily/api  /api/v1/*
   ├── resources   ─▶ src/api-client.ts ─▶ @lily/api  /api/v1/*
   └── widgets     ─▶ HTML templates for ChatGPT

OAuth routes ─▶ @lily/api  /internal/*  (magic link, service token)
OAuth state  ─▶ @lily/db   OAuth tables, rate_limits
```

The server is a client of [`@lily/api`](../api/README.md). It calls the public routes under `/api/v1` with the user's API token, and the unprefixed `/internal` routes with the service secret during login. It connects to the main database through [`@lily/db`](../db/README.md) and uses only its own OAuth tables, plus the API's `rate_limits` table to limit client registrations per IP. [`@lily/shared`](../shared/README.md) gives it `API_PREFIX` and the API response types.

## Tools

| Tool | Description |
| --- | --- |
| `list_plants` | The user's living plants, the plants they look after for someone else and their canopy's plants. A filter narrows it to the plants that need attention or are overdue, or lists the dead plants instead. Widget. |
| `get_plant_details` | A plant's details and its recent care logs. Widget. |
| `care_plant` | Records a watering, fertilization, misting or repotting. Widget. |
| `create_plant` | Adds a plant with a watering schedule, to the user's canopy when `canopy` is true. Text only. |
| `get_care_tasks` | Pending tasks grouped as overdue, today and upcoming. Widget. |
| `get_overdue_plants` | Only the overdue plants. Widget. |
| `ask_plant_question` | A question to the knowledge base. Text only. |

The server also exposes two resources, `plant://{plantId}` and `care-schedule://today`.

## Signing in

1. The client finds the server's metadata under `/.well-known/` and registers itself at `/oauth/register`.
2. `/oauth/authorize` checks the request against the registered client and sends the user to a consent page. The page names where the authorization goes, as a website host or an app on this device, and shows the client's name as unverified. The user enters their email, and the server asks the API to email a magic link.
3. The link opens `/verify` in the same browser. The server trades the link's code for an API token, stores it, and redirects to the client with an authorization code.
4. The client exchanges the code at `/oauth/token` with PKCE (S256 only).

Each connection holds the scopes it asked for, among `plants:read`, `plants:write` and `knowledge:read`.

## Protocol behavior

- `initialize` returns an `Mcp-Session-Id` that later requests must send. Sessions live in the process memory, so after a restart the server answers an old id with 404 and the client initializes again.
- The server rejects JSON-RPC batches with 400, an `Accept` header without `application/json` or `text/event-stream` with 406, and an `Origin` outside `MCP_ALLOWED_ORIGINS` with 403.
- `GET /mcp` with a bearer answers 200, because ChatGPT probes it before calling a tool.
- CORS fails closed. With `MCP_ALLOWED_ORIGINS` empty, the server denies every cross-origin browser request. Clients outside a browser use their bearer and are unaffected.

## Commands

Run these from the repository root.

```bash
bun run --filter=@lily/mcp dev      # watch mode on port 3001
bun run --filter=@lily/mcp start    # the same server without watch mode
bun run --filter=@lily/mcp test     # vitest
bun run --filter=@lily/mcp tsc
bun run --filter=@lily/mcp lint     # lint:fix to apply fixes

docker build -f Dockerfile.mcp -t lily-mcp .
```

## Environment

```bash
MCP_PORT=3001
MCP_SERVER_URL=http://localhost:3001   # public URL, used in the OAuth metadata
MCP_ALLOWED_ORIGINS=                   # comma-separated allowlist, empty denies every origin
API_BASE_URL=http://localhost:3000     # API origin, without /api/v1
SERVICE_TOKEN_SECRET=                  # same value as the API's
DATABASE_URL=                          # the main database, for the OAuth and rate limit tables
```

See [`.env.example`](../../.env.example).

## Related documentation

- [`CLAUDE.md`](CLAUDE.md) has the conventions for this package.
- [`CONTEXT.md`](CONTEXT.md) defines its terms.
- [Root README](../../README.md) covers the monorepo.
- [Model Context Protocol](https://modelcontextprotocol.io).
