import { render, screen } from '@testing-library/react-native'
import { PlantHeader } from '../PlantHeader'

describe('PlantHeader', () => {
  const defaultPlant = {
    name: 'Monstera Deliciosa',
    species: 'Monstera deliciosa',
    category: 'Tropical',
    health: 'healthy' as const,
  }

  it('renders plant name', () => {
    render(<PlantHeader plant={defaultPlant} />)
    expect(screen.getByText('Monstera Deliciosa')).toBeTruthy()
  })

  it('renders health badge', () => {
    render(<PlantHeader plant={defaultPlant} />)
    expect(screen.getByText('HEALTHY')).toBeTruthy()
  })

  it('renders species when provided', () => {
    render(<PlantHeader plant={defaultPlant} />)
    expect(screen.getByText('Tropical • Monstera deliciosa')).toBeTruthy()
  })

  it('renders category with species', () => {
    render(<PlantHeader plant={defaultPlant} />)
    expect(screen.getByTestId('plant-species')).toBeTruthy()
  })

  it('uses success badge for healthy', () => {
    const { toJSON } = render(
      <PlantHeader plant={{ ...defaultPlant, health: 'healthy' }} />
    )
    expect(toJSON()).toBeTruthy()
    expect(screen.getByText('HEALTHY')).toBeTruthy()
  })

  it('uses warning badge for attention', () => {
    const { toJSON } = render(
      <PlantHeader plant={{ ...defaultPlant, health: 'attention' }} />
    )
    expect(toJSON()).toBeTruthy()
    expect(screen.getByText('NEEDS ATTENTION')).toBeTruthy()
  })

  it('uses error badge for critical', () => {
    const { toJSON } = render(
      <PlantHeader plant={{ ...defaultPlant, health: 'critical' }} />
    )
    expect(toJSON()).toBeTruthy()
    expect(screen.getByText('CRITICAL')).toBeTruthy()
  })

  it('renders only category when species is not provided', () => {
    render(
      <PlantHeader
        plant={{ name: 'My Plant', category: 'Indoor', health: 'healthy' }}
      />
    )
    expect(screen.getByText('Indoor')).toBeTruthy()
  })

  it('renders only species when category is not provided', () => {
    render(
      <PlantHeader
        plant={{
          name: 'My Plant',
          species: 'Some species',
          health: 'healthy',
        }}
      />
    )
    expect(screen.getByText('Some species')).toBeTruthy()
  })

  it('does not render species line when neither provided', () => {
    render(<PlantHeader plant={{ name: 'My Plant', health: 'healthy' }} />)
    expect(screen.queryByTestId('plant-species')).toBeNull()
  })
})
