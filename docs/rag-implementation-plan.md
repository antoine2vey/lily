# Complete RAG Implementation Plan for Lily Plant Chat

## Overview

Add Retrieval-Augmented Generation (RAG) to the existing AI chat feature with a pluggable knowledge ingestion system and admin dashboard.

**Current State**: GPT-4o-mini with basic plant context (name, ratings, last watered)
**Target State**: LLM with retrieved knowledge from Reddit, plant databases, and custom guides

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         Complete RAG Architecture                            │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                     KNOWLEDGE INGESTION LAYER                        │    │
│  │                                                                      │    │
│  │   Admin Dashboard ──▶ Ingest Jobs ──▶ Background Worker             │    │
│  │                                              │                       │    │
│  │   ┌─────────────┐  ┌─────────────┐  ┌─────────────┐                 │    │
│  │   │   Reddit    │  │  Web Page   │  │    File     │  Adapters       │    │
│  │   │   Adapter   │  │  Adapter    │  │  Adapter    │                 │    │
│  │   └─────────────┘  └─────────────┘  └─────────────┘                 │    │
│  │           │               │               │                          │    │
│  │           └───────────────┼───────────────┘                          │    │
│  │                           ▼                                          │    │
│  │   ┌─────────────────────────────────────────────────────────────┐   │    │
│  │   │  Processing: Chunk → Extract Plants → Categorize → Embed   │   │    │
│  │   └─────────────────────────────────────────────────────────────┘   │    │
│  │                           │                                          │    │
│  │                           ▼                                          │    │
│  │   ┌─────────────────────────────────────────────────────────────┐   │    │
│  │   │           Hetzner PostgreSQL + pgvector                     │   │    │
│  │   │           (raw_documents, processed_chunks)                 │   │    │
│  │   └─────────────────────────────────────────────────────────────┘   │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                              │                               │
│                                              ▼                               │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                        RAG RETRIEVAL LAYER                           │    │
│  │                                                                      │    │
│  │  User: "Why are my monstera leaves yellowing?"                      │    │
│  │                           │                                          │    │
│  │                           ▼                                          │    │
│  │  ┌───────────────────────────────────────────────────────────────┐  │    │
│  │  │  1. EMBED QUERY (OpenAI text-embedding-3-small)               │  │    │
│  │  │  2. RETRIEVE FROM PGVECTOR (top 5 similar, filter by plant)   │  │    │
│  │  │  3. FORMAT CONTEXT (inject into system prompt)                │  │    │
│  │  └───────────────────────────────────────────────────────────────┘  │    │
│  │                           │                                          │    │
│  │                           ▼                                          │    │
│  │  ┌───────────────────────────────────────────────────────────────┐  │    │
│  │  │  4. GENERATE RESPONSE (GPT-4o-mini with knowledge context)    │  │    │
│  │  │  5. STREAM TO CLIENT (include source citations)               │  │    │
│  │  └───────────────────────────────────────────────────────────────┘  │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## User Decisions

- Host PostgreSQL on Hetzner for cost-effective vector storage (40GB capacity)
- Build a source-agnostic adapter system (Reddit first, then web scraping, file imports)
- Target ~10,000 chunks - storage can handle millions
- Chunk size: 2000-2500 chars (~500-625 tokens) for good context preservation
- On-demand ingestion only (no scheduled jobs for now)
- Admin dashboard with React + Vite

---

## New Packages

### 1. `packages/knowledge-db`

Separate Drizzle package for Hetzner PostgreSQL (distinct from Supabase main DB).

```
packages/knowledge-db/
├── package.json
├── drizzle.config.ts
├── drizzle/                    # Migrations
└── src/
    ├── index.ts
    ├── client.ts               # Drizzle client for Hetzner
    └── schema/
        ├── index.ts
        ├── enums.ts
        ├── ingest-jobs.ts
        ├── raw-documents.ts
        └── processed-chunks.ts
```

### 2. `packages/admin-dashboard`

