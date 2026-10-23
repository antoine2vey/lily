import { fireEvent, render, screen } from '@testing-library/react-native'

jest.mock('expo-router', () => ({
  router: { back: jest.fn(), push: jest.fn() },
}))

jest.mock('@/hooks/useMyDelegations', () => ({
  useMyDelegations: jest.fn(() => ({
    data: { items: [] },
    isLoading: false,
    isRefetching: false,
    refetch: jest.fn(),
  })),
}))

import { DelegationListScreen } from '../DelegationListScreen'

describe('DelegationListScreen empty state', () => {
  it.each([
    ['All', 'No delegations yet', true],
    ['My Plants', 'No plants delegated', true],
    ['Caring For', 'Not caring for any plants', false],
  ])('the %s filter shows "%s"', (chip, title, offersCreate) => {
    render(<DelegationListScreen />)

    fireEvent.press(screen.getByText(chip))

    expect(screen.getByTestId('mascot-sendEnvelope')).toBeTruthy()
    expect(screen.getByText(title)).toBeTruthy()
    expect(screen.queryByText('Create Delegation') !== null).toBe(offersCreate)
  })
})
