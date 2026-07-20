import { UserProfile } from '@lily/shared/auth'
import { Effect, Option, pipe, Schema } from 'effect'
import * as SecureStore from 'expo-secure-store'

class StorageError extends Schema.TaggedError<StorageError>()('StorageError', {
  message: Schema.String,
  cause: Schema.optional(Schema.Unknown),
}) {}

const ACCESS_TOKEN_KEY = 'lily_access_token'
const REFRESH_TOKEN_KEY = 'lily_refresh_token'
const USER_EMAIL_KEY = 'lily_user_email'
const USER_PROFILE_KEY = 'lily_user_profile'

// JSON codec for the cached profile — encodes/decodes through the schema
// so Date fields round-trip as real Dates, not strings
const UserProfileJson = Schema.parseJson(UserProfile)

// Access Token
export const storeAccessToken = (
  token: string
): Effect.Effect<void, StorageError> =>
  Effect.tryPromise({
    try: () => SecureStore.setItemAsync(ACCESS_TOKEN_KEY, token),
    catch: (cause) =>
      new StorageError({ message: 'Failed to store access token', cause }),
  })

export const getStoredAccessToken = (): Effect.Effect<
  Option.Option<string>,
  StorageError
> =>
  Effect.tryPromise({
    try: async () => {
      const token = await SecureStore.getItemAsync(ACCESS_TOKEN_KEY)
      return Option.fromNullable(token)
    },
    catch: (cause) =>
      new StorageError({ message: 'Failed to get access token', cause }),
  })

export const removeStoredAccessToken = (): Effect.Effect<void, StorageError> =>
  Effect.tryPromise({
    try: () => SecureStore.deleteItemAsync(ACCESS_TOKEN_KEY),
    catch: (cause) =>
      new StorageError({ message: 'Failed to remove access token', cause }),
  })

// Refresh Token
export const storeRefreshToken = (
  token: string
): Effect.Effect<void, StorageError> =>
  Effect.tryPromise({
    try: () => SecureStore.setItemAsync(REFRESH_TOKEN_KEY, token),
    catch: (cause) =>
      new StorageError({ message: 'Failed to store refresh token', cause }),
  })

export const removeStoredRefreshToken = (): Effect.Effect<void, StorageError> =>
  Effect.tryPromise({
    try: () => SecureStore.deleteItemAsync(REFRESH_TOKEN_KEY),
    catch: (cause) =>
      new StorageError({ message: 'Failed to remove refresh token', cause }),
  })

// User Email
export const storeUserEmail = (
  email: string
): Effect.Effect<void, StorageError> =>
  Effect.tryPromise({
    try: () => SecureStore.setItemAsync(USER_EMAIL_KEY, email),
    catch: (cause) =>
      new StorageError({ message: 'Failed to store email', cause }),
  })

export const getStoredUserEmail = (): Effect.Effect<
  Option.Option<string>,
  StorageError
> =>
  Effect.tryPromise({
    try: async () => {
      const email = await SecureStore.getItemAsync(USER_EMAIL_KEY)
      return Option.fromNullable(email)
    },
    catch: (cause) =>
      new StorageError({ message: 'Failed to get email', cause }),
  })

export const removeStoredUserEmail = (): Effect.Effect<void, StorageError> =>
  Effect.tryPromise({
    try: () => SecureStore.deleteItemAsync(USER_EMAIL_KEY),
    catch: (cause) =>
      new StorageError({ message: 'Failed to remove email', cause }),
  })

// Cached user profile — lets the app restore an authenticated session
// when the startup getCurrentUser call fails transiently (e.g. launched
// from a notification tap before the network is up)
export const storeUserProfile = (
  user: UserProfile
): Effect.Effect<void, StorageError> =>
  pipe(
    Schema.encode(UserProfileJson)(user),
    Effect.mapError(
      (cause) =>
        new StorageError({ message: 'Failed to encode user profile', cause })
    ),
    Effect.flatMap((json) =>
      Effect.tryPromise({
        try: () => SecureStore.setItemAsync(USER_PROFILE_KEY, json),
        catch: (cause) =>
          new StorageError({ message: 'Failed to store user profile', cause }),
      })
    )
  )

export const getStoredUserProfile = (): Effect.Effect<
  Option.Option<UserProfile>,
  StorageError
> =>
  Effect.tryPromise({
    try: () => SecureStore.getItemAsync(USER_PROFILE_KEY),
    catch: (cause) =>
      new StorageError({ message: 'Failed to get user profile', cause }),
  }).pipe(
    Effect.flatMap((raw) =>
      pipe(
        Option.fromNullable(raw),
        Option.match({
          onNone: () => Effect.succeed(Option.none<UserProfile>()),
          onSome: (json) =>
            pipe(
              Schema.decode(UserProfileJson)(json),
              Effect.map(Option.some),
              // A corrupt or schema-outdated cache entry is not fatal —
              // treat it as absent so startup falls back to the login flow
              Effect.catchAll(() => Effect.succeed(Option.none<UserProfile>()))
            ),
        })
      )
    )
  )

export const removeStoredUserProfile = (): Effect.Effect<void, StorageError> =>
  Effect.tryPromise({
    try: () => SecureStore.deleteItemAsync(USER_PROFILE_KEY),
    catch: (cause) =>
      new StorageError({ message: 'Failed to remove user profile', cause }),
  })

// Clear all auth storage
export const clearAuthStorage = (): Effect.Effect<void, StorageError> =>
  Effect.all([
    removeStoredAccessToken(),
    removeStoredRefreshToken(),
    removeStoredUserEmail(),
    removeStoredUserProfile(),
  ]).pipe(Effect.asVoid)
