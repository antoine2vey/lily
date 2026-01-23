import { render, screen } from '@testing-library/react-native'
import { PlantHeader } from '../PlantHeader'

describe('PlantHeader', () => {
  it('renders plant name', () => {
    render(
      <PlantHeader
        plant={{
          name: 'Monstera Deliciosa',
          species: 'Monstera',
          health: 'healthy',
        }}
      />
    )

    expect(screen.getByTestId('plant-name')).toHaveTextContent(
      'Monstera Deliciosa'
    )
  })

  it('renders species when provided', () => {
    render(
      <PlantHeader
        plant={{
          name: 'Monstera',
          species: 'Monstera deliciosa',
          health: 'healthy',
        }}
      />
    )

    expect(screen.getByTestId('plant-species')).toHaveTextContent(
      'Monstera deliciosa'
    )
  })

  it('renders category and species together', () => {
    render(
      <PlantHeader
        plant={{
          name: 'Monstera',
          category: 'Tropical',
          species: 'Monstera deliciosa',
          health: 'healthy',
        }}
      />
    )

    expect(screen.getByTestId('plant-species')).toHaveTextContent(
      'Tropical • Monstera deliciosa'
    )
  })

  it('displays healthy badge', () => {
    render(
      <PlantHeader
        plant={{
          name: 'Monstera',
          health: 'healthy',
        }}
      />
    )

    expect(screen.getByText('HEALTHY')).toBeTruthy()
  })

  it('displays attention badge for attention status', () => {
    render(
      <PlantHeader
        plant={{
          name: 'Monstera',
          health: 'attention',
        }}
      />
    )

    expect(screen.getByText('NEEDS ATTENTION')).toBeTruthy()
  })

  it('displays critical badge for critical status', () => {
    render(
      <PlantHeader
        plant={{
          name: 'Monstera',
          health: 'critical',
        }}
      />
    )

    expect(screen.getByText('CRITICAL')).toBeTruthy()
  })
})
