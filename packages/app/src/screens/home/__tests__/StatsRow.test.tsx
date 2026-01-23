import { render, screen } from '@testing-library/react-native'
import { StatsRow } from '../components/StatsRow'

describe('StatsRow', () => {
  it('renders total, healthy, and attention stats', () => {
    render(<StatsRow total={10} healthy={7} attention={3} />)

    expect(screen.getByText('10')).toBeTruthy()
    expect(screen.getByText('7')).toBeTruthy()
    expect(screen.getByText('3')).toBeTruthy()
  })

  it('displays correct labels', () => {
    render(<StatsRow total={5} healthy={4} attention={1} />)

    expect(screen.getByText('Total')).toBeTruthy()
    expect(screen.getByText('Healthy')).toBeTruthy()
    expect(screen.getByText('Attention')).toBeTruthy()
  })

  it('shows warning icon when attention count is greater than 0', () => {
    render(<StatsRow total={5} healthy={4} attention={1} />)

    expect(screen.getByTestId('attention-warning-icon')).toBeTruthy()
  })

  it('does not show warning icon when attention count is 0', () => {
    render(<StatsRow total={5} healthy={5} attention={0} />)

    expect(screen.queryByTestId('attention-warning-icon')).toBeNull()
  })

  it('handles zero values', () => {
    render(<StatsRow total={0} healthy={0} attention={0} />)

    const zeros = screen.getAllByText('0')
    expect(zeros).toHaveLength(3)
  })

  it('handles large numbers', () => {
    render(<StatsRow total={999} healthy={500} attention={499} />)

    expect(screen.getByText('999')).toBeTruthy()
    expect(screen.getByText('500')).toBeTruthy()
    expect(screen.getByText('499')).toBeTruthy()
  })
})
