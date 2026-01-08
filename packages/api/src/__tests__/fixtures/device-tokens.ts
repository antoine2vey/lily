import type { DeviceToken } from '@lily/shared/device-token'

export const mockDeviceTokens: DeviceToken[] = [
  {
    id: 'token-1',
    token: 'expo-push-token-123',
    platform: 'ios',
    isActive: true,
    userId: 'user-1',
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
  },
  {
    id: 'token-2',
    token: 'expo-push-token-456',
    platform: 'android',
    isActive: true,
    userId: 'user-1',
    createdAt: new Date('2024-01-02'),
    updatedAt: new Date('2024-01-02'),
  },
  {
    id: 'token-3',
    token: 'expo-push-token-789',
    platform: 'ios',
    isActive: false,
    userId: 'user-2',
    createdAt: new Date('2024-01-03'),
    updatedAt: new Date('2024-01-03'),
  },
]

export const createTestDeviceToken = (
  overrides: Partial<DeviceToken> = {}
): DeviceToken => ({
  id: `token-${crypto.randomUUID()}`,
  token: `expo-push-token-${crypto.randomUUID()}`,
  platform: 'ios',
  isActive: true,
  userId: 'user-1',
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
})
