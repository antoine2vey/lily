import { Data } from 'effect'

export class CareLogNotFoundError extends Data.TaggedError(
  'CareLogNotFoundError'
) {}