Lightweight React + Vite dashboard for managing knowledge ingestion.

```
packages/admin-dashboard/
├── package.json
├── vite.config.ts
├── index.html
└── src/
    ├── main.tsx
    ├── App.tsx
    ├── api/client.ts           # API client for knowledge endpoints
    ├── components/
    │   ├── JobsList.tsx        # List of ingest jobs with status
    │   ├── JobDetail.tsx       # Single job progress/logs
    │   ├── NewJobForm.tsx      # Form to start new ingest job
    │   ├── StatsOverview.tsx   # Chunk counts, sources breakdown
    │   └── ChunkBrowser.tsx    # Browse/search processed chunks
    └── hooks/useJobs.ts        # React Query hooks
```

**Dashboard Features:**
- View all ingest jobs (pending, in_progress, completed, failed)
- Start new job: select adapter (Reddit/Web/File), configure options
- Real-time progress updates (polling)
- Browse processed chunks, search by plant/category
- Stats overview: total chunks, by source, by category

---

## Database Schema

### Hetzner Knowledge DB (Source-Agnostic)

**`ingest_jobs`** - Track ingestion progress
| Column | Type | Description |
|--------|------|-------------|
| id | uuid | Primary key |
| adapter | text | 'reddit', 'web', 'file' |
| config | jsonb | Adapter-specific config |
| status | enum | pending, in_progress, completed, failed |
| documents_fetched | int | Raw documents retrieved |
| chunks_created | int | Chunks created |
| cursor | text | Pagination cursor (if applicable) |
| error | text | Error message if failed |
| created_at | timestamp | |

**`raw_documents`** - Source-agnostic raw content
| Column | Type | Description |
|--------|------|-------------|
| id | uuid | Primary key |
| source | text | 'reddit', 'rhs.org.uk', 'manual' |
| source_url | text | Original URL |
| source_id | text | Original ID from source |
| title | text | Document title |
| content | text | Full text content |
| author | text | Author if available |
| score | int | Relevance score (upvotes, etc.) |
| metadata | jsonb | Source-specific data |
| ingest_job_id | uuid | FK to ingest_jobs |
| fetched_at | timestamp | |

**`processed_chunks`** - RAG-ready chunks with embeddings
| Column | Type | Description |
|--------|------|-------------|
| id | uuid | Primary key |
| document_id | uuid | FK to raw_documents |
| content | text | Chunk text (2000-2500 chars) |
| chunk_index | int | Position in document |
| source | text | Inherited from document |
| plant_type | text | Extracted plant type ('monstera', 'pothos') |
| category | enum | watering_advice, pest_identification, etc. |
| plant_mentions | jsonb | ['monstera', 'pothos'] |
| embedding | vector(1536) | OpenAI text-embedding-3-small |
| created_at | timestamp | |

---

## File Structure

### New Files

```
packages/api/src/services/knowledge-ingestion/
├── api.ts                      # Admin endpoints (POST /jobs, GET /stats)
├── handlers.ts                 # Route handlers
├── service.ts                  # Main ingestion service
├── worker.ts                   # Background worker (processes jobs)
├── adapters/
│   ├── types.ts                # ISourceAdapter interface
│   ├── reddit.adapter.ts       # Reddit API (OAuth, rate limiting)
│   ├── web.adapter.ts          # HTML scraping (Cheerio)
│   └── file.adapter.ts         # Local file import (MD, JSON)
└── processing/
    ├── chunker.ts              # Text chunking (semantic splits)
    ├── plant-extractor.ts      # Extract plant mentions
    └── categorizer.ts          # Categorize content

packages/api/src/services/rag/
├── service.ts                  # RAG orchestration (retrieve + format)
└── embedding.service.ts        # OpenAI embedding wrapper

packages/api/src/repositories/
├── ingest-job.repository.ts    # CRUD for ingest jobs
├── raw-document.repository.ts  # Store raw documents
└── processed-chunk.repository.ts # Store/search chunks with vectors

packages/shared/src/domains/knowledge/
├── schema.ts                   # RawDocument, ProcessedChunk, IngestJob schemas
└── errors.ts                   # IngestJobNotFoundError, AdapterError
```

