# @lily/mcp

> A Model Context Protocol (MCP) server that exposes Lily's plant-care tools and data to AI assistants like ChatGPT, over OAuth 2.1.

## Overview

`@lily/mcp` lets AI clients act on a user's Lily account: list plants, look up a plant's details and care history, record care, fetch the care schedule, and ask the RAG-backed knowledge base questions. It implements the MCP HTTP transport on Bun (`@effect/platform-bun`, default port 3001, `/mcp` endpoint), authenticates clients with OAuth 2.1 bearer tokens, and returns rich HTML widgets so ChatGPT can render plant cards and task lists. It is **decoupled from the backend** — every operation is an HTTP call to [`@lily/api`](../api); the only direct workspace dependency is [`@lily/db`](../db) for its own OAuth tables.

## Architecture

```
ChatGPT / MCP client
        │  Bearer (OAuth 2.1)
        ▼
  CORS → tool-meta → auth middleware
        │
   McpServer (/mcp)
   ├── tools/      ─▶ api-client.ts ─▶ @lily/api (HTTP)
   ├── resources/  ─▶ plant + care-schedule JSON
   └── widgets/    ─▶ HTML templates (_meta.ui.resourceUri) for ChatGPT rendering

OAuth state (codes/tokens) ─▶ @lily/db (own tables)
```

The middleware stack wraps the router as **CORS → tool-meta injection → auth check**, so CORS headers appear even on 401 responses and `tools/list` responses carry the `_meta.ui.resourceUri` needed for widget rendering.

## Project Structure

```
src/
├── index.ts                 # Server launch, layer composition, middleware stack
├── config.ts                # MCP_PORT, MCP_SERVER_URL, MCP_ALLOWED_ORIGINS
├── api-client.ts            # HTTP client for @lily/api
├── layers.ts                # Effect layer composition (DB, OAuth, API)
├── auth/                    # OAuth 2.1 routes, repository, bearer→JWT resolution
├── tools/                   # Tool schemas + handlers (one file per tool)
├── resources/               # Plant + care-schedule MCP resources
└── widgets/                 # HTML widget templates + tool-meta middleware
```

## Tools

| Tool | Description |
| --- | --- |
| `list_plants` | List the user's plants (filter: all / needsAttention / overdue). Widget. |
| `get_plant_details` | A plant's details plus recent care logs. Widget. |
| `care_plant` | Record a care action (watering / fertilization / misting / repotting). Widget. |
| `get_care_tasks` | Pending tasks grouped overdue / today / upcoming. Widget. |
| `get_overdue_plants` | Overdue-only plants. Widget. |
| `ask_plant_question` | RAG knowledge-base query. Text-only. |

## Key Concepts

### Auth boundary

Clients present an OAuth 2.1 bearer token; `auth/resolve-user.ts` exchanges it for a user JWT that `api-client.ts` forwards to the API. The MCP server never reads the primary database directly — it owns only its OAuth tables and calls the API for everything else.

### CORS fails closed

`MCP_ALLOWED_ORIGINS` is an explicit allowlist. When unset, the server denies all cross-origin browser requests (rather than reflecting any origin with credentials). Non-browser MCP clients use bearer auth and are unaffected.

## Development Workflow

```bash
# From the repository root:
bun run --filter=@lily/mcp dev      # bun --watch src/index.ts (port 3001)
bun run --filter=@lily/mcp test     # vitest

# Container image (from repo root):
docker build -f Dockerfile.mcp -t lily-mcp .
```

## Quick Reference

| Command | What it does |
| --- | --- |
| `dev` | `bun --watch src/index.ts` |
| `start` | `bun run src/index.ts` |
| `build` | `tsc` |
| `tsc` | `tsc --noEmit` |
| `test` | `vitest run` |
| `lint` / `lint:fix` | Biome check / autofix |

### Environment

```bash
MCP_PORT=3001
MCP_SERVER_URL=http://localhost:3001
MCP_ALLOWED_ORIGINS=                 # Comma-separated allowlist; empty = deny all cross-origin
```

## Related Documentation

- [Root README](../../README.md) — monorepo overview
- [`@lily/api`](../api/README.md) — the backend this server calls
- [Model Context Protocol](https://modelcontextprotocol.io) · [`@effect/ai`](https://github.com/Effect-TS/effect/tree/main/packages/ai)
