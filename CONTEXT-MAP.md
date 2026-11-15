# Context map

Each package keeps its domain language in its own `CONTEXT.md`. Before you name a domain concept, read the glossary of every package your change touches. A term has one owner. The other glossaries link to it instead of defining it again.

## Packages

| Package | Glossary | Owns |
| --- | --- | --- |
| `packages/api` | [CONTEXT.md](packages/api/CONTEXT.md) | The plant care domain and its rules. Its bounded contexts are mapped in [packages/api/CONTEXT-MAP.md](packages/api/CONTEXT-MAP.md). |
| `packages/shared` | [CONTEXT.md](packages/shared/CONTEXT.md) | The wire contract: Effect schemas, typed errors and service interfaces. |
| `packages/db` | [CONTEXT.md](packages/db/CONTEXT.md) | The primary Postgres schema and its migrations. |
| `packages/knowledge-db` | [CONTEXT.md](packages/knowledge-db/CONTEXT.md) | The plant knowledge base for retrieval, in a separate pgvector database. |
| `packages/app` | [CONTEXT.md](packages/app/CONTEXT.md) | The mobile client and its screens, widgets and Live Activities. |
| `packages/plant-scanner` | [CONTEXT.md](packages/plant-scanner/CONTEXT.md) | The iOS AR and ML scanning module the app embeds. |
| `packages/mcp` | [CONTEXT.md](packages/mcp/CONTEXT.md) | The MCP server that lets AI clients read and act on a user's plants. |
| `packages/admin` | [CONTEXT.md](packages/admin/CONTEXT.md) | The internal operations dashboard. |
| `packages/web` | [CONTEXT.md](packages/web/CONTEXT.md) | The marketing site, the blog and the invite landing pages. |

## Relationships

- **api is the only writer of domain data.** It reaches the primary database through `@lily/db` and the knowledge base through `@lily/knowledge-db`. Every other client goes through its HTTP API.
- **shared is the contract.** api, app, admin, mcp and db import its schemas. `API_PREFIX` in `packages/shared/src/domains/common/api.ts` is the one source of the `/api/v1` prefix. The api still answers on the old `/api` prefix for clients that predate it.
- **app derives its client from api.** `packages/app/src/utils/client.tsx` builds the typed client from the api's `Api` definition, so a breaking endpoint change is a type error in the app. The app ships by OTA on its own schedule, so an endpoint change must keep working for the app already on phones. [docs/agents/releases.md](docs/agents/releases.md) has the details.
- **app embeds plant-scanner** as an Expo native module. It runs on iOS only.
- **mcp calls api over HTTP** for plant data. It writes only its own OAuth tokens and rate limits directly through `@lily/db`.
- **admin calls api over HTTP** for its analytics, through `packages/admin/src/lib/api-client.ts`.
- **web has no workspace dependency.** Its invite page calls the api's public invite preview endpoint over HTTP.
- **knowledge-db reuses db's plumbing.** It imports the Drizzle bridge, the pool config and the migrator from `@lily/db`, but its tables live in a separate database.
