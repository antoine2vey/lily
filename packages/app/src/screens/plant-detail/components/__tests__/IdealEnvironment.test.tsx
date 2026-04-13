import { render, screen } from '@testing-library/react-native'
import { IdealEnvironment } from '../IdealEnvironment'

describe('IdealEnvironment', () => {
  it('renders ideal environment section', () => {
    render(
      <IdealEnvironment
        sunlightPercentage={50}
        waterPercentage={50}
        humidityPercentage={50}
      />
    )

    expect(screen.getByTestId('ideal-environment')).toBeTruthy()
  })

  it('displays section header', () => {
    render(
      <IdealEnvironment
        sunlightPercentage={50}
        waterPercentage={50}
        humidityPercentage={50}
      />
    )

    expect(screen.getByText('Ideal Environment')).toBeTruthy()
  })

  it('displays sunlight level', () => {
    render(
      <IdealEnvironment
        sunlightPercentage={50}
        waterPercentage={50}
        humidityPercentage={50}
      />
    )

    expect(screen.getByText('Sunlight')).toBeTruthy()
    expect(screen.getByText('Bright indirect')).toBeTruthy()
  })

  it('displays water level', () => {
    render(
      <IdealEnvironment
        sunlightPercentage={50}
        waterPercentage={80}
        humidityPercentage={50}
      />
    )

    expect(screen.getByText('Water')).toBeTruthy()
    expect(screen.getByText('High')).toBeTruthy()
  })

  it('displays humidity level', () => {
    render(
      <IdealEnvironment
        sunlightPercentage={50}
        waterPercentage={50}
        humidityPercentage={90}
      />
    )

    expect(screen.getByText('Humidity')).toBeTruthy()
    expect(screen.getByText('Tropical')).toBeTruthy()
  })

  it('displays all environment rows', () => {
    render(
      <IdealEnvironment
        sunlightPercentage={10}
        waterPercentage={10}
        humidityPercentage={10}
      />
    )

    expect(screen.getByTestId('environment-row-sunlight')).toBeTruthy()
    expect(screen.getByTestId('environment-row-water')).toBeTruthy()
    expect(screen.getByTestId('environment-row-humidity')).toBeTruthy()
  })
})
