# Admin domain language

The vocabulary of the operations dashboard. Each term names something an admin reads or changes through the API's admin and knowledge routes.

## Users

| Term | Meaning | Avoid |
| --- | --- | --- |
| **Admin** | A user whose role is `admin`. Only an admin can log in here, and the API checks the role again on every admin route. | |
| **User status** | `active`, `suspended`, `banned` or `pending_deletion`, from `UserStatus` in `packages/shared/src/domains/user/schema.ts`. | |

## Gifts

| Term | Meaning | Avoid |
| --- | --- | --- |
| **Gift** | A subscription an admin grants one user for one gift duration, from that user's page. **Revoke** ends it. | |
| **Gift duration** | `7d`, `1m`, `1y` or `infinite`, from `GiftDuration` in `packages/shared/src/domains/admin/schema.ts`. `GIFT_DURATION_LABELS` holds the display names. | |
| **Gift code** | A code that grants a gift of its duration to each user who redeems it. It works while it is active, until `expiresAt`, and until `currentUsages` reaches `maxUsages`. | |
| **Redemption** | One user's use of one gift code. | |
| **Gift history** | The log of every gift event across all users, `subscription_gifted` and `subscription_gift_revoked`, newest first. An admin can revoke a gift from a `subscription_gifted` row. | |

## Knowledge

| Term | Meaning | Avoid |
| --- | --- | --- |
| **Ingest job** | One run that fetches documents through one adapter, `reddit` for subreddits or `web` for URLs, and splits them into chunks for the knowledge base. It is `pending`, `in_progress`, `completed` or `failed`. | |
| **Knowledge search** | A similarity search over the knowledge base chunks. Each result carries its similarity and its source. | |
| **Prompt preview** | For one chat message, what the AI call was built from: the plant, its care history, the knowledge chunks found for the message, the conversation history, the system prompt and the model. | |

## Operations

| Term | Meaning | Avoid |
| --- | --- | --- |
| **Live Activity trigger** | A push-to-start sent to every start token a user has. It sends nothing, and returns no outcomes, when the user has no care due or no start token. Otherwise it returns one outcome per start token, `accepted`, `send-error`, `config-error` or `token-invalidated`. | |
| **KPI** | One metric on the analytics page. Each has its own hook in `src/hooks/analytics/` and its own API route. | |
| **Range preset** | `7d`, `30d` or `90d`, the window a range-aware KPI covers. It defaults to `30d` and lives in the `?range=` query param. | |

## Relationships

- The plants, care history and conversations on a user's page are API concepts. [`packages/api/CONTEXT.md`](../api/CONTEXT.md) owns Plant and its care terms.
- Response schemas, `GiftDuration` and the rating level come from `@lily/shared`. [`packages/shared/CONTEXT.md`](../shared/CONTEXT.md) owns its entry points and the rating terms.
