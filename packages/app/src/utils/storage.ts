import { Effect, Option } from 'effect'
import * as SecureStore from 'expo-secure-store'

const ACCESS_TOKEN_KEY = 'lily_access_token'
const REFRESH_TOKEN_KEY = 'lily_refresh_token'
const USER_EMAIL_KEY = 'lily_user_email'

// Access Token
export const storeAccessToken = (token: string): Effect.Effect<void, Error> =>
  Effect.tryPromise({
    try: () => SecureStore.setItemAsync(ACCESS_TOKEN_KEY, token),
    catch: (error) =>
      new Error(`Failed to store access token: ${String(error)}`),
  })

export const getStoredAccessToken = (): Effect.Effect<
  Option.Option<string>,
  Error
> =>
  Effect.tryPromise({
    try: async () => {
      const token = await SecureStore.getItemAsync(ACCESS_TOKEN_KEY)
      return Option.fromNullable(token)
    },
    catch: (error) => new Error(`Failed to get access token: ${String(error)}`),
  })

export const removeStoredAccessToken = (): Effect.Effect<void, Error> =>
  Effect.tryPromise({
    try: () => SecureStore.deleteItemAsync(ACCESS_TOKEN_KEY),
    catch: (error) =>
      new Error(`Failed to remove access token: ${String(error)}`),
  })

// Refresh Token
export const storeRefreshToken = (token: string): Effect.Effect<void, Error> =>
  Effect.tryPromise({
    try: () => SecureStore.setItemAsync(REFRESH_TOKEN_KEY, token),
    catch: (error) =>
      new Error(`Failed to store refresh token: ${String(error)}`),
  })

export const getStoredRefreshToken = (): Effect.Effect<
  Option.Option<string>,
  Error
> =>
  Effect.tryPromise({
    try: async () => {
      const token = await SecureStore.getItemAsync(REFRESH_TOKEN_KEY)
      return Option.fromNullable(token)
    },
    catch: (error) =>
      new Error(`Failed to get refresh token: ${String(error)}`),
  })

export const removeStoredRefreshToken = (): Effect.Effect<void, Error> =>
  Effect.tryPromise({
    try: () => SecureStore.deleteItemAsync(REFRESH_TOKEN_KEY),
    catch: (error) =>
      new Error(`Failed to remove refresh token: ${String(error)}`),
  })

// User Email
export const storeUserEmail = (email: string): Effect.Effect<void, Error> =>
  Effect.tryPromise({
    try: () => SecureStore.setItemAsync(USER_EMAIL_KEY, email),
    catch: (error) => new Error(`Failed to store email: ${String(error)}`),
  })

export const getStoredUserEmail = (): Effect.Effect<
  Option.Option<string>,
  Error
> =>
  Effect.tryPromise({
    try: async () => {
      const email = await SecureStore.getItemAsync(USER_EMAIL_KEY)
      return Option.fromNullable(email)
    },
    catch: (error) => new Error(`Failed to get email: ${String(error)}`),
  })

export const removeStoredUserEmail = (): Effect.Effect<void, Error> =>
  Effect.tryPromise({
    try: () => SecureStore.deleteItemAsync(USER_EMAIL_KEY),
    catch: (error) => new Error(`Failed to remove email: ${String(error)}`),
  })

// Clear all auth storage
export const clearAuthStorage = (): Effect.Effect<void, Error> =>
  Effect.all([
    removeStoredAccessToken(),
    removeStoredRefreshToken(),
    removeStoredUserEmail(),
  ]).pipe(Effect.map(() => undefined))

// Legacy aliases for backwards compatibility
export const storeToken = storeAccessToken
export const getStoredToken = getStoredAccessToken
export const removeStoredToken = removeStoredAccessToken
