import { Effect, Schema } from 'effect'

const message = (text: string) =>
  Schema.String.pipe(
    Schema.withDecodingDefaultType(Effect.succeed(text)),
    Schema.withConstructorDefault(Effect.succeed(text))
  )

export class CanopyNotFoundError extends Schema.TaggedError<CanopyNotFoundError>()(
  'CanopyNotFoundError',
  { message: message('Canopy not found') },
  { httpApiStatus: 404 }
) {}

export class AlreadyInCanopyError extends Schema.TaggedError<AlreadyInCanopyError>()(
  'AlreadyInCanopyError',
  { message: message('Leave your current Canopy before joining another') },
  { httpApiStatus: 409 }
) {}

export class CanopyFullError extends Schema.TaggedError<CanopyFullError>()(
  'CanopyFullError',
  {
    limit: Schema.Number,
    message: message('This Canopy is full'),
  },
  { httpApiStatus: 409 }
) {}

export class CanopyInviteNotFoundError extends Schema.TaggedError<CanopyInviteNotFoundError>()(
  'CanopyInviteNotFoundError',
  { message: message('Invite not found') },
  { httpApiStatus: 404 }
) {}

export class CanopyInviteExpiredError extends Schema.TaggedError<CanopyInviteExpiredError>()(
  'CanopyInviteExpiredError',
  { message: message('This invite has expired') },
  { httpApiStatus: 410 }
) {}

export class NotCanopyOwnerError extends Schema.TaggedError<NotCanopyOwnerError>()(
  'NotCanopyOwnerError',
  { message: message('Only the Canopy owner can do this') },
  { httpApiStatus: 403 }
) {}

export class PlantInDelegationError extends Schema.TaggedError<PlantInDelegationError>()(
  'PlantInDelegationError',
  {
    plantId: Schema.String,
    message: message('This plant is in a care delegation'),
  },
  { httpApiStatus: 409 }
) {}