### Modified Files

| File | Changes |
|------|---------|
| `packages/api/src/api.ts` | Add KnowledgeIngestionApi |
| `packages/api/src/index.ts` | Add worker to ServerLive, CORS for dashboard |
| `packages/shared/src/services/ai/plant-chat.ts` | Accept knowledge context param |
| `packages/api/src/services/ai-chat/endpoints/send-chat-message.ts` | Add RAG retrieval |
| `package.json` (root) | Add knowledge-db & admin-dashboard workspaces |

---

## Implementation Phases

### Phase 1: Hetzner PostgreSQL Setup
1. Provision Hetzner CX22 instance (~€4.50/month)
2. Install PostgreSQL 16 + pgvector extension
3. Configure firewall and remote access
4. Create `lily_knowledge` database

### Phase 2: Knowledge DB Package
1. Create `packages/knowledge-db` package
2. Define Drizzle schemas (ingest_jobs, raw_documents, processed_chunks)
3. Set up separate Drizzle client for Hetzner
4. Run migrations

### Phase 3: Adapter Framework
1. Define `ISourceAdapter` interface in `adapters/types.ts`
2. Create adapter registry (maps adapter name → implementation)
3. Implement base error types (AdapterError, RateLimitError)

### Phase 4: Reddit Adapter (MVP)
1. Create Reddit app at reddit.com/prefs/apps
2. Implement OAuth client_credentials flow
3. Add rate limiting (600ms delay between requests)
4. Fetch top posts + comments from subreddits

### Phase 5: Processing Pipeline
1. Implement chunker (semantic splits, target 2000-2500 chars)
2. Implement plant mention extractor (regex patterns)
3. Implement content categorizer
4. Implement embedding service (OpenAI text-embedding-3-small)

### Phase 6: Background Worker
1. Implement `ingest-job.repository.ts`
2. Implement `raw-document.repository.ts`
3. Implement `processed-chunk.repository.ts` with vector search
4. Create worker with Effect.fork (polls for pending jobs)
5. Process jobs: fetch → store raw → chunk → embed → store chunks

### Phase 7: Knowledge Ingestion API
1. POST `/api/knowledge/jobs` - Start ingest job
2. GET `/api/knowledge/jobs` - List jobs
3. GET `/api/knowledge/jobs/:id` - Job status
4. GET `/api/knowledge/stats` - Overall stats
5. GET `/api/knowledge/chunks` - Browse/search chunks
6. Protected by AdminOnly middleware

### Phase 8: RAG Service
1. Create `EmbeddingService` for query embedding
2. Create `RagService` with retrieve() and formatContext() methods
3. Implement similarity search in `processed-chunk.repository.ts`
4. Add similarity threshold filtering (> 0.7)

### Phase 9: Chat Integration
1. Update `plantChat` function to accept `knowledgeContext` param
2. Update `sendChatMessage` endpoint to call RAG service
3. Inject retrieved knowledge into system prompt
4. Add source citations to responses

### Phase 10: Admin Dashboard
1. Set up `packages/admin-dashboard` with Vite + React
2. Configure Tailwind CSS
3. Create API client using Effect RPC types
4. Build JobsList, NewJobForm, StatsOverview components
5. Add ChunkBrowser with search/filter

### Phase 11: Testing
1. Create mock adapters returning fixture data
2. Create mock repositories
3. Test chunker with various document lengths
4. Test RAG retrieval with sample queries
5. Integration test for full pipeline

---

## Key Implementation Details

### Adapter Interface

```typescript
interface ISourceAdapter {
  readonly name: string
  readonly fetch: (config: AdapterConfig) => Effect.Effect<RawDocument[], AdapterError>
}

type AdapterConfig =
  | { adapter: 'reddit'; subreddit: string; timeframe: 'all' | 'year' | 'month'; limit: number }
  | { adapter: 'web'; urls: string[] }
  | { adapter: 'file'; paths: string[] }
```

