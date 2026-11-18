import { Effect, Schema } from 'effect'

const message = (text: string) =>
  Schema.String.pipe(
    Schema.withDecodingDefaultType(Effect.succeed(text)),
    Schema.withConstructorDefault(Effect.succeed(text))
  )

export class CanopyNotFoundError extends Schema.TaggedError<
  CanopyNotFoundError,
  { readonly brand: unique symbol }
>()(
  'CanopyNotFoundError',
  { message: message('Canopy not found') },
  { httpApiStatus: 404 }
) {}

export class AlreadyInCanopyError extends Schema.TaggedError<
  AlreadyInCanopyError,
  { readonly brand: unique symbol }
>()(
  'AlreadyInCanopyError',
  {
    canopyName: Schema.String,
    message: message('Leave your current Canopy before joining another'),
  },
  { httpApiStatus: 409 }
) {}

export class CanopyFullError extends Schema.TaggedError<
  CanopyFullError,
  { readonly brand: unique symbol }
>()(
  'CanopyFullError',
  {
    limit: Schema.Finite,
    message: message('This Canopy is full'),
  },
  { httpApiStatus: 409 }
) {}

export class CanopyMemberNotFoundError extends Schema.TaggedError<
  CanopyMemberNotFoundError,
  { readonly brand: unique symbol }
>()(
  'CanopyMemberNotFoundError',
  { message: message('Member not found') },
  { httpApiStatus: 404 }
) {}

export class CanopyInviteNotFoundError extends Schema.TaggedError<
  CanopyInviteNotFoundError,
  { readonly brand: unique symbol }
>()(
  'CanopyInviteNotFoundError',
  { message: message('Invite not found') },
  { httpApiStatus: 404 }
) {}

export class CanopyInviteExpiredError extends Schema.TaggedError<
  CanopyInviteExpiredError,
  { readonly brand: unique symbol }
>()(
  'CanopyInviteExpiredError',
  { message: message('This invite has expired') },
  { httpApiStatus: 410 }
) {}

export class CanopyInviteeAlreadyMemberError extends Schema.TaggedError<
  CanopyInviteeAlreadyMemberError,
  { readonly brand: unique symbol }
>()(
  'CanopyInviteeAlreadyMemberError',
  { message: message('Already in your Canopy') },
  { httpApiStatus: 409 }
) {}

export class NotCanopyOwnerError extends Schema.TaggedError<
  NotCanopyOwnerError,
  { readonly brand: unique symbol }
>()(
  'NotCanopyOwnerError',
  { message: message('Only the Canopy owner can do this') },
  { httpApiStatus: 403 }
) {}

export class CanopyPlantNotDelegableError extends Schema.TaggedError<
  CanopyPlantNotDelegableError,
  { readonly brand: unique symbol }
>()(
  'CanopyPlantNotDelegableError',
  {
    plantId: Schema.String,
    message: message('Canopy plants cannot be delegated'),
  },
  { httpApiStatus: 409 }
) {}

export class PlantInDelegationError extends Schema.TaggedError<
  PlantInDelegationError,
  { readonly brand: unique symbol }
>()(
  'PlantInDelegationError',
  {
    plantId: Schema.String,
    message: message('This plant is in a care delegation'),
  },
  { httpApiStatus: 409 }
) {}
