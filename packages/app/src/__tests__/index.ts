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

export * from './fixtures'
export {
  mockRouter,
  mockSegments,
  mockUseLocalSearchParams,
  resetNavigationMocks,
  setMockSearchParams,
  setMockSegments,
} from './mocks/navigation'
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
export * from './utils/render'
