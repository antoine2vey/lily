import * as SecureStore from 'expo-secure-store'

const ACCESS_TOKEN_KEY = 'lily_access_token'
const REFRESH_TOKEN_KEY = 'lily_refresh_token'
const STREAM_URL = 'http://localhost:3000/api/chat/conversations/c1/stream'
const REFRESH_URL = 'http://localhost:3000/api/auth/refresh'

const mockedSecureStore = SecureStore as jest.Mocked<typeof SecureStore>

type AuthFetchModule = typeof import('@/utils/auth-fetch')

const loadAuthFetchWithFreshRefreshState = (): AuthFetchModule => {
  let loaded: AuthFetchModule | undefined
  jest.isolateModules(() => {
    loaded = require('@/utils/auth-fetch')
  })
  if (!loaded) {
    throw new Error('Failed to load auth-fetch module')
  }
  return loaded
}

const COLD_TRANSFORM_TIMEOUT_MS = 30_000

const authorizationOf = (call: unknown[]): string | null =>
  new Headers((call[1] as RequestInit).headers).get('Authorization')

describe('withAuthRefresh', () => {
  let store: Map<string, string>
  let streamFetch: jest.Mock
  let refreshFetch: jest.Mock
  const originalFetch = global.fetch

  beforeAll(() => {
    loadAuthFetchWithFreshRefreshState()
  }, COLD_TRANSFORM_TIMEOUT_MS)

  beforeEach(() => {
    store = new Map([
      [ACCESS_TOKEN_KEY, 'access-expired'],
      [REFRESH_TOKEN_KEY, 'refresh-old'],
    ])
    mockedSecureStore.getItemAsync.mockImplementation(async (key: string) =>
      store.has(key) ? (store.get(key) as string) : null
    )
    mockedSecureStore.setItemAsync.mockImplementation(
      async (key: string, value: string) => {
        store.set(key, value)
      }
    )
    mockedSecureStore.deleteItemAsync.mockImplementation(
      async (key: string) => {
        store.delete(key)
      }
    )

    streamFetch = jest.fn(async (_url: string, init: RequestInit) =>
      new Headers(init.headers).get('Authorization') === 'Bearer access-new'
        ? { ok: true, status: 200 }
        : { ok: false, status: 401 }
    )
    refreshFetch = jest.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        accessToken: 'access-new',
        refreshToken: 'refresh-new',
      }),
    }))
    global.fetch = refreshFetch as unknown as typeof fetch
  })

  afterEach(() => {
    global.fetch = originalFetch
    jest.clearAllMocks()
  })

  it('refreshes the token and replays the request once after a 401', async () => {
    const { withAuthRefresh } = loadAuthFetchWithFreshRefreshState()
    const authFetch = withAuthRefresh(streamFetch as unknown as typeof fetch)

    const response = await authFetch(STREAM_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{"message":"hello"}',
    })

    expect(response.status).toBe(200)
    expect(streamFetch.mock.calls.map(authorizationOf)).toEqual([
      'Bearer access-expired',
      'Bearer access-new',
    ])
    expect(streamFetch.mock.calls[1]?.[1]).toMatchObject({
      method: 'POST',
      body: '{"message":"hello"}',
    })
    expect(refreshFetch).toHaveBeenCalledTimes(1)
    expect(refreshFetch.mock.calls[0]?.[0]).toBe(REFRESH_URL)
    expect(store.get(ACCESS_TOKEN_KEY)).toBe('access-new')
  })

  it('sends the request once when the token is accepted', async () => {
    store.set(ACCESS_TOKEN_KEY, 'access-new')
    const { withAuthRefresh } = loadAuthFetchWithFreshRefreshState()
    const authFetch = withAuthRefresh(streamFetch as unknown as typeof fetch)

    const response = await authFetch(STREAM_URL, { method: 'POST' })

    expect(response.status).toBe(200)
    expect(streamFetch).toHaveBeenCalledTimes(1)
    expect(refreshFetch).not.toHaveBeenCalled()
  })

  it('returns the 401 without replaying when the refresh is rejected', async () => {
    refreshFetch.mockImplementation(async () => ({
      ok: false,
      status: 401,
      json: async () => ({}),
    }))
    const { withAuthRefresh } = loadAuthFetchWithFreshRefreshState()
    const authFetch = withAuthRefresh(streamFetch as unknown as typeof fetch)

    const response = await authFetch(STREAM_URL, { method: 'POST' })

    expect(response.status).toBe(401)
    expect(streamFetch).toHaveBeenCalledTimes(1)
  })
})
