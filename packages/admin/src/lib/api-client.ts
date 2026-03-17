import { DateTime } from 'effect'
import {
  clearAuth,
  getAccessToken,
  getApiUrl,
  getRefreshToken,
  setAccessToken,
  setRefreshToken,
} from '@/lib/auth'

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

/**
 * Decode the JWT expiry claim without signature verification.
 * Returns the exp timestamp in milliseconds, or null if unreadable.
 */
const getTokenExpiry = (token: string): number | null => {
  try {
    const parts = token.split('.')
    if (parts.length !== 3) return null
    const payload = JSON.parse(atob(parts[1] ?? ''))
    return typeof payload.exp === 'number' ? payload.exp * 1000 : null
  } catch {
    return null
  }
}

/**
 * Returns true if the access token is expired or will expire within 30 seconds.
 */
const isTokenExpired = (token: string): boolean => {
  const exp = getTokenExpiry(token)
  if (exp === null) return false
  return exp < DateTime.toEpochMillis(DateTime.unsafeNow()) + 30_000
}

let refreshPromise: Promise<boolean> | null = null

const tryRefresh = async (): Promise<boolean> => {
  const refreshToken = getRefreshToken()
  if (!refreshToken) return false

  try {
    const baseUrl = getApiUrl()
    const response = await fetch(`${baseUrl}/api/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    })

    if (!response.ok) {
      console.warn('[auth] refresh failed with status', response.status)
      return false
    }

    const data = (await response.json()) as {
      accessToken: string
      refreshToken: string
    }

    if (!data.accessToken || !data.refreshToken) {
      console.warn('[auth] refresh response missing tokens', data)
      return false
    }

    setAccessToken(data.accessToken)
    setRefreshToken(data.refreshToken)
    return true
  } catch (err) {
    console.warn('[auth] refresh request threw', err)
    return false
  }
}

const ensureFreshToken = async (): Promise<string | null> => {
  const token = getAccessToken()

  if (token && !isTokenExpired(token)) {
    return token
  }

  // Token missing or expired — attempt proactive refresh
  if (!refreshPromise) {
    refreshPromise = tryRefresh().finally(() => {
      refreshPromise = null
    })
  }

  const refreshed = await refreshPromise
  return refreshed ? getAccessToken() : null
}

const redirectToLogin = () => {
  clearAuth()
  window.location.href = '/login'
}

const makeRequest = (url: string, token: string | null, options: RequestInit) =>
  fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  })

export const apiRequest = async <T>(
  path: string,
  options: RequestInit = {}
): Promise<T> => {
  const url = `${getApiUrl()}${path}`

  // Proactively refresh if the token is expired before even hitting the API
  const token = await ensureFreshToken()

  if (!token) {
    redirectToLogin()
    throw new ApiError(401, 'Unauthorized')
  }

  let response = await makeRequest(url, token, options)

  // Handle a 401 that slipped through (e.g. clock skew, race condition)
  if (response.status === 401) {
    if (!refreshPromise) {
      refreshPromise = tryRefresh().finally(() => {
        refreshPromise = null
      })
    }
    const refreshed = await refreshPromise

    if (refreshed) {
      response = await makeRequest(url, getAccessToken(), options)
    } else {
      redirectToLogin()
      throw new ApiError(401, 'Unauthorized')
    }
  }

  if (response.status === 403) {
    redirectToLogin()
    throw new ApiError(403, 'Forbidden')
  }

  if (!response.ok) {
    const body = await response.text()
    throw new ApiError(response.status, body)
  }

  if (
    response.status === 204 ||
    response.headers.get('content-length') === '0'
  ) {
    return undefined as T
  }

  return response.json() as Promise<T>
}
