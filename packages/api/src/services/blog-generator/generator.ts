import { openai } from '@ai-sdk/openai'
import { BlogPostRepository } from '@lily/api/repositories/blog-post.repository'
import { CHAT_MODEL, FAST_MODEL } from '@lily/api/services/ai/models'
import type { LocalizedText } from '@lily/db/schema'
import type { LanguageCode } from '@lily/shared'
import { generateText, Output } from 'ai'
import { Array, Effect, Option, pipe, Record } from 'effect'
import { BlogGenerationError, mapOpenAIError } from './errors'
import { publishBlogPost } from './github'
import {
  GENERATION_SYSTEM_PROMPT,
  GENERATION_USER_PROMPT,
  REVIEW_SYSTEM_PROMPT,
  TRANSLATION_PROMPT,
} from './prompts'
import { ReviewSchema } from './schemas'
import type {
  GeneratedContent,
  ResearchBrief,
  ReviewResult,
  TopicSuggestion,
} from './types'

const MAX_RETRIES = 3
const MIN_SCORE = 88

/** Strip markdown code fences (```mdx / ```) that LLMs sometimes wrap around output */
const stripCodeFences = (text: string): string =>
  text
    .trim()
    .replace(/^```(?:mdx|markdown)?\s*\n/, '')
    .replace(/\n```\s*$/, '')
    .trim()

/** Languages to generate content for — add new languages here */
const TARGET_LANGUAGES: ReadonlyArray<{ code: LanguageCode; name: string }> = [
  { code: 'en', name: 'English' },
  { code: 'fr', name: 'French' },
]

const generateContent = Effect.fn('blog-generator.generateContent')(function* (
  topic: TopicSuggestion,
  brief: ResearchBrief,
  publishedPosts: readonly { slug: string; title: LocalizedText }[],
  previousFeedback?: string
) {
  const researchContext = `Key Facts:\n${brief.keyFacts}\n\nUnique Angles:\n${brief.uniqueAngles}\n\nSource Snippets:\n${pipe(
    brief.sources,
    Array.map((s) => `- ${s.title}: ${s.snippet}`),
    Array.join('\n')
  )}`

  const englishTitle = pipe(
    Option.fromNullable(topic.title.en),
    Option.orElse(() => Array.head(Record.values(topic.title) as string[])),
    Option.getOrElse(() => 'Untitled')
  )

  const existingPostsList = pipe(
    publishedPosts,
    Array.filter((p) => p.slug !== topic.slug),
    Array.map(
      (p) =>
        `- /en/blog/${p.slug} — "${Option.getOrElse(Option.fromNullable(p.title.en), () => p.slug)}"`
    ),
    Array.join('\n')
  )

  const basePrompt = GENERATION_USER_PROMPT(
    englishTitle,
    topic.outline,
    researchContext,
    existingPostsList
  )

  const userPrompt = previousFeedback
    ? `${basePrompt}\n\nPREVIOUS REVIEW FEEDBACK (address these issues):\n${previousFeedback}`
    : basePrompt

  // Generate primary (English) content
  const enResult = yield* Effect.tryPromise({
    try: () =>
      generateText({
        model: openai(CHAT_MODEL),
        system: GENERATION_SYSTEM_PROMPT,
        prompt: userPrompt,
      }),
    catch: mapOpenAIError('English content generation'),
  })

  return { content: { en: stripCodeFences(enResult.text) } }
})

const translateContent = Effect.fn('blog-generator.translateContent')(
  function* (englishContent: string) {
    const content: Record<string, string> = { en: englishContent }

    const translationLanguages = Array.filter(
      TARGET_LANGUAGES,
      (lang) => lang.code !== 'en'
    )

    yield* Effect.forEach(
      translationLanguages,
      (lang) =>
        Effect.gen(function* () {
          const result = yield* Effect.tryPromise({
            try: () =>
              generateText({
                model: openai(FAST_MODEL),
                system: TRANSLATION_PROMPT,
                prompt: `Translate this blog post to ${lang.name} (locale code: ${lang.code}).\nReplace all "/en/blog/" links with "/${lang.code}/blog/".\n\n${englishContent}`,
              }),
            catch: mapOpenAIError(`Translation to ${lang.name}`),
          })
          content[lang.code] = stripCodeFences(result.text)
        }),
      { concurrency: 'unbounded' }
    )

    return content
  }
)

