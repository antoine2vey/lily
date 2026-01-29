import { fireEvent, render, screen } from '@testing-library/react-native'

// Mock dependencies
jest.mock('@/contexts/RevenueCatContext', () => ({
  useRevenueCat: jest.fn().mockReturnValue({
    offerings: {
      current: {
        monthly: {
          identifier: '$rc_monthly',
          product: {
            priceString: '$4.99',
            price: 4.99,
          },
        },
        annual: {
          identifier: '$rc_annual',
          product: {
            priceString: '$39.99',
            price: 39.99,
          },
        },
      },
    },
    isLoading: false,
    purchase: jest.fn(),
    restore: jest.fn(),
  }),
}))

jest.mock('@/services/revenuecat', () => ({
  isDevModeEnabled: jest.fn().mockReturnValue(false),
}))

import { SubscriptionPayScreen } from '../SubscriptionPayScreen'

describe('SubscriptionPayScreen', () => {
  it('displays unlock lily pro title', () => {
    render(<SubscriptionPayScreen />)

    expect(screen.getByText('Unlock Lily Pro')).toBeTruthy()
  })

  it('displays premium access badge', () => {
    render(<SubscriptionPayScreen />)

    expect(screen.getByText('Premium Access')).toBeTruthy()
  })

  it('displays premium features', () => {
    render(<SubscriptionPayScreen />)

    expect(screen.getByText('Unlimited AI Chats')).toBeTruthy()
    expect(screen.getByText('Expert Consultations')).toBeTruthy()
    expect(screen.getByText('No Ads')).toBeTruthy()
    expect(screen.getByText('Priority Support')).toBeTruthy()
  })

  it('displays feature descriptions', () => {
    render(<SubscriptionPayScreen />)

    expect(
      screen.getByText('Instant answers for all your plant questions')
    ).toBeTruthy()
    expect(
      screen.getByText('1-on-1 advice from certified botanists')
    ).toBeTruthy()
  })

  it('displays pricing toggle', () => {
    render(<SubscriptionPayScreen />)

    expect(screen.getByText('Monthly')).toBeTruthy()
    expect(screen.getByText('Annual')).toBeTruthy()
  })

  it('shows annual price by default', () => {
    render(<SubscriptionPayScreen />)

    expect(screen.getByText('Subscribe for $39.99/year')).toBeTruthy()
  })

  it('shows monthly price when toggled', () => {
    render(<SubscriptionPayScreen />)

    fireEvent.press(screen.getByText('Monthly'))

    expect(screen.getByText('Subscribe for $4.99/month')).toBeTruthy()
  })

  it('displays terms text', () => {
    render(<SubscriptionPayScreen />)

    expect(
      screen.getByText('Cancel anytime. Terms and conditions apply.')
    ).toBeTruthy()
  })

  it('displays close button', () => {
    render(<SubscriptionPayScreen />)

    expect(screen.getByTestId('close-button')).toBeTruthy()
  })

  it('displays savings percentage for annual', () => {
    render(<SubscriptionPayScreen />)

    // The component calculates savings based on mock prices
    expect(screen.getByText(/SAVE \d+%/)).toBeTruthy()
  })
})
