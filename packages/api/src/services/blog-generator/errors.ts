import { Data } from 'effect'

export { mapOpenAIError } from '@lily/shared'

export class BlogGenerationError extends Data.TaggedError(
  'BlogGenerationError'
)<{ readonly message: string; readonly cause?: unknown }> {}

export class GitHubPublishError extends Data.TaggedError('GitHubPublishError')<{
  readonly message: string
  readonly cause?: unknown
}> {}
