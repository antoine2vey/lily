import type { RefreshToken } from '@lily/api/repositories/refresh-token.repository'

export const mockRefreshToken: RefreshToken = {
  id: 'refresh-token-1',
  userId: 'user-1',
  tokenHash: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
  expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days from now
  revokedAt: null,
  createdAt: new Date(),
}

export const mockExpiredRefreshToken: RefreshToken = {
  id: 'refresh-token-2',
  userId: 'user-1',
  tokenHash:
    'expired-hash-abcdef1234567890abcdef1234567890abcdef1234567890abcdef12345678',
  expiresAt: new Date(Date.now() - 24 * 60 * 60 * 1000), // Expired 1 day ago
  revokedAt: null,
  createdAt: new Date(Date.now() - 31 * 24 * 60 * 60 * 1000),
}

export const mockRevokedRefreshToken: RefreshToken = {
  id: 'refresh-token-3',
  userId: 'user-1',
  tokenHash:
    'revoked-hash-abcdef1234567890abcdef1234567890abcdef1234567890abcdef12345678',
  expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // Not expired
  revokedAt: new Date(Date.now() - 60 * 60 * 1000), // Revoked 1 hour ago
  createdAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
}

export const createMockRefreshToken = (
  overrides: Partial<RefreshToken> = {}
): RefreshToken => ({
  id: `refresh-token-${crypto.randomUUID()}`,
  userId: 'user-1',
  tokenHash: crypto.randomUUID().replace(/-/g, '').repeat(2),
  expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
  revokedAt: null,
  createdAt: new Date(),
  ...overrides,
})
