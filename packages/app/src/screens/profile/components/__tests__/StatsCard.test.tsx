import { render, screen } from '@testing-library/react-native'
import { StatsCard } from '../StatsCard'

describe('StatsCard', () => {
  it('renders all stat items', () => {
    const stats = [
      { value: 12, label: 'Plants' },
      { value: 45, label: 'Care Actions' },
      { value: 3, label: 'Achievements' },
    ]

    render(<StatsCard stats={stats} />)

    expect(screen.getByText('12')).toBeTruthy()
    expect(screen.getByText('Plants')).toBeTruthy()
    expect(screen.getByText('45')).toBeTruthy()
    expect(screen.getByText('Care Actions')).toBeTruthy()
    expect(screen.getByText('3')).toBeTruthy()
    expect(screen.getByText('Achievements')).toBeTruthy()
  })

  it('renders string values', () => {
    const stats = [
      { value: '5+', label: 'Years' },
      { value: '100%', label: 'Success' },
    ]

    render(<StatsCard stats={stats} />)

    expect(screen.getByText('5+')).toBeTruthy()
    expect(screen.getByText('Years')).toBeTruthy()
    expect(screen.getByText('100%')).toBeTruthy()
    expect(screen.getByText('Success')).toBeTruthy()
  })

  it('renders single stat', () => {
    const stats = [{ value: 10, label: 'Total' }]

    render(<StatsCard stats={stats} />)

    expect(screen.getByText('10')).toBeTruthy()
    expect(screen.getByText('Total')).toBeTruthy()
  })
})
