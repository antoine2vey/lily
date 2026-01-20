import { render, screen } from '@testing-library/react-native'
import { IdealEnvironment } from '../IdealEnvironment'

describe('IdealEnvironment', () => {
  const defaultProps = {
    sunlight: 'indirect' as const,
    water: 'moderate' as const,
    humidity: 'high' as const,
  }

  it('renders section header', () => {
    render(<IdealEnvironment {...defaultProps} />)
    expect(screen.getByText('Ideal Environment')).toBeTruthy()
  })

  it('renders sunlight row with value', () => {
    render(<IdealEnvironment {...defaultProps} />)
    expect(screen.getByTestId('environment-row-sunlight')).toBeTruthy()
    expect(screen.getByText('Sunlight')).toBeTruthy()
    expect(screen.getByText('Indirect Bright')).toBeTruthy()
  })

  it('renders water row with value', () => {
    render(<IdealEnvironment {...defaultProps} />)
    expect(screen.getByTestId('environment-row-water')).toBeTruthy()
    expect(screen.getByText('Water')).toBeTruthy()
    expect(screen.getByText('Moderate')).toBeTruthy()
  })

  it('renders humidity row with value', () => {
    render(<IdealEnvironment {...defaultProps} />)
    expect(screen.getByTestId('environment-row-humidity')).toBeTruthy()
    expect(screen.getByText('Humidity')).toBeTruthy()
    expect(screen.getByText('High')).toBeTruthy()
  })

  it('shows correct labels for each sunlight level', () => {
    const { rerender } = render(
      <IdealEnvironment {...defaultProps} sunlight="low" />
    )
    expect(screen.getByText('Low Light')).toBeTruthy()

    rerender(<IdealEnvironment {...defaultProps} sunlight="bright" />)
    expect(screen.getByText('Bright Light')).toBeTruthy()

    rerender(<IdealEnvironment {...defaultProps} sunlight="direct" />)
    expect(screen.getByText('Direct Sun')).toBeTruthy()
  })

  it('shows correct labels for tropical humidity', () => {
    render(<IdealEnvironment {...defaultProps} humidity="tropical" />)
    expect(screen.getByText('Tropical')).toBeTruthy()
  })
})
