import type { LocalizedText } from '@lily/db/schema'
import { Config, Effect, Record } from 'effect'
import type { GitHubCommitResult } from './types'

interface CommitFileParams {
  readonly path: string
  readonly content: string
  readonly message: string
}

const encodeBase64 = (str: string): string =>
  Buffer.from(str, 'utf-8').toString('base64')

export const commitFileToGitHub = (params: CommitFileParams) =>
  Effect.gen(function* () {
    const token = yield* Config.string('GITHUB_TOKEN')
    const repo = yield* Config.string('GITHUB_REPO')

    const url = `https://api.github.com/repos/${repo}/contents/${params.path}`

    // Check if file already exists (to get its sha for update)
    const existingResponse = yield* Effect.tryPromise(() =>
      fetch(url, {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/vnd.github.v3+json',
        },
      })
    )

    const body: Record<string, string> = {
      message: params.message,
      content: encodeBase64(params.content),
    }

    // If file exists, we need to include the sha
    if (existingResponse.ok) {
      const existing = yield* Effect.tryPromise(
        () => existingResponse.json() as Promise<{ sha: string }>
      )
      body.sha = existing.sha
    }

    const response = yield* Effect.tryPromise(() =>
      fetch(url, {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/vnd.github.v3+json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      })
    )

    if (!response.ok) {
      const errorText = yield* Effect.tryPromise(() => response.text())
      return yield* Effect.fail(
        new Error(`GitHub API error ${response.status}: ${errorText}`)
      )
    }

    const result = yield* Effect.tryPromise(
      () =>
        response.json() as Promise<{
          content: { sha: string; path: string }
        }>
    )

    return {
      sha: result.content.sha,
      path: result.content.path,
    } as GitHubCommitResult
  }).pipe(
    Effect.withSpan('blog-generator.commitFile', {
      attributes: { 'file.path': params.path },
    })
  )

/** Publish all localized versions of a blog post to GitHub */
export const publishBlogPost = (slug: string, content: LocalizedText) =>
  Effect.gen(function* () {
    const commitShas: Record<string, string> = {}

    // Commit one file per language
    yield* Effect.forEach(Record.toEntries(content), ([locale, mdx]) =>
      Effect.gen(function* () {
        const result = yield* commitFileToGitHub({
          path: `packages/web/content/posts/${locale}/${slug}.mdx`,
          content: mdx,
          message: `blog: add ${slug} (${locale})`,
        })
        commitShas[locale] = result.sha
      })
    )

    return commitShas as LocalizedText
  }).pipe(
    Effect.withSpan('blog-generator.publishBlogPost', {
      attributes: { 'post.slug': slug },
    })
  )
