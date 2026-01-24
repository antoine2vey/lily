/**
 * Test utilities index
 *
 * Re-exports all test utilities for easy importing in test files.
 *
 * Usage:
 * ```ts
 * import { render, mockPlants, mockUsers, createTestQueryClient } from 'src/__tests__'
 * ```
 */

// Re-export navigation mocks
export {
  mockRouter,
  mockSegments,
  mockUseLocalSearchParams,
  resetNavigationMocks,
  setMockSearchParams,
  setMockSegments,
} from './mocks/navigation'
// Re-export mock providers
export {
  defaultMockUser,
  MockAuthProvider,
  mockAuthLogin,
  mockAuthLogout,
  mockAuthRefreshUser,
  mockAuthSetUsername,
  mockAuthVerifyMagicLink,
  resetProviderMocks,
  useMockAuth,
} from './mocks/providers'
export * from './utils/query-helpers'
// Re-export render utilities
export * from './utils/render'

// Re-export shared fixtures from @lily/api
// These are imported in test files directly from @lily/api/__tests__/fixtures/*
// to avoid duplication. See individual fixture files for available exports:
//
// Plants: mockPlants, mockPlantPhotos, createTestPlant
// Users: mockUsers, mockAdminUser, mockSuspendedUser, createTestUser
// Care Tasks: mockPlantsForCareTasks, mockPlantsNoCare
// Care Logs: mockCareLogs, createTestCareLog
// Achievements: mockUserAchievements, createTestUserAchievement
// Notifications: mockNotifications, createTestNotification
// Chat: mockChatMessages, createTestChatMessage
// Device Tokens: mockDeviceTokens, createTestDeviceToken
