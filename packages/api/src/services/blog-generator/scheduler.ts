import { BlogPostRepository } from '@lily/api/repositories/blog-post.repository'
import { Alerter, logAndAlertWarning } from '@lily/api/services/alerting'
import { createScheduler } from '@lily/api/services/helpers/create-scheduler'
import type { BlogPostSource } from '@lily/db/schema'
import { daysAgoAsDate, hoursAgoAsDate } from '@lily/shared'
import { Array, Config, Effect } from 'effect'
import { generateAndReviewBlogPost } from './generator'
import { researchTopic } from './researcher'
import { selectTopic } from './topics'
import type { TopicSuggestion } from './types'

const MAX_POSTS_PER_DAY = 12

const rejectPost = (postId: string, reason: string) =>
  Effect.gen(function* () {
    const repo = yield* BlogPostRepository
    yield* Effect.logWarning(
      `Blog pipeline failed — marking post ${postId} as rejected: ${reason}`
    )
    yield* repo.updateStatus(postId, 'rejected')
  })

// Run the pipeline for a single blog post, marking it rejected on failure
const runPipeline = (postId: string, topic: TopicSuggestion) =>
  Effect.gen(function* () {
    const repo = yield* BlogPostRepository

    // 1. RESEARCH
    yield* repo.updateStatus(postId, 'researching')
    const brief = yield* researchTopic(topic)

    yield* repo.updateSources(
      postId,
      Array.map(
        brief.sources,
        (s) =>
          ({
            url: s.url,
            title: s.title,
            snippet: s.snippet,
          }) as BlogPostSource
      )
    )

    yield* Effect.log('Research completed', {
      postId,
      sourceCount: Array.length(brief.sources),
    })

    // 2. GENERATE → REVIEW → PUBLISH (or reject)
    yield* generateAndReviewBlogPost(postId, topic, brief)
  }).pipe(
    Effect.catchTags({
      BlogGenerationError: (error) => rejectPost(postId, error.message),
      GitHubPublishError: (error) => rejectPost(postId, error.message),
      OpenAIError: (error) => rejectPost(postId, error.message),
      SqlError: (error) => rejectPost(postId, error.message),
    }),
    Effect.withSpan('blog-generator.pipeline', {
      attributes: { 'post.id': postId },
    })
  )

// Check if we should generate a blog post and run the pipeline
export const checkAndGenerateBlogPost = Effect.gen(function* () {
  // Feature flag check
  const enabled = yield* Config.withDefault(
    Config.boolean('BLOG_GENERATION_ENABLED'),
    false
  )

  if (!enabled) {
    yield* Effect.logWarning('Blog generation skipped — disabled by config')
    return
  }

  const repo = yield* BlogPostRepository

  // Reject posts stuck in progress for over 1 hour (e.g. from server restarts)
  const rejected = yield* repo.rejectStalePosts(hoursAgoAsDate(1))

  if (rejected > 0) {
    yield* Effect.logWarning('Rejected stale in-progress blog posts', {
      count: rejected,
    })
  }

  // Skip if a post is already being processed
  const inProgress = yield* repo.hasInProgress()

  if (inProgress) {
    yield* Effect.log('Blog generation skipped — post already in progress')
    return
  }

  // Check if we've published enough today
  const publishedCount = yield* repo.countPublishedSince(daysAgoAsDate(1))

  if (publishedCount >= MAX_POSTS_PER_DAY) {
    yield* Effect.log('Blog generation skipped — daily limit reached', {
      publishedCount,
      max: MAX_POSTS_PER_DAY,
    })
    return
  }

  yield* Effect.log('Starting blog post generation pipeline')

  // SELECT TOPIC (needed before creating record for slug/title)
  const topic = yield* selectTopic

  yield* Effect.log('Topic selected', {
    slug: topic.slug,
    category: topic.category,
  })

  // CREATE PENDING RECORD
  const post = yield* repo.create({
    slug: topic.slug,
    title: { ...topic.title },
    category: topic.category,
    tags: [...topic.tags],
  })

  if (!post) {
    yield* Effect.logWarning('Failed to create blog post record')
    return
  }

  // Run the pipeline — on any failure, the post is marked rejected
  yield* runPipeline(post.id, topic)
}).pipe(
  Effect.catchTags({
    OpenAIError: (error) =>
      Effect.flatMap(Alerter, (alerter) =>
        logAndAlertWarning(alerter, 'blog-generator', 'Blog pipeline aborted', {
          cause: 'OpenAIError',
          error: error.message.slice(0, 300),
        })
      ),
    SqlError: (error) =>
      Effect.flatMap(Alerter, (alerter) =>
        logAndAlertWarning(
          alerter,
          'blog-generator',
          'Blog pipeline aborted — database error',
          { error: error.message.slice(0, 300) }
        )
      ),
  }),
  Effect.withSpan('blog-generator.check')
)

export const startBlogGeneratorScheduler = createScheduler({
  name: 'blog-generator',
  interval: '1 hour',
  runOnStartup: true,
  task: checkAndGenerateBlogPost,
})
