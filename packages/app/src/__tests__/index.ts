/**
 * Test utilities index
 *
 * Re-exports all test utilities for easy importing in test files.
 *
 * Usage:
 * ```ts
 * import { render, mockPlants, mockUsers, createTestQueryClient } from '@/__tests__'
 * ```
 */

// Re-export fixtures
export * from './fixtures'
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
