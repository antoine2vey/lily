import { BlogPostRepository } from '@lily/api/repositories/blog-post.repository'
import { createScheduler } from '@lily/api/services/helpers/create-scheduler'
import type { BlogPostSource } from '@lily/db/schema'
import { daysAgoAsDate } from '@lily/shared'
import { Array, Config, Effect } from 'effect'
import { generateAndReviewBlogPost } from './generator'
import { researchTopic } from './researcher'
import { selectTopic } from './topics'

const MAX_POSTS_PER_WEEK = 3

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

  // Skip if a post is already being processed
  const inProgress = yield* repo.hasInProgress()

  if (inProgress) {
    yield* Effect.log('Blog generation skipped — post already in progress')
    return
  }

  // Check if we've published enough this week
  const publishedCount = yield* repo.countPublishedSince(daysAgoAsDate(7))

  if (publishedCount >= MAX_POSTS_PER_WEEK) {
    yield* Effect.log('Blog generation skipped — weekly limit reached', {
      publishedCount,
      max: MAX_POSTS_PER_WEEK,
    })
    return
  }

  yield* Effect.log('Starting blog post generation pipeline')

  // 1. SELECT TOPIC
  const topic = yield* selectTopic

  yield* Effect.log('Topic selected', {
    slug: topic.slug,
    category: topic.category,
  })

  // 2. CREATE PENDING RECORD
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

  // 3. RESEARCH
  yield* repo.updateStatus(post.id, 'researching')
  const brief = yield* researchTopic(topic)

  yield* repo.updateSources(
    post.id,
    Array.map(
      brief.sources,
      (s) =>
        ({ url: s.url, title: s.title, snippet: s.snippet }) as BlogPostSource
    )
  )

  yield* Effect.log('Research completed', {
    postId: post.id,
    sourceCount: Array.length(brief.sources),
  })

  // 4. GENERATE → REVIEW → PUBLISH (or reject)
  yield* generateAndReviewBlogPost(post.id, topic, brief)
}).pipe(Effect.withSpan('blog-generator.check'))

export const startBlogGeneratorScheduler = createScheduler({
  name: 'blog-generator',
  interval: '4 hours',
  runOnStartup: true,
  task: checkAndGenerateBlogPost,
})
