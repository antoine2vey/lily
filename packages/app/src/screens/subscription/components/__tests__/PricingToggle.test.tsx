import { fireEvent, render, screen } from '@testing-library/react-native'
import { PricingToggle } from '../PricingToggle'

describe('PricingToggle', () => {
  const mockOnSelect = jest.fn()

  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('renders monthly option', () => {
    render(
      <PricingToggle
        selected="monthly"
        onSelect={mockOnSelect}
        monthlyPrice="$9.99"
        annualPrice="$79.99"
      />
    )

    expect(screen.getByText('Monthly')).toBeTruthy()
    expect(screen.getByText('$9.99')).toBeTruthy()
  })

  it('renders annual option', () => {
    render(
      <PricingToggle
        selected="monthly"
        onSelect={mockOnSelect}
        monthlyPrice="$9.99"
        annualPrice="$79.99"
      />
    )

    expect(screen.getByText('Annual')).toBeTruthy()
    expect(screen.getByText('$79.99')).toBeTruthy()
  })

  it('shows savings badge when provided', () => {
    render(
      <PricingToggle
        selected="monthly"
        onSelect={mockOnSelect}
        monthlyPrice="$9.99"
        annualPrice="$79.99"
        savingsPercent={33}
      />
    )

    expect(screen.getByText(/SAVE 33%/i)).toBeTruthy()
  })

  it('calls onSelect with monthly when monthly is pressed', () => {
    render(
      <PricingToggle
        selected="annual"
        onSelect={mockOnSelect}
        monthlyPrice="$9.99"
        annualPrice="$79.99"
      />
    )

    fireEvent.press(screen.getByText('Monthly'))

    expect(mockOnSelect).toHaveBeenCalledWith('monthly')
  })

  it('calls onSelect with annual when annual is pressed', () => {
    render(
      <PricingToggle
        selected="monthly"
        onSelect={mockOnSelect}
        monthlyPrice="$9.99"
        annualPrice="$79.99"
      />
    )

    fireEvent.press(screen.getByText('Annual'))

    expect(mockOnSelect).toHaveBeenCalledWith('annual')
  })

  it('shows per year text for annual option', () => {
    render(
      <PricingToggle
        selected="annual"
        onSelect={mockOnSelect}
        monthlyPrice="$9.99"
        annualPrice="$79.99"
      />
    )

    // Text changed from "per year" to "/yr (billed annually)"
    expect(screen.getByText(/\/yr.*billed annually/i)).toBeTruthy()
  })
})
