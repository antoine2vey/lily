/**
 * Navigation mocks for expo-router
 */

export const mockRouter = {
  push: jest.fn(),
  replace: jest.fn(),
  back: jest.fn(),
  canGoBack: jest.fn().mockReturnValue(true),
  setParams: jest.fn(),
  navigate: jest.fn(),
  dismiss: jest.fn(),
  dismissAll: jest.fn(),
}

export const mockSegments: string[] = []

export const mockUseLocalSearchParams = jest.fn().mockReturnValue({})

jest.mock('expo-router', () => ({
  useRouter: () => mockRouter,
  useSegments: () => mockSegments,
  useLocalSearchParams: () => mockUseLocalSearchParams(),
  usePathname: jest.fn().mockReturnValue('/'),
  useGlobalSearchParams: jest.fn().mockReturnValue({}),
  Link: ({ children }: { children: React.ReactNode }) => children,
  Stack: {
    Screen: ({ children }: { children?: React.ReactNode }) => children ?? null,
  },
  Tabs: {
    Screen: ({ children }: { children?: React.ReactNode }) => children ?? null,
  },
  Redirect: () => null,
  router: mockRouter,
}))

/**
 * Reset all navigation mocks between tests
 */
export function resetNavigationMocks() {
  mockRouter.push.mockClear()
  mockRouter.replace.mockClear()
  mockRouter.back.mockClear()
  mockRouter.canGoBack.mockClear()
  mockRouter.setParams.mockClear()
  mockRouter.navigate.mockClear()
  mockRouter.dismiss.mockClear()
  mockRouter.dismissAll.mockClear()
  mockUseLocalSearchParams.mockReturnValue({})
  mockSegments.length = 0
}

/**
 * Set the current segments for navigation context
 */
export function setMockSegments(...segments: string[]) {
  mockSegments.length = 0
  mockSegments.push(...segments)
}

/**
 * Set search params for the current route
 */
export function setMockSearchParams(params: Record<string, string>) {
  mockUseLocalSearchParams.mockReturnValue(params)
}
