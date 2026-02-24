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

    if (!response.ok) return false

    const data = (await response.json()) as {
      accessToken: string
      refreshToken: string
    }
    setAccessToken(data.accessToken)
    setRefreshToken(data.refreshToken)
    return true
  } catch {
    return false
  }
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
  const token = getAccessToken()
  const url = `${getApiUrl()}${path}`

  let response = await makeRequest(url, token, options)

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
      clearAuth()
      window.location.href = '/login'
      throw new ApiError(401, 'Unauthorized')
    }
  }

  if (response.status === 403) {
    clearAuth()
    window.location.href = '/login'
    throw new ApiError(403, 'Forbidden')
  }

  if (!response.ok) {
    const body = await response.text()
    throw new ApiError(response.status, body)
  }

  return response.json() as Promise<T>
}
