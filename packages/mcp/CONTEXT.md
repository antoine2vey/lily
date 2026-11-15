# MCP domain language

The vocabulary of the MCP server. It names what an AI client sees through the protocol and how a connection signs in to a Lily account.

## Protocol

| Term | Meaning | Avoid |
| --- | --- | --- |
| **Tool** | A function the AI client can call, declared with `Tool.make` in `src/tools/definitions.ts`. Each one needs one scope. | |
| **Widget tool** | A tool whose result ChatGPT renders as an HTML widget, linked by `widgetMeta()` to a `ui://widget/...` template. `create_plant` and `ask_plant_question` are text-only tools, which return text alone. | |
| **Resource** | Read-only data the client fetches by URI, `plant://{plantId}` or `care-schedule://today`. Both need the `plants:read` scope. | |
| **Session** | The `Mcp-Session-Id` that `initialize` returns and every later request sends. It lives in the process memory. | |

## Connection

| Term | Meaning | Avoid |
| --- | --- | --- |
| **OAuth client** | An AI client registered through `/oauth/register`, which limits registrations per client IP. | |
| **Scope** | `plants:read`, `plants:write` or `knowledge:read`, from `SCOPES_SUPPORTED` in `src/auth/scopes.ts`. A connection gets the scopes it asked for, or all three when it asked for none. | |
| **Access token** | The OAuth bearer an AI client sends to this server. It lasts 1 hour and its refresh token 365 days. The API never sees it. | |
| **API credentials** | The API JWT and API refresh token stored per user in `oauth_user_api_credentials`. The server sends the API JWT to the API on the user's behalf and refreshes it when it expires. | |
| **Pending authorization** | An OAuth request that waits for the user to open the magic link. It travels in the signed `lily_mcp_pending` cookie for 10 minutes. | |
| **Service secret** | `SERVICE_TOKEN_SECRET`, which the server shares with the API and sends as `X-Service-Secret` on the API's internal routes. It also signs the `lily_mcp_pending` cookie, so changing it voids every pending authorization. | |

## Plants

| Term | Meaning | Avoid |
| --- | --- | --- |
| **Ownership label** | The text a tool or widget adds to a plant the user does not own, from `ownershipLabel()`. It names the owner the user is caretaking for, or the canopy that owns the plant. An owned plant has none. | |
| **Memorial label** | "In memory", which a widget shows in place of the health of a [dead plant](../api/CONTEXT.md#plant-and-ownership). | |

## Relationships

- Plant, Dead plant, Needs attention, Care, Care schedule, Canopy and Caretaker are API concepts. [`packages/api/CONTEXT.md`](../api/CONTEXT.md) owns them, under [Care](../api/CONTEXT.md#care), [Canopy](../api/CONTEXT.md#canopy) and [Absence](../api/CONTEXT.md#absence).
- The OAuth tables are in `packages/db/src/schema/oauth.ts`, and `rate_limits` is in `packages/db/src/schema/auth.ts`. [`packages/db/CONTEXT.md`](../db/CONTEXT.md) owns the stored terms.
- `API_PREFIX` and `ExternalServiceError` come from `@lily/shared`. [`packages/shared/CONTEXT.md`](../shared/CONTEXT.md) owns its entry points.