### Reddit Adapter Rate Limiting

```typescript
// 600ms delay = ~100 requests/min (free tier limit)
const rateLimitedRequest = (request) =>
  request.pipe(
    Effect.retry({
      while: (error) => error instanceof RateLimitError,
      schedule: Schedule.spaced('60 seconds'),
    }),
    Effect.delay('600 millis')
  )
```

### Chunking Strategy

1. **Semantic splits**: Split on paragraph boundaries, headers, double newlines
2. **Target size**: 2000-2500 chars (~500-625 tokens) per chunk
3. **Min size**: Skip chunks < 200 chars
4. **Overlap**: 200 char overlap between chunks for context continuity

### RAG Service

```typescript
export class RagService extends Effect.Service<RagService>()('RagService', {
  effect: Effect.gen(function* () {
    const embeddingService = yield* EmbeddingService
    const chunkRepo = yield* ProcessedChunkRepository

    return {
      retrieve: (params: { query: string; plantType?: string; limit?: number }) =>
        Effect.gen(function* () {
          const embedding = yield* embeddingService.embedText(params.query)
          const limit = pipe(Option.fromNullable(params.limit), Option.getOrElse(() => 5))
          const chunks = yield* chunkRepo.search({
            embedding,
            plantType: params.plantType,
            limit,
          })
          return Array.filter(chunks, (c) => c.similarity > 0.7)
        }),

      formatContext: (chunks) => {
        if (Array.isEmptyArray(chunks)) return ''
        const formatted = Array.map(chunks, (c, i) => `### Source ${i + 1} (${c.source})\n${c.content}`)
        return `## Relevant Plant Care Knowledge\n\n${Array.join(formatted, '\n\n')}\n\nUse the above knowledge to inform your response.`
      },
    }
  }),
}) {}
```

### Updated Chat Endpoint

```typescript
export const sendChatMessage = (plantId: string, request: ChatRequest) =>
  Effect.gen(function* () {
    const plant = yield* plantRepo.findById(plantId)
    const ragService = yield* RagService

    const lastUserMessage = Array.findLast(messages, (m) => m.role === 'user')
    const query = pipe(
      lastUserMessage,
      Option.flatMap((m) => Option.fromNullable(m.content)),
      Option.getOrElse(() => '')
    )
    const knowledgeChunks = yield* ragService.retrieve({
      query,
      plantType: pipe(Option.fromNullable(plant.category), Option.map(String.toLowerCase), Option.getOrUndefined),
      limit: 5,
    })
    const knowledgeContext = ragService.formatContext(knowledgeChunks)

    const response = yield* aiService.plantChat(plant, messages, knowledgeContext)
    // ... existing response handling
  })
```

### Content Categorization

| Category | Keywords |
|----------|----------|
| watering_advice | water, overwater, underwater, thirsty, droopy |
| pest_identification | pest, bug, mite, aphid, mealybug, thrips |
| disease_diagnosis | disease, rot, fungus, mold, blight |
| light_requirements | light, sun, shade, window, bright |
| soil_nutrients | soil, potting, fertiliz, nutrient |
| propagation | propagat, cutting, node, root |
| general_care | care, tip, advice, help |

---

## Environment Variables

```bash
# Reddit API (register at reddit.com/prefs/apps)
REDDIT_CLIENT_ID=your_client_id
REDDIT_CLIENT_SECRET=your_client_secret
REDDIT_USER_AGENT=Lily:plant-care-scraper:1.0.0

# Hetzner Knowledge Database
KNOWLEDGE_DATABASE_URL=postgresql://lily:password@your-hetzner-ip:5432/lily_knowledge

