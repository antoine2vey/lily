# Knowledge DB domain language

The vocabulary of the knowledge database. It names the jobs that fill it, the documents they fetch and the chunks that search reads. The api runs ingestion and search, and this package names what they store.

## Ingestion

| Term | Meaning | Avoid |
|---|---|---|
| **Ingest job** | An `ingest_jobs` row. It names one `adapter` and its `config`, and keeps the job's `status` and the `documents_fetched` and `chunks_created` counts. `documents_fetched` counts the documents the job stored, not the duplicates it skipped. A run that follows a claim release starts both counts at 0, so they leave out the documents an earlier run stored. [packages/admin/CONTEXT.md](../admin/CONTEXT.md) defines it as an admin sees it. | |
| **Adapter** | The fetcher a job runs, stored in `ingest_jobs.adapter`. `reddit` reads subreddits and `web` reads a list of URLs. `file` exists in the config schema. Its adapter in `packages/api/src/services/knowledge-ingestion/adapters/file.adapter.ts` is a stub that fails every fetch, so a `file` job always fails. | |
| **Claim** | `ingest_jobs.claimed_at`, set when a worker takes a pending job and moves it to `in_progress`. The worker refreshes it after each document. A job whose claim is older than 15 minutes goes back to `pending`. The queue Claim in [packages/shared/CONTEXT.md](../shared/CONTEXT.md) is a different mechanism. | |
| **Raw document** | A `raw_documents` row. It is one post or page as the adapter returned it, with its `source`, `title`, `content` and `metadata`. | |
| **Source ID** | `raw_documents.source_id`, the adapter's stable key for a document. Reddit uses `reddit_` and the post id. Web uses `web_` and the first 12 hex digits of the URL's SHA-256. A document whose source ID is already stored is skipped. | |

## Chunks

| Term | Meaning | Avoid |
|---|---|---|
| **Processed chunk** | A `processed_chunks` row. It is a piece of one raw document's text, with its `chunk_index`, category, plant mentions and embedding. | |
| **Parent chunk** | A chunk that other chunks point to through `parent_chunk_id`. It holds the whole web page, or a Reddit question with its top five answers. It has no embedding, so search returns it only through its children. A web page that fits one chunk, or a Reddit thread with no answers, gets no parent. | |
| **Child chunk** | A chunk that search can match once it has an embedding. It has a `parent_chunk_id` when its document has a parent chunk. When the embedding call fails, the processor logs a warning and stores the document's children with a null `embedding`. The document and the job still go on. Search does not return these children until the embedding backfill in `packages/api/src/services/knowledge-ingestion/embedding-backfill.ts` embeds them. It runs every 10 minutes and embeds up to 50 chunks per tick from `embedding_content`, or from `content` when that is null. | |
| **Embedding content** | `processed_chunks.embedding_content`, the text the embedding was computed from. It is `keywords:` and the keywords a model extracted, followed by the chunk's `content`. `content` carries no keywords, because the assistant reads it. When keyword extraction still times out after its retries, `embedding_content` is null and the embedding comes from `content`. The processor also writes a `dead_letter_messages` row with the topic `enrichment.chunk_failed` to the primary database. Any other enrichment failure has no such fallback and stops the job's run. | |
| **Content category** | `processed_chunks.category`, one value of the `content_category` enum, picked by keyword matching on the chunk's text. | |
| **Plant mentions** | `processed_chunks.plant_mentions`, the plant names found in the chunk, longest first. `plant_type` is the first of them. | |
| **Search vector** | `processed_chunks.search_vector`, a `tsvector` of `content` that Postgres generates. `drizzle/0003_parent_chunk_and_fts.sql` adds it and its GIN index. Search matches the query against it next to the embedding match. | |

## Relationships

- **api** runs ingestion in `packages/api/src/services/knowledge-ingestion/` and search in `packages/api/src/repositories/processed-chunk.repository.ts`. The chat tool `searchPlantKnowledge` and the daily tip generator read the results. See [packages/api/CONTEXT.md](../api/CONTEXT.md).
- **admin** queues ingest jobs and runs searches through `/api/v1/knowledge`. See [packages/admin/CONTEXT.md](../admin/CONTEXT.md).
- **mcp** asks questions through `POST /api/v1/knowledge/query`. See [packages/mcp/CONTEXT.md](../mcp/CONTEXT.md).
- **db** supplies the migrator, the bridge and the pool config. See [packages/db/CONTEXT.md](../db/CONTEXT.md).
