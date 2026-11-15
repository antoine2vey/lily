# @lily/knowledge-db

The plant care knowledge base that grounds Lily's AI answers. It holds the Drizzle schema, the SQL migrations and the `KnowledgeDrizzle` layer for a separate Postgres database with pgvector.

The api fills the database with ingest jobs and searches it when the assistant needs care knowledge. The package has no server of its own. It reuses the migrator, the Drizzle bridge and the pool config from [`@lily/db`](../db/README.md), and it shares no tables with the primary database.

## How it runs

- `src/schema/` declares three tables. `ingest_jobs` holds one row per ingestion run. `raw_documents` holds each fetched post or page. `processed_chunks` holds the pieces search reads, with their embeddings.
- `src/index.ts` exports `KnowledgeDrizzleLive`, the layer the api provides. It connects to `KNOWLEDGE_DATABASE_URL`.
- `drizzle/` holds the hand-written migrations. Production applies them on every deploy from `Dockerfile.prod`, through `scripts/migrate.ts`, right after the primary database's migrations.

## Ingestion

An admin queues a job from the admin dashboard, or with `POST /api/v1/knowledge/jobs`. The body names an adapter and its config. `reddit` reads posts and comments from subreddits. `web` reads a list of URLs, such as one batch from [sources/houseplants.md](sources/houseplants.md).

A worker in the api polls every 30 seconds and claims pending jobs one at a time. For each document the adapter returns, it:

1. Skips the document when its source ID is already stored.
2. Stores the document in `raw_documents`.
3. Splits it into chunks of about 500 characters. A document with several chunks also gets a parent chunk with its full text. A Reddit thread becomes a parent with the question and its top answers, and one child per answer.
4. Tags each child chunk with a category and the plants it mentions, and asks a model for search keywords.
5. Embeds the children with OpenAI's `text-embedding-3-large` and stores them in `processed_chunks`.

## Search

A search embeds the question and ranks the embedded chunks two ways, by cosine distance to the embedding and by Postgres full-text match. Reciprocal rank fusion merges the two rankings. A result must still pass a minimum embedding similarity. Each thread or page appears once, and a chunk with a parent returns the parent's full text. The chat tool `searchPlantKnowledge`, the daily tip generator and the MCP server's knowledge query all read these results.

The knowledge routes sit under `/api/v1/knowledge`. Admins use `/jobs`, `/stats` and `/search`. The MCP server calls `/query` with the signed-in user's token.

## Commands

Run them from the monorepo root. A command that reaches the database reads `KNOWLEDGE_DATABASE_URL` from `packages/knowledge-db/.env`, which the [Quickstart](../../README.md#quickstart) links to the root `.env`.

| Command | What it does |
|---|---|
| `bun run --filter=@lily/knowledge-db db:migrate:prod` | Creates the `vector` extension and applies `drizzle/` with the production migrator |
| `bun run --filter=@lily/knowledge-db db:migrate` | Applies `drizzle/` with drizzle-kit |
| `bun run --filter=@lily/knowledge-db db:studio` | Opens Drizzle Studio |
| `bun run --filter=@lily/knowledge-db test` | Runs the migration journal test and the `halfvec` round trip |
| `bun run --filter=@lily/knowledge-db tsc` | Typechecks the package |

Keep each database on one of the two migration commands. [CLAUDE.md](CLAUDE.md) explains why, and why `db:push` and `db:generate` stay unused.

## Local setup

1. Start the database with `docker compose up -d knowledge-db`. It listens on port 5434.
2. Link the root `.env` into `packages/knowledge-db`, as the [Quickstart](../../README.md#quickstart) does. `.env.example` has the local `KNOWLEDGE_DATABASE_URL`.
3. Run `db:migrate:prod` on a fresh database. It creates the `vector` extension, which no migration creates.

## Related docs

- [CLAUDE.md](CLAUDE.md) has the migration, vector and layer rules.
- [CONTEXT.md](CONTEXT.md) defines jobs, documents and chunks.
- [packages/db/README.md](../db/README.md) covers the primary database.
- [pgvector](https://github.com/pgvector/pgvector) documents the `halfvec` type and its indexes.
