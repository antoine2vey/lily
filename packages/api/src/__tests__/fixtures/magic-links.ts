import type { MagicLink } from '@lily/api/repositories/magic-link.repository'

export const mockMagicLink: MagicLink = {
  id: 'magic-link-1',
  email: 'test@example.com',
  token: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
  expiresAt: new Date(Date.now() + 10 * 60 * 1000), // 10 minutes from now
  usedAt: null,
  createdAt: new Date(),
}

export const mockExpiredMagicLink: MagicLink = {
  id: 'magic-link-2',
  email: 'expired@example.com',
  token: 'expired-token-1234-5678-9012-345678901234',
  expiresAt: new Date(Date.now() - 10 * 60 * 1000), // 10 minutes ago
  usedAt: null,
  createdAt: new Date(Date.now() - 20 * 60 * 1000),
}

export const mockUsedMagicLink: MagicLink = {
  id: 'magic-link-3',
  email: 'used@example.com',
  token: 'used-token-1234-5678-9012-345678901234',
  expiresAt: new Date(Date.now() + 10 * 60 * 1000), // Not expired
  usedAt: new Date(Date.now() - 5 * 60 * 1000), // Used 5 minutes ago
  createdAt: new Date(Date.now() - 10 * 60 * 1000),
}

export const createMockMagicLink = (
  overrides: Partial<MagicLink> = {}
): MagicLink => ({
  id: `magic-link-${crypto.randomUUID()}`,
  email: 'test@example.com',
  token: crypto.randomUUID(),
  expiresAt: new Date(Date.now() + 10 * 60 * 1000),
  usedAt: null,
  createdAt: new Date(),
  ...overrides,
})
