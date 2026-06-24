# @lily/knowledge-db

> The pgvector RAG knowledge base behind Lily's AI plant diagnosis — a Drizzle schema plus an Effect Postgres client layer, on its own PostgreSQL instance.

## Overview

`@lily/knowledge-db` owns the vector knowledge base that grounds Lily's AI answers. It stores ingested plant-care content as raw documents, splits them into embedded chunks, and tracks the ingestion jobs that produce them. It runs as a **separate PostgreSQL database** (default `localhost:5434`, `KNOWLEDGE_DATABASE_URL`) with its own connection pool, exposed to the rest of the system through the `KnowledgeDrizzle` Effect tag. [`@lily/api`](../api)'s ai-chat service queries it with vector similarity search to retrieve relevant care knowledge per plant.

## Architecture

```
ingest job (adapter: reddit / web / …)
        │
        ▼
raw_documents ──split──▶ processed_chunks ──embed──▶ halfvec(3072)
                              │                          │
                       full-text (tsvector, GIN)   HNSW (cosine)
                              └──────────┬───────────────┘
                                  hybrid retrieval ─▶ @lily/api ai-chat (RAG)
```

The Effect layer (`KnowledgeDrizzleLive`) binds the Postgres pool to the layer's scope, so the connection lifecycle is managed by Effect rather than the request scope.

## Data Model

| Table | Purpose |
| --- | --- |
| `ingest_jobs` | Stateful job per adapter run: `status` (pending/in_progress/completed/failed), counters, a `cursor` for resumable pagination, and `error`. |
| `raw_documents` | Ingested source content (title, content, source URL/id, author, score, metadata). FK → `ingest_jobs` (cascade delete). |
| `processed_chunks` | Embedded chunks: `content` (clean, for the LLM), `embedding_content` (keyword-enriched, for the embedder), `embedding halfvec(3072)`, `category`, `plant_type`/`plant_mentions`, and a self-referential `parent_chunk_id` for hierarchical chunking. |

### Notable details

- **3,072-dim `halfvec` embeddings** indexed with **HNSW** (cosine, m=16, ef_construction=64) for fast semantic search.
- **Hybrid search** — a generated `tsvector` (`search_vector`, GIN-indexed, English) complements vector similarity.
- **Embedding vs. output text are separated** — `embedding_content` (enriched) is what gets vectorized; `content` (clean) is what the LLM reads, so formatting artifacts don't distort retrieval.
- **Resumable ingestion** — `ingest_jobs.cursor` lets adapters resume after a failure; cascade deletes keep documents/chunks consistent with their job.

## Project Structure

```
src/
├── index.ts                 # KnowledgeDrizzle tag + KnowledgeDrizzleLive layer (pool lifecycle)
└── schema/
    ├── enums.ts             # Job status + content categories
    ├── ingest-jobs.ts
    ├── raw-documents.ts
    └── processed-chunks.ts  # Vectors, FTS, parent/child relations
drizzle/                     # SQL migrations (enums → tables → HNSW → parent chunks + FTS → embedding_content)
scripts/migrate.ts           # Production migration runner (enables pgvector, applies SQL)
```

## Development Workflow

```bash
# From the repository root:
# Apply the schema to your local knowledge DB (dev push):
bun run --filter=@lily/knowledge-db db:push

# Production migrations are applied with the dedicated runner:
bun run --filter=@lily/knowledge-db db:migrate:prod
```

> Like the primary [`@lily/db`](../db), production schema changes are applied through SQL migrations rather than ad-hoc generation. Use `db:push` for local iteration and `scripts/migrate.ts` (`db:migrate:prod`) for deploys.

## Quick Reference

| Command | What it does |
| --- | --- |
| `db:push` | Push the schema to the local knowledge DB (dev) |
| `db:migrate:prod` | Enable pgvector + apply SQL migrations (production runner) |
| `db:studio` | Open Drizzle Studio |
| `build` / `typecheck` | `tsc` / `tsc --noEmit` |
| `lint` / `lint:fix` | Biome check / autofix |

### Environment

```bash
KNOWLEDGE_DATABASE_URL=postgresql://lily:lily123@localhost:5434/lily_knowledge
```

## Related Documentation

- [Root README](../../README.md) — monorepo overview
- [`@lily/db`](../db/README.md) — the primary application database
- [`docs/knowledge-pipeline-architecture.md`](../../docs/knowledge-pipeline-architecture.md) — the full ingest → chunk → embed → retrieve design
- [pgvector](https://github.com/pgvector/pgvector) · [Drizzle ORM](https://orm.drizzle.team)
