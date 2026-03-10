import { openai } from '@ai-sdk/openai'
import { BlogPostRepository } from '@lily/api/repositories/blog-post.repository'
import { generateText, Output } from 'ai'
import { Array, Effect, Option, pipe, Record } from 'effect'
import { z } from 'zod'
import { publishBlogPost } from './github'
import {
  GENERATION_SYSTEM_PROMPT,
  GENERATION_USER_PROMPT,
  REVIEW_SYSTEM_PROMPT,
  TRANSLATION_PROMPT,
} from './prompts'
import type {
  GeneratedContent,
  ResearchBrief,
  ReviewResult,
  TopicSuggestion,
} from './types'

const ReviewSchema = z.object({
  uniqueness: z
    .number()
    .min(0)
    .max(100)
    .describe(
      'How original the content is compared to source material. 100 = completely rephrased, 0 = copied verbatim.'
    ),
  organicFeel: z
    .number()
    .min(0)
    .max(100)
    .describe(
      'How natural and human-written the content reads. 100 = indistinguishable from a human expert, 0 = obviously AI-generated.'
    ),
  factualAccuracy: z
    .number()
    .min(0)
    .max(100)
    .describe(
      'Whether the plant care advice is scientifically correct and safe to follow. 100 = fully accurate, 0 = contains dangerous misinformation.'
    ),
  seoQuality: z
    .number()
    .min(0)
    .max(100)
    .describe(
      'SEO readiness: proper heading structure, keyword usage, meta-friendly intro, internal linking opportunities. 100 = perfectly optimized.'
    ),
  overallScore: z
    .number()
    .min(0)
    .max(100)
    .describe(
      'Weighted overall quality score. Must be >= 95 for the post to be published.'
    ),
  feedback: z
    .string()
    .describe(
      'Actionable critique explaining what needs improvement. Be specific about which sentences or sections are problematic.'
    ),
})

const MAX_RETRIES = 3
const MIN_SCORE = 95

/** Languages to generate content for — add new languages here */
const TARGET_LANGUAGES: ReadonlyArray<{ code: 'en' | 'fr'; name: string }> = [
  { code: 'en', name: 'English' },
  { code: 'fr', name: 'French' },
]

const generateContent = (
  topic: TopicSuggestion,
  brief: ResearchBrief,
  previousFeedback?: string
) =>
  Effect.gen(function* () {
    const researchContext = `Key Facts:\n${brief.keyFacts}\n\nUnique Angles:\n${brief.uniqueAngles}\n\nSource Snippets:\n${pipe(
      brief.sources,
      Array.map((s) => `- ${s.title}: ${s.snippet}`),
      Array.join('\n')
    )}`

    const englishTitle = Option.getOrElse(
      Option.fromNullable(topic.title.en),
      () => Record.values(topic.title)[0] ?? 'Untitled'
    )

    const userPrompt = previousFeedback
      ? `${GENERATION_USER_PROMPT(englishTitle, topic.outline, researchContext)}\n\nPREVIOUS REVIEW FEEDBACK (address these issues):\n${previousFeedback}`
      : GENERATION_USER_PROMPT(englishTitle, topic.outline, researchContext)

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
            prompt: `Translate this blog post to ${lang.name}:\n\n${enResult.text}`,
          })
        )
        content[lang.code] = result.text
      })
    )

    return { content } as GeneratedContent
  }).pipe(Effect.withSpan('blog-generator.generateContent'))

const reviewContent = (content: GeneratedContent, brief: ResearchBrief) =>
  Effect.gen(function* () {
    const sourceSnippets = pipe(
      brief.sources,
      Array.map(
        (s) => `Source: ${s.title}\nURL: ${s.url}\nSnippet: ${s.snippet}`
      ),
      Array.join('\n\n')
    )

    // Review the primary (English) content
    const primaryContent = Option.getOrElse(
      Option.fromNullable(content.content.en),
      () => Record.values(content.content)[0] ?? ''
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
${sourceSnippets}`,
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
    let retryCount = 0
    let lastFeedback: string | undefined

    while (retryCount < MAX_RETRIES) {
      // GENERATE
      yield* repo.updateStatus(postId, 'generating')
      const generated = yield* generateContent(topic, brief, lastFeedback)
      yield* repo.updateContent(postId, generated.content)

      // REVIEW
      yield* repo.updateStatus(postId, 'reviewing')
      const review = yield* reviewContent(generated, brief)

      yield* repo.updateReview(postId, {
        reviewScore: review.overallScore,
        reviewFeedback: review.feedback,
        retryCount,
      })

      yield* Effect.log('Blog post reviewed', {
        postId,
        overallScore: review.overallScore,
        uniqueness: review.uniqueness,
        organicFeel: review.organicFeel,
        factualAccuracy: review.factualAccuracy,
        seoQuality: review.seoQuality,
        retryCount,
      })

      // DECIDE
      const allDimensionsPassing =
        review.uniqueness >= MIN_SCORE &&
        review.organicFeel >= MIN_SCORE &&
        review.factualAccuracy >= MIN_SCORE &&
        review.seoQuality >= MIN_SCORE

      if (allDimensionsPassing) {
        // PUBLISH — commit one file per language
        const commitShas = yield* publishBlogPost(topic.slug, generated.content)

        yield* repo.markPublished(postId, commitShas)

        yield* Effect.log('Blog post published', {
          postId,
          slug: topic.slug,
          overallScore: review.overallScore,
        })
        return
      }

      // Not good enough — retry with feedback
      retryCount = retryCount + 1
      lastFeedback = review.feedback

      yield* Effect.log('Blog post needs improvement, retrying', {
        postId,
        retryCount,
        overallScore: review.overallScore,
        feedback: review.feedback,
      })
    }

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
