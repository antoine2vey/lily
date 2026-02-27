# Knowledge Ingestion & RAG Pipeline — Architecture

```
┌─────────────────────────────────────────────────────────────────────────────────────────┐
│                                    ENTRY POINTS                                        │
├──────────────────────────────┬──────────────────────────────┬───────────────────────────┤
│  POST /knowledge/jobs        │  Seed Script                 │  Admin Dashboard          │
│  { adapter, config }         │  seed-houseplant-knowledge   │  (future)                 │
│  → AdminAuth required        │  → Direct DB insert          │                           │
└──────────┬───────────────────┴──────────┬───────────────────┴───────────────────────────┘
           │                              │
           ▼                              ▼
┌─────────────────────────────────────────────────────────────────────────────────────────┐
│                              INGEST JOBS TABLE (knowledge-db)                           │
│                                                                                         │
│  id │ adapter │ config (JSONB)              │ status    │ docs_fetched │ chunks_created  │
│  ───┼─────────┼────────────────────────────-┼───────────┼──────────────┼────────────────│
│  ... │ reddit │ { subreddits, sort, limit } │ pending   │ 0            │ 0               │
│  ... │ web    │ { urls: [...] }             │ completed │ 23           │ 89              │
│  ... │ file   │ { paths: [...] }            │ failed    │ 0            │ 0               │
└─────────────────────────────────┬───────────────────────────────────────────────────────┘
                                  │
                                  │  polls every 30s
                                  ▼
┌─────────────────────────────────────────────────────────────────────────────────────────┐
│                                     WORKER                                              │
│                          startKnowledgeIngestionWorker                                   │
│                                                                                         │
│  Effect.forever(                                                                        │
│    sleep(30s) → findPending() → forEach(job => processIngestJob(job))                   │
│  )                                                                                      │
└─────────────────────────────────┬───────────────────────────────────────────────────────┘
                                  │
                                  ▼
┌─────────────────────────────────────────────────────────────────────────────────────────┐
│                                  PROCESSOR                                              │
│                              processIngestJob(job)                                      │
│                                                                                         │
│  1. Mark job → "in_progress"                                                            │
│  2. Get adapter via getAdapter(job.adapter)                                              │
│  3. Stream documents from adapter.fetch(config)                                          │
│  4. For each document → processDocument()                                                │
│  5. Update job counts incrementally                                                      │
│  6. Mark job → "completed" (or "failed" on error)                                        │
└──────────┬──────────────────────────────────────────────────────────────────────────────┘
           │
           │  getAdapter(name)
           │  Match: "reddit" → redditAdapter
           │         "web"    → webAdapter
           │         "file"   → fileAdapter (stub)
           ▼
┌═════════════════════════════════════════════════════════════════════════════════════════┐
║                                 SOURCE ADAPTERS                                        ║
║                        ISourceAdapter → Stream<RawDocumentInput>                        ║
╠═════════════════════════════════╦═══════════════════════════════════════════════════════╣
║                                ║                                                       ║
║   REDDIT ADAPTER               ║   WEB ADAPTER                                         ║
║   ─────────────                ║   ───────────                                         ║
║                                ║                                                       ║
║   Config:                      ║   Config:                                              ║
║   { subreddits[], sort,        ║   { urls[] }                                           ║
║     timeFilter, limit }        ║                                                       ║
║                                ║   Fetch Pipeline:                                      ║
║   Fetch Pipeline:              ║   1. Stream.fromIterable(urls)                         ║
║   1. For each subreddit:       ║   2. fetch(url) + 2s rate limit                       ║
║      fetch /{sort}.json        ║   3. linkedom parseHTML()                               ║
║      (6s rate limit)           ║   4. @mozilla/readability                               ║
║   2. Filter posts:             ║      → extract article                                 ║
║      score ≥ 5, comments ≥ 2   ║   5. sanitizeText() for UTF-8                          ║
║   3. For each post:            ║   6. Skip if < 200 chars                               ║
║      fetch comments            ║   7. Skip on error (log + continue)                    ║
║   4. Filter comments:          ║                                                       ║
║      len ≥ 100, score ≥ 3,     ║   Output per URL:                                      ║
║      no bots, no deleted       ║   {                                                    ║
║   5. sanitizeText()            ║     source: "web"                                      ║
║                                ║     sourceId: "web_{sha256(url)}"                      ║
║   Output per post:             ║     title: article.title                               ║
║   {                            ║     content: article.textContent                       ║
║     source: "reddit"           ║     metadata: { domain, contentLength, fetchedAt }     ║
║     sourceId: "reddit_{id}"    ║   }                                                    ║
║     title, content, author     ║                                                       ║
║     score, metadata: {         ║                                                       ║
║       subreddit, postScore,    ║                                                       ║
║       comments[]               ║                                                       ║
║     }                          ║                                                       ║
║   }                            ║                                                       ║
║                                ║                                                       ║
╚════════════════════════════════╩═══════════════════════════════════════════════════════╝
           │
           │  Stream<RawDocumentInput>
           ▼
┌─────────────────────────────────────────────────────────────────────────────────────────┐
│                            processDocument(doc, jobId)                                   │
│                                                                                         │
│  ┌──────────────────┐                                                                   │
│  │ 1. DEDUPLICATION  │  Check sourceId in raw_documents                                  │
│  │    by sourceId    │  → skip if exists (idempotent re-runs)                            │
│  └────────┬─────────┘                                                                   │
│           ▼                                                                             │
│  ┌──────────────────┐                                                                   │
│  │ 2. STORE RAW DOC  │  Insert into raw_documents table                                  │
│  │    (raw_documents) │  { source, sourceUrl, sourceId, title, content, metadata, ... }   │
│  └────────┬─────────┘                                                                   │
│           ▼                                                                             │
│  ┌──────────────────────────────────────────────────────────────────────────────────┐    │
│  │ 3. CHUNKING — chunkDocumentWithParent(doc)                                       │    │
│  │                                                                                   │    │
│  │   Match doc.source:                                                               │    │
│  │                                                                                   │    │
│  │   "reddit" ──────────────────────┐   all others (web, file) ──────┐              │    │
│  │                                  ▼                                ▼              │    │
│  │   ┌─────────────────────────┐   ┌──────────────────────────────┐               │    │
│  │   │ reddit-chunker          │   │ chunker (generic)             │               │    │
│  │   │                         │   │                                │               │    │
│  │   │ Parent chunk:           │   │ chunkContent(text)            │               │    │
│  │   │   full thread =         │   │                                │               │    │
│  │   │   question + top 5      │   │ Target: ~500 chars            │               │    │
│  │   │   comments formatted    │   │ Max: 700 chars                │               │    │
│  │   │                         │   │ Min: 100 chars                │               │    │
│  │   │ Child chunks:           │   │ Overlap: 75 chars             │               │    │
│  │   │   individual comments   │   │                                │               │    │
│  │   │   (w/ question prefix   │   │ Splits on:                    │               │    │
│  │   │    for context)         │   │  - double newlines             │               │    │
│  │   │                         │   │  - headers (# ## ###)          │               │    │
│  │   │ metadata per chunk:     │   │  - sentence boundaries (. )    │               │    │
│  │   │   chunkType, subreddit, │   │  - newlines, then spaces       │               │    │
│  │   │   postScore, etc.       │   │                                │               │    │
│  │   └─────────────────────────┘   │ 1 chunk  → no parent           │               │    │
│  │                                  │ N chunks → parent (full text)  │               │    │
│  │                                  │          + children (splits)   │               │    │
│  │                                  └──────────────────────────────┘               │    │
│  └──────────────────────────────────────────────────────────────────────────────────┘    │
│           │                                                                             │
│           │  { parent?: ChunkInput, children: ChunkInput[] }                             │
│           ▼                                                                             │
│  ┌──────────────────┐                                                                   │
│  │ 4. STORE PARENT   │  Insert parent chunk (if exists) — NO embedding                   │
│  │    (context only)  │  Stored for LLM context retrieval, not for search                 │
│  └────────┬─────────┘                                                                   │
│           ▼                                                                             │
│  ┌──────────────────────────────────────────────────────────────────────────────────┐    │
│  │ 5. ENRICH EACH CHILD CHUNK (in parallel)                                         │    │
│  │                                                                                   │    │
│  │   For each child chunk:                                                           │    │
│  │                                                                                   │    │
│  │   ┌──────────────────────────────────────────────────────────────────────────┐    │    │
│  │   │  a) CATEGORIZE — categorizer.ts                                          │    │    │
│  │   │     Keyword matching → 7 categories:                                     │    │    │
│  │   │     watering_advice | pest_identification | disease_diagnosis |           │    │    │
│  │   │     light_requirements | soil_nutrients | propagation | general_care      │    │    │
│  │   └──────────────────────────────────────────────────────────────────────────┘    │    │
│  │   ┌──────────────────────────────────────────────────────────────────────────┐    │    │
│  │   │  b) PLANT EXTRACTOR — plant-extractor.ts                                 │    │    │
│  │   │     Dictionary of 88 plant names (longest-first greedy match)            │    │    │
│  │   │     → plantMentions: string[]   (all found plants)                       │    │    │
│  │   │     → plantType: string         (primary/first match)                    │    │    │
│  │   └──────────────────────────────────────────────────────────────────────────┘    │    │
│  │   ┌──────────────────────────────────────────────────────────────────────────┐    │    │
│  │   │  c) KEYWORD ENRICHMENT — enrichment.ts                                   │    │    │
│  │   │     gpt-4o-mini extracts 3-10 semantic keywords per chunk                │    │    │
│  │   │                                                                          │    │    │
│  │   │     Input:  "Let the top inch of soil dry between waterings..."           │    │    │
│  │   │     Output: { keywords: ["monstera", "watering", "soil moisture",        │    │    │
│  │   │                          "overwatering", "root rot"] }                   │    │    │
│  │   │                                                                          │    │    │
│  │   │     → embeddingContent = "keywords: monstera, watering, ...\n\n{text}"   │    │    │
│  │   │     → content stays CLEAN (for LLM display)                              │    │    │
│  │   │     → keywords stored in metadata                                        │    │    │
│  │   │     ⚠ Failures caught + logged → chunk continues without enrichment      │    │    │
│  │   └──────────────────────────────────────────────────────────────────────────┘    │    │
│  └──────────────────────────────────────────────────────────────────────────────────┘    │
│           │                                                                             │
│           ▼                                                                             │
│  ┌──────────────────────────────────────────────────────────────────────────────────┐    │
│  │ 6. EMBED — embedding.service.ts                                                   │    │
│  │                                                                                   │    │
│  │   embedTexts(embeddingContent[] or content[])                                     │    │
│  │                                                                                   │    │
│  │   Model: text-embedding-3-large (OpenAI)                                          │    │
│  │   Dimensions: 3072 (stored as halfvec in PostgreSQL)                              │    │
│  │   Batch mode: all child chunks embedded together                                  │    │
│  │   ⚠ Failures caught → chunks stored without vectors                              │    │
│  └──────────────────────────────────────────────────────────────────────────────────┘    │
│           │                                                                             │
│           ▼                                                                             │
│  ┌──────────────────┐                                                                   │
│  │ 7. STORE CHUNKS   │  Batch insert into processed_chunks table                         │
│  │  (processed_chunks)│                                                                   │
│  └──────────────────┘                                                                   │
│                                                                                         │
└─────────────────────────────────────────────────────────────────────────────────────────┘


┌═════════════════════════════════════════════════════════════════════════════════════════┐
║                              KNOWLEDGE DATABASE (knowledge-db)                          ║
║                              PostgreSQL + pgvector extension                             ║
╠══════════════════════╦══════════════════════════════╦════════════════════════════════════╣
║  ingest_jobs         ║  raw_documents               ║  processed_chunks                  ║
║  ──────────          ║  ─────────────               ║  ────────────────                  ║
║  id (UUID)           ║  id (UUID)                   ║  id (UUID)                         ║
║  adapter (text)      ║  source (text)               ║  documentId → raw_documents        ║
║  config (JSONB)      ║  sourceUrl (text?)           ║  parentChunkId → self (nullable)   ║
║  status (enum):      ║  sourceId (text?)            ║  content (text) — clean for LLM    ║
║    pending           ║  title (text)                ║  embeddingContent (text?) — w/keys  ║
║    in_progress       ║  content (text)              ║  chunkIndex (int)                  ║
║    completed         ║  author (text?)              ║  source (text)                     ║
║    failed            ║  score (int?)                ║  plantType (text?)                 ║
║  documentsFetched    ║  metadata (JSONB?)           ║  category (enum?)                  ║
║  chunksCreated       ║  ingestJobId → ingest_jobs   ║  plantMentions (JSONB? string[])   ║
║  cursor (text?)      ║  fetchedAt (timestamptz)     ║  metadata (JSONB?)                 ║
║  error (text?)       ║                              ║  embedding halfvec(3072)            ║
║  createdAt           ║  IDX: sourceId               ║  search_vector tsvector (auto-gen) ║
║  updatedAt           ║  IDX: ingestJobId            ║                                    ║
║                      ║                              ║  IDX: documentId                   ║
║                      ║                              ║  IDX: plantType                    ║
║                      ║                              ║  IDX: parentChunkId                ║
╚══════════════════════╩══════════════════════════════╩════════════════════════════════════╝


┌─────────────────────────────────────────────────────────────────────────────────────────┐
│                              RAG RETRIEVAL (query time)                                  │
│                                                                                         │
│  User asks: "Why are my monstera leaves turning yellow?"                                 │
│                                                                                         │
│  ┌─────────────────────────────────────────────────────────────────────────────────┐     │
│  │ 1. EMBED QUERY                                                                  │     │
│  │    embedText(query) → 3072-dim vector                                           │     │
│  └─────────┬───────────────────────────────────────────────────────────────────────┘     │
│            ▼                                                                            │
│  ┌─────────────────────────────────────────────────────────────────────────────────┐     │
│  │ 2. HYBRID SEARCH (SQL)                                                          │     │
│  │                                                                                  │     │
│  │    Vector leg:                      FTS leg:                                     │     │
│  │    ┌──────────────────────┐        ┌──────────────────────────┐                  │     │
│  │    │ embedding <=> query  │        │ plainto_tsquery(query)    │                  │     │
│  │    │ L2 distance          │        │ @@ search_vector          │                  │     │
│  │    │ WHERE dist < thresh  │        │ ORDER BY ts_rank DESC     │                  │     │
│  │    │ TOP 50 candidates    │        │ TOP 50 candidates         │                  │     │
│  │    └──────────┬───────────┘        └──────────┬───────────────┘                  │     │
│  │               │                               │                                  │     │
│  │               └──────────┬────────────────────┘                                  │     │
│  │                          ▼                                                       │     │
│  │    ┌────────────────────────────────────────────────────┐                         │     │
│  │    │ RECIPROCAL RANK FUSION (RRF)                       │                         │     │
│  │    │ rrf_score = 1/(60+vrank) + 1/(60+frank)            │                         │     │
│  │    │                                                    │                         │     │
│  │    │ FULL OUTER JOIN on chunk id                        │                         │     │
│  │    │ → captures chunks found by either method           │                         │     │
│  │    └────────────────────┬───────────────────────────────┘                         │     │
│  │                         ▼                                                        │     │
│  │    ┌────────────────────────────────────────────────────┐                         │     │
│  │    │ DEDUPLICATION                                      │                         │     │
│  │    │ DISTINCT ON (parent_chunk_id or self.id)           │                         │     │
│  │    │ → one result per thread/document                   │                         │     │
│  │    │ → prefer highest rrf_score per group               │                         │     │
│  │    │                                                    │                         │     │
│  │    │ If parent exists → return parent.content           │                         │     │
│  │    │ (full thread/article for more context)             │                         │     │
│  │    └────────────────────┬───────────────────────────────┘                         │     │
│  │                         ▼                                                        │     │
│  │    ┌────────────────────────────────────────────────────┐                         │     │
│  │    │ FILTER & RANK                                      │                         │     │
│  │    │ WHERE similarity ≥ 0.6 (RagService)                │                         │     │
│  │    │ ORDER BY rrf_score DESC                            │                         │     │
│  │    │ LIMIT 5                                            │                         │     │
│  │    └────────────────────────────────────────────────────┘                         │     │
│  └─────────────────────────────────────────────────────────────────────────────────┘     │
│            │                                                                            │
│            ▼                                                                            │
│  ┌─────────────────────────────────────────────────────────────────────────────────┐     │
│  │ 3. FORMAT CONTEXT — RagService.formatContext()                                  │     │
│  │                                                                                  │     │
│  │    Chunks formatted as markdown sections:                                        │     │
│  │                                                                                  │     │
│  │    ## Relevant Plant Care Knowledge                                              │     │
│  │                                                                                  │     │
│  │    ### Plant Care Q&A (r/plantclinic, 87% match)     ← reddit thread             │     │
│  │    Q: My monstera leaves are yellowing...                                        │     │
│  │    A: Check for overwatering and root rot...                                     │     │
│  │                                                                                  │     │
│  │    ### Knowledge Source (web, 82% relevance)          ← web article              │     │
│  │    Monstera deliciosa prefers bright indirect light...                            │     │
│  │                                                                                  │     │
│  │    → Injected into LLM system prompt as context                                  │     │
│  └─────────────────────────────────────────────────────────────────────────────────┘     │
│                                                                                         │
└─────────────────────────────────────────────────────────────────────────────────────────┘


┌─────────────────────────────────────────────────────────────────────────────────────────┐
│                                  API ENDPOINTS                                           │
│                              All require AdminAuth                                       │
├──────────────────────┬──────────────────────────────────────────────────────────────────┤
│  POST /knowledge/jobs │  Create ingest job { adapter, config }                           │
│  GET  /knowledge/jobs │  List all jobs (ordered by createdAt desc)                        │
│  GET  /knowledge/jobs/:id │  Get single job status + counts                              │
│  GET  /knowledge/stats │  { totalChunks, totalDocuments, totalJobs, sourceBreakdown }    │
│  POST /knowledge/search │  { query, plantType?, limit? } → ChunkSearchResult[]          │
└──────────────────────┴──────────────────────────────────────────────────────────────────┘
```

