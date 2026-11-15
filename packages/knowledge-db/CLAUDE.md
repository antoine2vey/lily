# packages/knowledge-db

The plant knowledge base for retrieval. This package holds the Drizzle schema for ingest jobs, raw documents and processed chunks, its SQL migrations, the `halfvec` codec and the `KnowledgeDrizzle` layer. The api runs ingestion and search on top of it. It lives in its own Postgres database with pgvector, reached through `KNOWLEDGE_DATABASE_URL`, with its own pool and its own migrations. It reuses the bridge, pool config and migrator from `@lily/db`, but it shares no tables, joins or transactions with the primary database.

## Commands

| Command | What it does |
|---|---|
| `bun run --filter=@lily/knowledge-db db:migrate` | drizzle-kit migrate, the runner local databases use. It reads `drizzle/meta/_journal.json`. |
| `bun run --filter=@lily/knowledge-db db:migrate:prod` | `scripts/migrate.ts`, the runner production uses. It creates the `vector` extension, then applies `drizzle/`. |
| `bun run --filter=@lily/knowledge-db test` | The journal test, plus a `halfvec` round trip against `TEST_DATABASE_URL` that skips when it is unset |
| `bun run --filter=@lily/knowledge-db tsc` | Typecheck |
| `bun run --filter=@lily/knowledge-db lint` | Biome |
| `bun run --filter=@lily/knowledge-db db:studio` | Drizzle Studio on `KNOWLEDGE_DATABASE_URL` |

`bun run --filter` runs the script in `packages/knowledge-db`, where Bun reads `packages/knowledge-db/.env`, the link to the root `.env` that the [Quickstart](../../README.md#quickstart) sets up.

## Layout

- `src/schema/` declares `ingest_jobs`, `raw_documents` and `processed_chunks`, with the Postgres enums in `src/schema/enums.ts`.
- `drizzle/` holds the migrations. `drizzle/meta/_journal.json` lists every file and must stay complete. The snapshots next to it stop at `0001`.
- `src/halfvec.ts` decodes pgvector's binary `halfvec`. `src/index.ts` registers it on each new client.
- `src/index.ts` exports `KnowledgeDrizzle` and `KnowledgeDrizzleLive`, the layer the api provides.
- `scripts/migrate.ts` runs `@lily/db`'s migrator with `CREATE EXTENSION IF NOT EXISTS vector` as its setup step.
- `sources/houseplants.md` is the curated list of URLs to ingest, one web job per batch.

## Rules

### Migrations

- **Write each migration by hand and add its journal entry**, with a `when` later than the entry before. drizzle-kit migrate runs only the files the journal lists, and only those newer than the last one it applied. The production migrator reads the folder. A file missing from the journal runs in production and never locally, which once left every local worker failing on a missing `claimed_at`. `src/__tests__/migration-journal.test.ts` checks both conditions.
- **Leave `db:generate` alone.** It diffs against the `0001` snapshot, so its output would add again the columns and indexes that later migrations created.
- **Keep each database on one runner.** drizzle-kit records applied files in `drizzle.__drizzle_migrations`. The production migrator records them in the public `__drizzle_migrations`. A database that switches runner replays from `0000` and fails on the first type that exists.
- **Create the extension before `db:migrate` on a fresh database.** No migration creates it, and `0000` uses the `halfvec` type. Run `CREATE EXTENSION IF NOT EXISTS vector` once, or start the database with `db:migrate:prod`, which runs it for you.
- **Keep `db:push` off a migrated database.** `search_vector`, the HNSW index and the GIN index come from SQL in `drizzle/0002_hnsw_embedding_index.sql` and `drizzle/0003_parent_chunk_and_fts.sql`, and the schema does not declare them. A push compares the database to the schema and offers to drop them.
- **Production applies `drizzle/` on every deploy from `main`**, after the primary database. Never run `db:migrate:prod` against production by hand.
- **The cutoff in `raw_documents_source_id_unique` differs per database.** `drizzle/0005_ingest_job_claims.sql` builds the partial unique index with the time it ran, because rows fetched before it may repeat a `source_id`. The constant in `src/schema/raw-documents.ts` only approximates it, because an index predicate in the schema must be a constant. Leave the index as each database built it.

### Vectors and search

- **Embeddings are `halfvec(3072)`**, the size of `text-embedding-3-large` in `packages/api/src/services/rag/embedding.service.ts`. A new embedding model needs a migration of the column and its HNSW index, and a new embedding for every chunk.
- **Order by cosine distance.** The HNSW index uses `halfvec_cosine_ops`, so a query uses it only when it orders by `<=>`. Any other operator scans every chunk.
- **Write vectors as text and read them through the codec.** The `vector` column type in `src/schema/processed-chunks.ts` sends the `[x,y,...]` text form. The client reads results in binary, and `src/halfvec.ts` decodes them. `src/index.ts` registers the codec after connecting, because the type's OID differs per database.
- **Only embedded chunks are searchable.** Search skips rows whose `embedding` is null. A parent chunk has no embedding of its own. Search returns it as the content of its matching children.

### Layer

- **`KnowledgeDrizzleLive` owns its pool.** It builds the client with `Layer.buildWithScope` in the layer's own scope, so the pool lives as long as the layer. Providing the client layer with `Effect.provide` closes the pool as soon as the Drizzle instance is built.
- **No transaction covers this database.** The layer keeps its SQL client private, so `SqlClient.withTransaction` in the api reaches only the primary database. Write a knowledge change that must be atomic as one statement, like the job claim in `packages/api/src/repositories/ingest-job.repository.ts`.
- **Ingestion and search code lives in the api.** The worker, adapters, chunker and embedding calls are in `packages/api/src/services/knowledge-ingestion/`. Search is in `packages/api/src/repositories/processed-chunk.repository.ts`, and `packages/api/src/services/rag/` builds the context the assistant reads. This package changes only when the stored shape changes.
