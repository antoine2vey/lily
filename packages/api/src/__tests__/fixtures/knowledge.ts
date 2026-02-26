import type {
  ChunkSearchResult,
  IngestJob,
  RawDocument,
} from '@lily/shared/knowledge'

export const mockIngestJobs: IngestJob[] = [
  {
    id: 'job-1',
    adapter: 'reddit',
    config: { type: 'reddit', subreddits: ['houseplants'], limit: 10 },
    status: 'completed',
    documentsFetched: 5,
    chunksCreated: 12,
    cursor: undefined,
    error: undefined,
    createdAt: new Date('2024-06-01'),
    updatedAt: new Date('2024-06-01'),
  },
  {
    id: 'job-2',
    adapter: 'reddit',
    config: { type: 'reddit', subreddits: ['plantclinic'], limit: 25 },
    status: 'pending',
    documentsFetched: 0,
    chunksCreated: 0,
    cursor: undefined,
    error: undefined,
    createdAt: new Date('2024-06-02'),
    updatedAt: new Date('2024-06-02'),
  },
  {
    id: 'job-3',
    adapter: 'web',
    config: { type: 'web', urls: ['https://example.com/plant-care'] },
    status: 'failed',
    documentsFetched: 2,
    chunksCreated: 0,
    cursor: undefined,
    error: 'Connection timeout',
    createdAt: new Date('2024-06-03'),
    updatedAt: new Date('2024-06-03'),
  },
]

export const mockRawDocuments: RawDocument[] = [
  {
    id: 'doc-1',
    source: 'reddit',
    sourceUrl: 'https://reddit.com/r/houseplants/1',
    sourceId: 'reddit-post-1',
    title: 'How to care for a Monstera',
    content:
      'Monstera deliciosa needs indirect light and moderate watering. Let the soil dry between waterings.',
    author: 'plant_lover',
    score: 42,
    metadata: undefined,
    ingestJobId: 'job-1',
    fetchedAt: new Date('2024-06-01'),
  },
  {
    id: 'doc-2',
    source: 'reddit',
    sourceUrl: 'https://reddit.com/r/houseplants/2',
    sourceId: 'reddit-post-2',
    title: 'Spider mite treatment guide',
    content:
      'If you notice tiny webs on your plants, you likely have spider mites. Treat with neem oil spray.',
    author: 'pest_expert',
    score: 87,
    metadata: undefined,
    ingestJobId: 'job-1',
    fetchedAt: new Date('2024-06-01'),
  },
  {
    id: 'doc-3',
    source: 'web',
    sourceUrl: 'https://example.com/pothos-guide',
    sourceId: undefined,
    title: 'Complete Pothos Care Guide',
    content:
      'Pothos are one of the easiest houseplants to grow. They thrive in low to bright indirect light and prefer to dry out between waterings.',
    author: undefined,
    score: undefined,
    metadata: undefined,
    ingestJobId: 'job-1',
    fetchedAt: new Date('2024-06-01'),
  },
]

export const mockChunkSearchResults: ChunkSearchResult[] = [
  {
    id: 'chunk-1',
    content:
      'Monstera deliciosa needs indirect light and moderate watering. Let the soil dry between waterings.',
    source: 'reddit',
    plantType: 'monstera deliciosa',
    category: 'watering_advice',
    similarity: 0.92,
  },
  {
    id: 'chunk-2',
    content:
      'Pothos are one of the easiest houseplants to grow. They thrive in low to bright indirect light.',
    source: 'web',
    plantType: 'pothos',
    category: 'light_requirements',
    similarity: 0.85,
  },
  {
    id: 'chunk-3',
    content:
      'If you notice tiny webs on your plants, you likely have spider mites. Treat with neem oil spray.',
    source: 'reddit',
    plantType: undefined,
    category: 'pest_identification',
    similarity: 0.78,
  },
]

export const createTestIngestJob = (
  overrides: Partial<IngestJob> = {}
): IngestJob => ({
  id: `job-${crypto.randomUUID()}`,
  adapter: 'reddit',
  config: { type: 'reddit', subreddits: ['houseplants'], limit: 10 },
  status: 'pending',
  documentsFetched: 0,
  chunksCreated: 0,
  cursor: undefined,
  error: undefined,
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
})

export const createTestRawDocument = (
  overrides: Partial<RawDocument> = {}
): RawDocument => ({
  id: `doc-${crypto.randomUUID()}`,
  source: 'reddit',
  sourceUrl: undefined,
  sourceId: undefined,
  title: 'Test Document',
  content: 'Test content for processing.',
  author: undefined,
  score: undefined,
  metadata: undefined,
  ingestJobId: 'job-1',
  fetchedAt: new Date(),
  ...overrides,
})

export const createTestChunkSearchResult = (
  overrides: Partial<ChunkSearchResult> = {}
): ChunkSearchResult => ({
  id: `chunk-${crypto.randomUUID()}`,
  content: 'Test chunk content about plant care and watering advice.',
  source: 'reddit',
  plantType: undefined,
  category: 'general_care',
  similarity: 0.85,
  ...overrides,
})