## Data Flow Summary

```
                    ┌──────────┐
                    │ URL list │  or  Reddit config
                    └────┬─────┘
                         ▼
                   ┌───────────┐
                   │  Adapter   │  fetch HTML / Reddit JSON
                   └─────┬─────┘
                         ▼
                   ┌───────────┐
                   │  Dedup    │  skip by sourceId
                   └─────┬─────┘
                         ▼
              ┌──────────────────┐
              │  raw_documents    │  store original content
              └────────┬─────────┘
                       ▼
              ┌──────────────────┐
              │  Chunk (~500ch)   │  semantic splitting + overlap
              └────────┬─────────┘
                       ▼
           ┌───────────┼───────────┐
           ▼           ▼           ▼
     ┌──────────┐ ┌─────────┐ ┌──────────────┐
     │Categorize│ │ Extract  │ │ Enrich (LLM) │
     │ keywords │ │ plants   │ │ gpt-4o-mini  │
     │ → enum   │ │ → names  │ │ → keywords   │
     └────┬─────┘ └────┬────┘ └──────┬───────┘
          └────────────┼─────────────┘
                       ▼
              ┌──────────────────┐
              │ Embed (OpenAI)   │  text-embedding-3-large
              │ 3072-dim halfvec │  batch mode
              └────────┬─────────┘
                       ▼
              ┌──────────────────┐
              │processed_chunks  │  content + embedding + metadata
              └────────┬─────────┘
                       │
                       │  query time
                       ▼
              ┌──────────────────┐
              │ Hybrid Search    │  vector (L2) + FTS
              │ RRF Fusion       │  dedup by parent
              └────────┬─────────┘
                       ▼
              ┌──────────────────┐
              │ LLM Context      │  formatted markdown
              └──────────────────┘
```