# OpenAI (already configured for chat)
OPENAI_API_KEY=your_key
```

---

## Storage & Cost Estimates

### Storage Capacity (40GB Hetzner)

| Scale | Chunks | Storage | Embedding Cost |
|-------|--------|---------|----------------|
| MVP | 500 | 5 MB | $0.007 |
| **Recommended** | 10,000 | 100 MB | $0.13 |
| Large | 50,000 | 500 MB | $0.65 |
| Max | 500,000 | 5 GB | $6.50 |

### Target: 10,000 chunks (~$0.13)

| Source | Posts | Chunks/Post | Total |
|--------|-------|-------------|-------|
| r/plantclinic | 2,000 | 2 | 4,000 |
| r/houseplants | 2,000 | 2 | 4,000 |
| Web scraping | 500 pages | 3 | 1,500 |
| Manual guides | 100 docs | 5 | 500 |
| **Total** | | | **~10,000** |

### Per-Query Cost

| Component | Cost |
|-----------|------|
| Query embedding | ~$0.0001 |
| LLM (GPT-4o-mini) | ~$0.001 |
| **Total per chat** | **~$0.001** |

---

## Verification Plan

### 1. Unit Tests
```bash
bun test  # Run chunker, extractor, adapter, RAG tests
```

### 2. Ingestion Testing
```bash
# Start ingest job via API
curl -X POST http://localhost:3000/api/knowledge/jobs \
  -H "Content-Type: application/json" \
  -d '{"adapter": "reddit", "config": {"subreddit": "plantclinic", "timeframe": "month", "limit": 10}}'

# Monitor progress
curl http://localhost:3000/api/knowledge/jobs/:id

# Verify chunks in database
psql -h your-hetzner-ip -d lily_knowledge -c "SELECT COUNT(*) FROM processed_chunks"
```

### 3. Dashboard Testing
```bash
cd packages/admin-dashboard
bun run dev  # Opens at http://localhost:5173
```
- Start a new Reddit ingest job via form
- Watch progress update
- Browse chunks after completion

### 4. RAG Integration Testing
- Send chat message: "Why are my monstera leaves yellowing?"
- Verify response references knowledge from chunks
- Check that similarity threshold filters work
- Test with different plant types

---

## Hetzner PostgreSQL Provisioning

### Create CX22 Instance (~€4.50/month)
- Ubuntu 24.04
- 2 vCPU, 4GB RAM, 40GB storage
- Location: Nuremberg or Helsinki

### Install PostgreSQL 16 + pgvector
```bash
ssh root@your-hetzner-ip

sudo apt update
sudo apt install -y postgresql-16 postgresql-16-pgvector

sudo systemctl enable postgresql
sudo systemctl start postgresql
```

### Configure Database
```bash
sudo -u postgres psql
CREATE DATABASE lily_knowledge;
CREATE USER lily WITH ENCRYPTED PASSWORD 'your_secure_password';
GRANT ALL PRIVILEGES ON DATABASE lily_knowledge TO lily;
\c lily_knowledge
CREATE EXTENSION vector;
\q
```

### Configure Remote Access
```bash
# Edit pg_hba.conf
sudo nano /etc/postgresql/16/main/pg_hba.conf
# Add: host lily_knowledge lily your_api_server_ip/32 scram-sha-256

# Edit postgresql.conf
sudo nano /etc/postgresql/16/main/postgresql.conf
# Set: listen_addresses = '*'

sudo systemctl restart postgresql
```

### Firewall
```bash
sudo ufw allow 22/tcp
sudo ufw allow 5432/tcp from your_api_server_ip
sudo ufw enable
```

---

## Future Enhancements (Post-MVP)

- **Web Adapter**: HTML scraping with Cheerio for RHS, MoBotGarden
- **File Adapter**: Import local Markdown/JSON plant care guides
- **Deduplication**: Skip documents already in DB
- **Scheduled scraping**: Weekly job to collect new top posts
- **Dashboard SSE**: Real-time job updates via Server-Sent Events
- **LLM upgrade**: Switch to Claude Sonnet for better reasoning
