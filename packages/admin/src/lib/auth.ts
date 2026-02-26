const ACCESS_TOKEN_KEY = 'lily_admin_access_token'
const REFRESH_TOKEN_KEY = 'lily_admin_refresh_token'

export const getAccessToken = (): string | null =>
  localStorage.getItem(ACCESS_TOKEN_KEY)

export const setAccessToken = (token: string): void => {
  localStorage.setItem(ACCESS_TOKEN_KEY, token)
}

export const getRefreshToken = (): string | null =>
  localStorage.getItem(REFRESH_TOKEN_KEY)

export const setRefreshToken = (token: string): void => {
  localStorage.setItem(REFRESH_TOKEN_KEY, token)
}

export const clearAuth = (): void => {
  localStorage.removeItem(ACCESS_TOKEN_KEY)
  localStorage.removeItem(REFRESH_TOKEN_KEY)
}

export const getApiUrl = (): string =>
  import.meta.env.VITE_API_URL ?? 'http://localhost:3000'