const reviewContent = Effect.fn('blog-generator.reviewContent')(function* (
  content: GeneratedContent,
  brief: ResearchBrief,
  validSlugs: readonly string[]
) {
  const sourceSnippets = pipe(
    brief.sources,
    Array.map(
      (s) => `Source: ${s.title}\nURL: ${s.url}\nSnippet: ${s.snippet}`
    ),
    Array.join('\n\n')
  )

  // Review the primary (English) content
  const primaryContent = pipe(
    Option.fromNullable(content.content.en),
    Option.orElse(() => Array.head(Record.values(content.content) as string[])),
    Option.getOrElse(() => '')
  )

  const validLinks = pipe(
    validSlugs,
    Array.map((s) => `/en/blog/${s}`),
    Array.join(', ')
  )

  const result = yield* Effect.tryPromise({
    try: () =>
      generateText({
        model: openai(CHAT_MODEL),
        output: Output.object({ schema: ReviewSchema }),
        system: REVIEW_SYSTEM_PROMPT,
        prompt: `Review this blog post for quality and originality.

GENERATED CONTENT:
${primaryContent}

ORIGINAL SOURCE MATERIAL (compare for uniqueness):
${sourceSnippets}

VALID INTERNAL LINK PATHS (any link NOT in this list is broken):
${validLinks || 'None — no internal links should be present'}`,
      }),
    catch: mapOpenAIError('Content review'),
  })

  return result.output as ReviewResult
})

export const generateAndReviewBlogPost = (
  postId: string,
  topic: TopicSuggestion,
  brief: ResearchBrief
) =>
  Effect.gen(function* () {
    const repo = yield* BlogPostRepository

    // Fetch valid slugs once for link validation across retries
    const publishedPosts = yield* repo.findPublishedSlugsWithTitles()
    const validSlugs = pipe(
      publishedPosts,
      Array.filter((p) => p.slug !== topic.slug),
      Array.map((p) => p.slug)
    )

    const result = yield* Effect.iterate(
      {
        retryCount: 0,
        feedback: undefined as string | undefined,
        published: false,
      },
      {
        while: (state) => !state.published && state.retryCount < MAX_RETRIES,
        body: (state) =>
          Effect.gen(function* () {
            // Persist attempt number + transition to generating
            yield* repo.updateRetryCount(postId, state.retryCount)
            yield* repo.updateStatus(postId, 'generating')
            const generated = yield* generateContent(
              topic,
              brief,
              publishedPosts,
              state.feedback
            )
            yield* repo.updateContent(postId, generated.content)

            // REVIEW
            yield* repo.updateStatus(postId, 'reviewing')
            const review = yield* reviewContent(generated, brief, validSlugs)

            yield* repo.updateReview(postId, {
              reviewScore: Math.round(review.overallScore),
              reviewFeedback: review.feedback,
            })

            yield* Effect.log('Blog post reviewed', {
              postId,
              overallScore: review.overallScore,
              uniqueness: review.uniqueness,
              organicFeel: review.organicFeel,
              factualAccuracy: review.factualAccuracy,
              seoQuality: review.seoQuality,
              contentDepth: review.contentDepth,
              retryCount: state.retryCount,
            })

            // DECIDE
            const allDimensionsPassing =
              review.uniqueness >= MIN_SCORE &&
              review.organicFeel >= MIN_SCORE &&
              review.factualAccuracy >= MIN_SCORE &&
              review.seoQuality >= MIN_SCORE &&
              review.contentDepth >= 80

            if (allDimensionsPassing) {
              // Translate only after review passes
              const enContent = yield* Option.match(
                Option.fromNullable(generated.content.en),
                {
                  onNone: () =>
                    new BlogGenerationError({
                      message: 'English content missing after generation',
                    }),
                  onSome: Effect.succeed,
                }
              )
              const translatedContent = yield* translateContent(enContent)
              yield* repo.updateContent(postId, translatedContent)

              const commitShas = yield* publishBlogPost(
                topic.slug,
                translatedContent
              )

              yield* repo.markPublished(postId, commitShas)

              yield* Effect.log('Blog post published', {
                postId,
                slug: topic.slug,
                overallScore: review.overallScore,
              })

              return { ...state, published: true }
            }

            yield* Effect.log('Blog post needs improvement, retrying', {
              postId,
              retryCount: state.retryCount + 1,
              overallScore: review.overallScore,
              feedback: review.feedback,
            })

            return {
              retryCount: state.retryCount + 1,
              feedback: review.feedback as string | undefined,
              published: false,
            }
          }),
      }
    )

    if (result.published) return

    // Max retries reached — yield error so the caller handles rejection
    return yield* new BlogGenerationError({
      message: `Max retries (${MAX_RETRIES}) reached for post ${topic.slug}`,
    })
  }).pipe(
    Effect.withSpan('blog-generator.generateAndReview', {
      attributes: { 'post.id': postId, 'topic.slug': topic.slug },
    })
  )
