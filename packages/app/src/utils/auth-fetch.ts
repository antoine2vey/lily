import * as SecureStore from 'expo-secure-store'
import { ACCESS_TOKEN_KEY, refreshAccessTokenAsync } from '@/utils/client'

type Fetch = typeof globalThis.fetch

/**
 * Authenticates a fetch that bypasses the typed API client (streaming
 * endpoints): sends the stored access token and, on a 401, refreshes it
 * through the client's single-flight refresh and replays the request once.
 */
export const withAuthRefresh =
  (baseFetch: Fetch): Fetch =>
  async (input, init) => {
    const send = (token: string | null) => {
      const headers = new Headers(init?.headers)
      if (token !== null) headers.set('Authorization', `Bearer ${token}`)
      return baseFetch(input, { ...init, headers })
    }

    const response = await send(
      await SecureStore.getItemAsync(ACCESS_TOKEN_KEY)
    )
    if (response.status !== 401) return response

    const refreshed = await refreshAccessTokenAsync()
    return refreshed === null ? response : send(refreshed)
  }
