const ACCESS_TOKEN_KEY = 'lily_admin_access_token'
const REFRESH_TOKEN_KEY = 'lily_admin_refresh_token'
const API_URL_KEY = 'lily_admin_api_url'
const DEFAULT_API_URL = 'http://localhost:3000'

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
  localStorage.getItem(API_URL_KEY) ?? DEFAULT_API_URL

export const setApiUrl = (url: string): void => {
  localStorage.setItem(API_URL_KEY, url)
}
