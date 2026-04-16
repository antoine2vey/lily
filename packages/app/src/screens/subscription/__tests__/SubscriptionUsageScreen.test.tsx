import { render, screen } from '@testing-library/react-native'

// Mock dependencies
jest.mock('@/hooks/useSubscriptionUsage', () => ({
  useSubscriptionUsage: jest.fn(),
}))

jest.mock('@/contexts/RevenueCatContext', () => ({
  useRevenueCat: jest.fn().mockReturnValue({
    offerings: null,
    isLoading: false,
    purchase: jest.fn(),
    restore: jest.fn(),
  }),
}))

jest.mock('@/services/revenuecat', () => ({
  isDevModeEnabled: jest.fn().mockReturnValue(false),
}))

jest.mock('@/hooks/useRedeemGiftCode', () => ({
  useRedeemGiftCode: jest.fn().mockReturnValue({
    mutate: jest.fn(),
    isPending: false,
    data: undefined,
    apiError: undefined,
    isApiError: false,
    reset: jest.fn(),
  }),
}))

import { useSubscriptionUsage } from '@/hooks/useSubscriptionUsage'
import { SubscriptionUsageScreen } from '../SubscriptionUsageScreen'

const mockedUseSubscriptionUsage = useSubscriptionUsage as jest.Mock

// Helper to create properly structured mock data
const createMockUsageData = (overrides = {}) => ({
  planName: 'Free',
  status: 'active' as const,
  isPremium: false,
  usage: [
    { type: 'ai_chats' as const, current: 5, max: 10 },
    { type: 'plant_ids' as const, current: 3, max: 5 },
    { type: 'card_scans' as const, current: 2, max: 5 },
  ],
  ...overrides,
})

describe('SubscriptionUsageScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('shows loading state when data is loading', () => {
    mockedUseSubscriptionUsage.mockReturnValue({
      data: undefined,
      isLoading: true,
    })

    render(<SubscriptionUsageScreen />)

    // Screen returns null during initial loading (before skeleton delay)
    expect(screen.queryByText('Subscription')).toBeNull()
  })

  it('displays subscription title', () => {
    mockedUseSubscriptionUsage.mockReturnValue({
      data: createMockUsageData(),
      isLoading: false,
    })

    render(<SubscriptionUsageScreen />)

    expect(screen.getByText('Subscription')).toBeTruthy()
  })

  it('displays AI chats usage', () => {
    mockedUseSubscriptionUsage.mockReturnValue({
      data: createMockUsageData(),
      isLoading: false,
    })

    render(<SubscriptionUsageScreen />)

    expect(screen.getByText('AI Chats')).toBeTruthy()
  })

  it('displays plant IDs usage', () => {
    mockedUseSubscriptionUsage.mockReturnValue({
      data: createMockUsageData(),
      isLoading: false,
    })

    render(<SubscriptionUsageScreen />)

    expect(screen.getByText('Plant IDs')).toBeTruthy()
  })

  it('displays card scans usage', () => {
    mockedUseSubscriptionUsage.mockReturnValue({
      data: createMockUsageData(),
      isLoading: false,
    })

    render(<SubscriptionUsageScreen />)

    expect(screen.getByText('Card Scans')).toBeTruthy()
  })

  it('displays upgrade section for free users', () => {
    mockedUseSubscriptionUsage.mockReturnValue({
      data: createMockUsageData({ isPremium: false }),
      isLoading: false,
    })

    render(<SubscriptionUsageScreen />)

    expect(screen.getByText('Upgrade to Lily Pro')).toBeTruthy()
  })

  it('hides upgrade section for premium users', () => {
    mockedUseSubscriptionUsage.mockReturnValue({
      data: createMockUsageData({ isPremium: true, planName: 'Premium' }),
      isLoading: false,
    })

    render(<SubscriptionUsageScreen />)

    expect(screen.queryByText('Upgrade to Lily Pro')).toBeNull()
  })

  it('displays restore purchases option', () => {
    mockedUseSubscriptionUsage.mockReturnValue({
      data: createMockUsageData(),
      isLoading: false,
    })

    render(<SubscriptionUsageScreen />)

    expect(screen.getByText('Restore Purchase')).toBeTruthy()
  })
})
