import { render, screen } from '@testing-library/react-native'
import { OnboardingSlide } from '../OnboardingSlide'

describe('OnboardingSlide', () => {
  it('renders slide title', () => {
    render(
      <OnboardingSlide
        icon="eco"
        title="Welcome to Lily"
        description="Your personal plant care assistant"
      />
    )

    expect(screen.getByText('Welcome to Lily')).toBeTruthy()
  })

  it('renders slide description', () => {
    render(
      <OnboardingSlide
        icon="eco"
        title="Welcome to Lily"
        description="Your personal plant care assistant"
      />
    )

    expect(screen.getByText('Your personal plant care assistant')).toBeTruthy()
  })

  it('renders with different icons', () => {
    const { rerender } = render(
      <OnboardingSlide
        icon="water-drop"
        title="Track Watering"
        description="Never forget to water your plants"
      />
    )

    expect(screen.getByText('Track Watering')).toBeTruthy()

    rerender(
      <OnboardingSlide
        icon="notifications"
        title="Get Reminders"
        description="Stay on top of plant care"
      />
    )

    expect(screen.getByText('Get Reminders')).toBeTruthy()
  })

  it('renders with custom icon color', () => {
    render(
      <OnboardingSlide
        icon="eco"
        title="Custom Color"
        description="Slide with custom icon color"
        iconColor="#FF0000"
      />
    )

    expect(screen.getByText('Custom Color')).toBeTruthy()
  })
})
