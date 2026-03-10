import { openai } from '@ai-sdk/openai'
import { BlogPostRepository } from '@lily/api/repositories/blog-post.repository'
import type { LocalizedText } from '@lily/db/schema'
import { generateText, Output } from 'ai'
import { Array, Effect, Option, pipe, Record } from 'effect'
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

const MAX_RETRIES = 5
const MIN_SCORE = 95

/** Languages to generate content for — add new languages here */
const TARGET_LANGUAGES: ReadonlyArray<{ code: 'en' | 'fr'; name: string }> = [
  { code: 'en', name: 'English' },
  { code: 'fr', name: 'French' },
]

const generateContent = (
  topic: TopicSuggestion,
  brief: ResearchBrief,
  publishedPosts: readonly { slug: string; title: LocalizedText }[],
  previousFeedback?: string
) =>
  Effect.gen(function* () {
    const researchContext = `Key Facts:\n${brief.keyFacts}\n\nUnique Angles:\n${brief.uniqueAngles}\n\nSource Snippets:\n${pipe(
      brief.sources,
      Array.map((s) => `- ${s.title}: ${s.snippet}`),
      Array.join('\n')
    )}`

    const englishTitle = pipe(
      Option.fromNullable(topic.title.en),
      Option.orElse(() => Array.head(Record.values(topic.title))),
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
    const enResult = yield* Effect.tryPromise(() =>
      generateText({
        model: openai('gpt-4o'),
        system: GENERATION_SYSTEM_PROMPT,
        prompt: userPrompt,
      })
    )

    const content: Record<string, string> = { en: enResult.text }

    // Generate translations for all non-English languages
    const translationLanguages = Array.filter(
      TARGET_LANGUAGES,
      (lang) => lang.code !== 'en'
    )

    yield* Effect.forEach(translationLanguages, (lang) =>
      Effect.gen(function* () {
        const result = yield* Effect.tryPromise(() =>
          generateText({
            model: openai('gpt-4o'),
            system: TRANSLATION_PROMPT,
            prompt: `Translate this blog post to ${lang.name} (locale code: ${lang.code}).\nReplace all "/en/blog/" links with "/${lang.code}/blog/".\n\n${enResult.text}`,
          })
        )
        content[lang.code] = result.text
      })
    )

    return { content } as GeneratedContent
  }).pipe(Effect.withSpan('blog-generator.generateContent'))

const reviewContent = (
  content: GeneratedContent,
  brief: ResearchBrief,
  validSlugs: readonly string[]
) =>
  Effect.gen(function* () {
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
      Option.orElse(() => Array.head(Record.values(content.content))),
      Option.getOrElse(() => '')
    )

    const validLinks = pipe(
      validSlugs,
      Array.map((s) => `/en/blog/${s}`),
      Array.join(', ')
    )

    const result = yield* Effect.tryPromise(() =>
      generateText({
        model: openai('gpt-4o'),
        output: Output.object({ schema: ReviewSchema }),
        system: REVIEW_SYSTEM_PROMPT,
        prompt: `Review this blog post for quality and originality.

GENERATED CONTENT:
${primaryContent}

ORIGINAL SOURCE MATERIAL (compare for uniqueness):
${sourceSnippets}

VALID INTERNAL LINK PATHS (any link NOT in this list is broken):
${validLinks || 'None — no internal links should be present'}`,
      })
    )

    return result.output as ReviewResult
  }).pipe(Effect.withSpan('blog-generator.reviewContent'))

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
            // GENERATE
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
              retryCount: state.retryCount,
            })

            yield* Effect.log('Blog post reviewed', {
              postId,
              overallScore: review.overallScore,
              uniqueness: review.uniqueness,
              organicFeel: review.organicFeel,
              factualAccuracy: review.factualAccuracy,
              seoQuality: review.seoQuality,
              retryCount: state.retryCount,
            })

            // DECIDE
            const allDimensionsPassing =
              review.uniqueness >= MIN_SCORE &&
              review.organicFeel >= MIN_SCORE &&
              review.factualAccuracy >= MIN_SCORE &&
              review.seoQuality >= MIN_SCORE

            if (allDimensionsPassing) {
              const commitShas = yield* publishBlogPost(
                topic.slug,
                generated.content
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

    // Max retries reached — reject
    yield* repo.updateStatus(postId, 'rejected')
    yield* Effect.logWarning('Blog post rejected after max retries', {
      postId,
      slug: topic.slug,
    })
  }).pipe(
    Effect.withSpan('blog-generator.generateAndReview', {
      attributes: { 'post.id': postId, 'topic.slug': topic.slug },
    })
  )
