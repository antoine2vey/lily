import * as SecureStore from 'expo-secure-store'

/**
 * Regression tests for the token refresh coordination in @/utils/client.
 *
 * The server rotates the refresh token on every use, so a duplicate or
 * concurrent refresh presenting an already-rotated token gets rejected and
 * used to hard-logout users who reopened the app after the access token
 * expired (multiple queries 401 at once → refresh storm → race → logout).
 */

const ACCESS_TOKEN_KEY = 'lily_access_token'
const REFRESH_TOKEN_KEY = 'lily_refresh_token'

const mockedSecureStore = SecureStore as jest.Mocked<typeof SecureStore>

type ClientModule = typeof import('@/utils/client')

// client.tsx keeps module-level refresh state (single-flight + reuse
// window), so each test needs a fresh copy of the module
const loadClient = (): ClientModule => {
  let client: ClientModule | undefined
  jest.isolateModules(() => {
    client = require('@/utils/client')
  })
  if (!client) {
    throw new Error('Failed to load client module')
  }
  return client
}

const jsonResponse = (body: Record<string, string>) => ({
  ok: true,
  status: 200,
  json: async () => body,
})

const errorResponse = (status: number) => ({
  ok: false,
  status,
  json: async () => ({}),
})

describe('refreshAccessTokenAsync', () => {
  let store: Map<string, string>
  let fetchMock: jest.Mock
  const originalFetch = global.fetch

  beforeEach(() => {
    store = new Map([
      [ACCESS_TOKEN_KEY, 'access-old'],
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

    fetchMock = jest.fn()
    global.fetch = fetchMock as unknown as typeof fetch
  })

  afterEach(() => {
    global.fetch = originalFetch
    jest.clearAllMocks()
  })

  it('collapses concurrent refresh calls into a single request', async () => {
    const { refreshAccessTokenAsync } = loadClient()

    fetchMock.mockImplementation(
      () =>
        new Promise((resolve) =>
          setTimeout(
            () =>
              resolve(
                jsonResponse({
                  accessToken: 'access-new',
                  refreshToken: 'refresh-new',
                })
              ),
            20
          )
        )
    )

    const [first, second, third] = await Promise.all([
      refreshAccessTokenAsync(),
      refreshAccessTokenAsync(),
      refreshAccessTokenAsync(),
    ])

    expect(first).toBe('access-new')
    expect(second).toBe('access-new')
    expect(third).toBe('access-new')
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(store.get(REFRESH_TOKEN_KEY)).toBe('refresh-new')
  })

  it('reuses a just-completed refresh instead of rotating again', async () => {
    const { refreshAccessTokenAsync } = loadClient()

    fetchMock.mockResolvedValue(
      jsonResponse({
        accessToken: 'access-new',
        refreshToken: 'refresh-new',
      })
    )

    const first = await refreshAccessTokenAsync()
    // A request that was already in flight with the old access token 401s
    // after the refresh finished and asks for another refresh
    const second = await refreshAccessTokenAsync()

    expect(first).toBe('access-new')
    expect(second).toBe('access-new')
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('recovers instead of clearing tokens when a rejected refresh lost a rotation race', async () => {
    const { refreshAccessTokenAsync } = loadClient()

    // Server rejects our (stale) token; by the time we handle the 401,
    // storage already holds the pair a winning refresh stored
    fetchMock.mockImplementation(async () => {
      store.set(ACCESS_TOKEN_KEY, 'access-winner')
      store.set(REFRESH_TOKEN_KEY, 'refresh-winner')
      return errorResponse(401)
    })

    const result = await refreshAccessTokenAsync()

    expect(result).toBe('access-winner')
    expect(mockedSecureStore.deleteItemAsync).not.toHaveBeenCalled()
    expect(store.get(REFRESH_TOKEN_KEY)).toBe('refresh-winner')
  })

  it('clears tokens when the server genuinely rejects the current refresh token', async () => {
    const { refreshAccessTokenAsync } = loadClient()

    fetchMock.mockResolvedValue(errorResponse(401))

    const result = await refreshAccessTokenAsync()

    expect(result).toBeNull()
    expect(store.has(ACCESS_TOKEN_KEY)).toBe(false)
    expect(store.has(REFRESH_TOKEN_KEY)).toBe(false)
  })

  it('keeps tokens on throttling (429) and server errors', async () => {
    const { refreshAccessTokenAsync } = loadClient()

    fetchMock.mockResolvedValue(errorResponse(429))

    const result = await refreshAccessTokenAsync()

    expect(result).toBeNull()
    expect(store.get(ACCESS_TOKEN_KEY)).toBe('access-old')
    expect(store.get(REFRESH_TOKEN_KEY)).toBe('refresh-old')
  })
})
