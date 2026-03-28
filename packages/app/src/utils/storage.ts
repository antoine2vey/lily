import { Effect, Option, Schema } from 'effect'
import * as SecureStore from 'expo-secure-store'

class StorageError extends Schema.TaggedError<StorageError>()('StorageError', {
  message: Schema.String,
  cause: Schema.optional(Schema.Unknown),
}) {}

const ACCESS_TOKEN_KEY = 'lily_access_token'
const REFRESH_TOKEN_KEY = 'lily_refresh_token'
const USER_EMAIL_KEY = 'lily_user_email'

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

// Clear all auth storage
export const clearAuthStorage = (): Effect.Effect<void, StorageError> =>
  Effect.all([
    removeStoredAccessToken(),
    removeStoredRefreshToken(),
    removeStoredUserEmail(),
  ]).pipe(Effect.asVoid)
