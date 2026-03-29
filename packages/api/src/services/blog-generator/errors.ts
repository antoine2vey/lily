import { Data } from 'effect'

export class BlogGenerationError extends Data.TaggedError(
  'BlogGenerationError'
)<{ readonly message: string; readonly cause?: unknown }> {}

export class TopicSelectionError extends Data.TaggedError(
  'TopicSelectionError'
)<{ readonly message: string; readonly cause?: unknown }> {}

export class GitHubPublishError extends Data.TaggedError('GitHubPublishError')<{
  readonly message: string
  readonly cause?: unknown
}> {}
