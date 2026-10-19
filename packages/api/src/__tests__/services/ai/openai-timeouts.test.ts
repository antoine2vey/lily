import { mockBlogPosts } from '@lily/api/__tests__/fixtures/blog-posts'
import { createMockBlogPostRepository } from '@lily/api/__tests__/mocks/blog-post.repository'
import { createMockDailyTipRepository } from '@lily/api/__tests__/mocks/daily-tip.repository'
import { createMockRagService } from '@lily/api/__tests__/mocks/rag.service'
import { PlantCatalogRepository } from '@lily/api/repositories/plant-catalog.repository'
import { generateAndReviewBlogPost } from '@lily/api/services/blog-generator/generator'
import { researchTopic } from '@lily/api/services/blog-generator/researcher'
import { selectTopic } from '@lily/api/services/blog-generator/topics'
import type {
  ResearchBrief,
  TopicSuggestion,
} from '@lily/api/services/blog-generator/types'
import { generateDailyTip } from '@lily/api/services/tips-scheduler/generator'
import { OpenAIError } from '@lily/shared'
import { Duration, Effect, Exit, Fiber, Layer, Option } from 'effect'
import { TestClock } from 'effect/testing'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// Each generateText call takes the next scripted reply; once the script runs
// out, calls never settle, like a provider that accepted the request and hung.
const script: unknown[] = []
const signals: AbortSignal[] = []

vi.mock('ai', async (importOriginal) => ({
  ...(await importOriginal<typeof import('ai')>()),
  generateText: vi.fn((options: { abortSignal?: AbortSignal }) => {
    if (options.abortSignal) signals.push(options.abortSignal)
    return script.length > 0
      ? Promise.resolve(script.shift())
      : new Promise<never>(() => {})
  }),
}))

beforeEach(() => {
  script.length = 0
  signals.length = 0
})

const topic: TopicSuggestion = {
  slug: 'new-topic',
  title: { en: 'New topic' },
  category: 'care-guide',
  tags: [],
  outline: 'outline',
}

const brief: ResearchBrief = { sources: [], keyFacts: '', uniqueAngles: '' }

const passingReview = {
  output: {
    uniqueness: 100,
    organicFeel: 100,
    factualAccuracy: 100,
    seoQuality: 100,
    contentDepth: 100,
    overallScore: 100,
    feedback: 'ok',
  },
}

const deps = Layer.mergeAll(
  createMockBlogPostRepository(mockBlogPosts),
  createMockDailyTipRepository([]),
  createMockRagService(),
  Layer.succeed(PlantCatalogRepository, {
    findRandomNames: () => Effect.succeed([]),
  } as unknown as typeof PlantCatalogRepository.Service)
)

const cases: ReadonlyArray<{
  readonly name: string
  readonly replies: ReadonlyArray<unknown>
  readonly run: () => Effect.Effect<
    unknown,
    unknown,
    Layer.Success<typeof deps>
  >
  readonly deadline: Duration.Duration
}> = [
  {
    name: 'daily tip generation',
    replies: [],
    run: () => generateDailyTip,
    deadline: Duration.seconds(60),
  },
  {
    name: 'blog topic selection',
    replies: [],
    run: () => selectTopic(),
    deadline: Duration.seconds(60),
  },
  {
    name: 'blog topic research',
    replies: [],
    run: () => researchTopic(topic),
    deadline: Duration.seconds(120),
  },
  {
    name: 'blog content generation',
    replies: [],
    run: () => generateAndReviewBlogPost('blog-1', topic, brief),
    deadline: Duration.minutes(3),
  },
  {
    name: 'blog content review',
    replies: [{ text: 'post' }],
    run: () => generateAndReviewBlogPost('blog-1', topic, brief),
    deadline: Duration.seconds(60),
  },
  {
    name: 'blog translation',
    replies: [{ text: 'post' }, passingReview],
    run: () => generateAndReviewBlogPost('blog-1', topic, brief),
    deadline: Duration.minutes(3),
  },
]

describe('scheduled OpenAI calls against a provider that never responds', () => {
  it.each(cases)(
    '$name fails with a timeout and aborts the request',
    ({ replies, run, deadline }) =>
      Effect.gen(function* () {
        script.push(...replies)
        const fiber = yield* Effect.forkChild(run())

        yield* TestClock.adjust(
          Duration.subtract(deadline, Duration.seconds(1))
        )
        expect(fiber.pollUnsafe()).toBeUndefined()
        const hung = signals[replies.length]
        expect(hung?.aborted).toBe(false)

        yield* TestClock.adjust(Duration.seconds(1))
        const exit = yield* Fiber.await(fiber)

        const error = Exit.findErrorOption(exit).pipe(Option.getOrUndefined)
        expect(error).toBeInstanceOf(OpenAIError)
        expect((error as OpenAIError).code).toBe('server_error')
        expect((error as OpenAIError).message).toContain('no response within')
        expect(hung?.aborted).toBe(true)
      }).pipe(
        Effect.provide(Layer.merge(deps, TestClock.layer())),
        Effect.runPromise
      )
  )
})
