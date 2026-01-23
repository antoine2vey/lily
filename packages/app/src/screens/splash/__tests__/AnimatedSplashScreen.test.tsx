import { render, screen } from '@testing-library/react-native'
import { AnimatedSplashScreen } from '../AnimatedSplashScreen'

describe('AnimatedSplashScreen', () => {
  const mockOnAnimationEnd = jest.fn()

  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('renders splash screen', () => {
    const { toJSON } = render(
      <AnimatedSplashScreen onAnimationEnd={mockOnAnimationEnd} />
    )
    expect(toJSON()).toBeTruthy()
  })

  it('displays app name', () => {
    render(<AnimatedSplashScreen onAnimationEnd={mockOnAnimationEnd} />)

    expect(screen.getByText('Lily')).toBeTruthy()
  })
})
