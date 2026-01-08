import { Data } from 'effect'

export class DeviceTokenNotFoundError extends Data.TaggedError(
  'DeviceTokenNotFoundError'
) {}
