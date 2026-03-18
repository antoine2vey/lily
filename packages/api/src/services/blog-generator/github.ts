import type { LocalizedText } from '@lily/db/schema'
import { Array, Config, Effect, pipe, Record, String as Str } from 'effect'
import { Octokit } from 'octokit'
import { GitHubPublishError } from './errors'

const encodeBase64 = (str: string): string =>
  Buffer.from(str, 'utf-8').toString('base64')

/**
 * Publish all localized blog post files via a single commit pushed directly
 * to the base branch (default: main).
 */
export const publishBlogPost = (slug: string, content: LocalizedText) =>
  Effect.gen(function* () {
    const token = yield* Config.string('GITHUB_TOKEN')
    const fullRepo = yield* Config.string('GITHUB_REPO')
    const [owner, repo] = yield* pipe(Str.split(fullRepo, '/'), (parts) =>
      Array.length(parts) === 2
        ? Effect.succeed(parts as unknown as [string, string])
        : Effect.fail(
            new GitHubPublishError({
              message: `Invalid GITHUB_REPO format: ${fullRepo}`,
            })
          )
    )
    const baseBranch = yield* Config.withDefault(
      Config.string('GITHUB_BRANCH'),
      'main'
    )

    const octokit = new Octokit({ auth: token })

    // 1. Get the base branch HEAD
    const { data: baseRef } = yield* Effect.tryPromise({
      try: () =>
        octokit.rest.git.getRef({
          owner,
          repo,
          ref: `heads/${baseBranch}`,
        }),
      catch: (e) =>
        new GitHubPublishError({
          message: 'Failed to get base branch ref',
          cause: e,
        }),
    })
    const baseSha = baseRef.object.sha

    // 2. Get the base commit's tree
    const { data: baseCommit } = yield* Effect.tryPromise({
      try: () =>
        octokit.rest.git.getCommit({
          owner,
          repo,
          commit_sha: baseSha,
        }),
      catch: (e) =>
        new GitHubPublishError({
          message: 'Failed to get base commit',
          cause: e,
        }),
    })

    // 3. Create blobs for all locale files (in parallel — blobs are independent)
    const entries = Record.toEntries(content) as Array<[string, string]>
    const blobs = yield* Effect.forEach(
      entries,
      ([locale, mdx]) =>
        Effect.gen(function* () {
          const { data: blob } = yield* Effect.tryPromise({
            try: () =>
              octokit.rest.git.createBlob({
                owner,
                repo,
                content: encodeBase64(mdx),
                encoding: 'base64',
              }),
            catch: (e) =>
              new GitHubPublishError({
                message: `Failed to create blob for ${locale}`,
                cause: e,
              }),
          })
          return {
            path: `packages/web/content/posts/${locale}/${slug}.mdx`,
            mode: '100644' as const,
            type: 'blob' as const,
            sha: blob.sha,
          }
        }),
      { concurrency: 'unbounded' }
    )

    // 4. Create a new tree with all files
    const { data: tree } = yield* Effect.tryPromise({
      try: () =>
        octokit.rest.git.createTree({
          owner,
          repo,
          base_tree: baseCommit.tree.sha,
          tree: [...blobs],
        }),
      catch: (e) =>
        new GitHubPublishError({
          message: 'Failed to create tree',
          cause: e,
        }),
    })

    // 5. Create a single commit with all files
    const { data: commit } = yield* Effect.tryPromise({
      try: () =>
        octokit.rest.git.createCommit({
          owner,
          repo,
          message: `blog: add ${slug}`,
          tree: tree.sha,
          parents: [baseSha],
        }),
      catch: (e) =>
        new GitHubPublishError({
          message: 'Failed to create commit',
          cause: e,
        }),
    })

    // 6. Fast-forward the base branch to the new commit
    yield* Effect.tryPromise({
      try: () =>
        octokit.rest.git.updateRef({
          owner,
          repo,
          ref: `heads/${baseBranch}`,
          sha: commit.sha,
        }),
      catch: (e) =>
        new GitHubPublishError({
          message: 'Failed to push commit to base branch',
          cause: e,
        }),
    })

    yield* Effect.log('Blog post pushed to main', {
      slug,
      commitSha: commit.sha,
      branch: baseBranch,
    })

    // Return commit SHA keyed by locale
    return pipe(
      entries,
      Array.map(([locale]) => [locale, commit.sha] as const),
      Record.fromEntries
    ) as LocalizedText
  }).pipe(
    Effect.withSpan('blog-generator.publishBlogPost', {
      attributes: { 'post.slug': slug },
    })
  )
