import { render, screen } from '@testing-library/react-native'
import { IdealEnvironment } from '../IdealEnvironment'

describe('IdealEnvironment', () => {
  it('renders ideal environment section', () => {
    render(
      <IdealEnvironment
        sunlight="indirect"
        water="moderate"
        humidity="moderate"
      />
    )

    expect(screen.getByTestId('ideal-environment')).toBeTruthy()
  })

  it('displays section header', () => {
    render(
      <IdealEnvironment
        sunlight="indirect"
        water="moderate"
        humidity="moderate"
      />
    )

    expect(screen.getByText('Ideal Environment')).toBeTruthy()
  })

  it('displays sunlight level', () => {
    render(
      <IdealEnvironment
        sunlight="bright"
        water="moderate"
        humidity="moderate"
      />
    )

    expect(screen.getByText('Sunlight')).toBeTruthy()
    expect(screen.getByText('Bright Light')).toBeTruthy()
  })

  it('displays water level', () => {
    render(
      <IdealEnvironment sunlight="indirect" water="high" humidity="moderate" />
    )

    expect(screen.getByText('Water')).toBeTruthy()
    expect(screen.getByText('High')).toBeTruthy()
  })

  it('displays humidity level', () => {
    render(
      <IdealEnvironment
        sunlight="indirect"
        water="moderate"
        humidity="tropical"
      />
    )

    expect(screen.getByText('Humidity')).toBeTruthy()
    expect(screen.getByText('Tropical')).toBeTruthy()
  })

  it('displays all environment rows', () => {
    render(<IdealEnvironment sunlight="low" water="low" humidity="low" />)

    expect(screen.getByTestId('environment-row-sunlight')).toBeTruthy()
    expect(screen.getByTestId('environment-row-water')).toBeTruthy()
    expect(screen.getByTestId('environment-row-humidity')).toBeTruthy()
  })
})
