import type { JWTPayload } from '@lily/api/services/jwt/service'

export const mockJWTPayload: JWTPayload = {
  sub: 'user-1',
  email: 'test@example.com',
  role: 'user',
  status: 'active',
}

export const mockAdminJWTPayload: JWTPayload = {
  sub: 'admin-1',
  email: 'admin@example.com',
  role: 'admin',
  status: 'active',
}

export const mockSuspendedUserPayload: JWTPayload = {
  sub: 'user-suspended',
  email: 'suspended@example.com',
  role: 'user',
  status: 'suspended',
}

export const mockBannedUserPayload: JWTPayload = {
  sub: 'user-banned',
  email: 'banned@example.com',
  role: 'user',
  status: 'banned',
}

// Mock tokens for testing (not real JWTs, just for mock purposes)
export const mockAccessToken = 'mock-access-token-abc123'
export const mockRefreshToken =
  'a1b2c3d4-e5f6-7890-abcd-ef1234567890a1b2c3d4-e5f6-7890-abcd-ef1234567890'
export const mockRefreshTokenHash =
  'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'
