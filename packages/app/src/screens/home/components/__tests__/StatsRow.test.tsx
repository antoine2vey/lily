import { render } from '@testing-library/react-native'
import { StatsRow } from '../StatsRow'

describe('StatsRow', () => {
  it('renders total count', () => {
    const { getByText } = render(
      <StatsRow total={12} healthy={10} attention={2} />
    )
    expect(getByText('12')).toBeTruthy()
    expect(getByText('Total')).toBeTruthy()
  })

  it('renders healthy count', () => {
    const { getByText } = render(
      <StatsRow total={12} healthy={10} attention={2} />
    )
    expect(getByText('10')).toBeTruthy()
    expect(getByText('Healthy')).toBeTruthy()
  })

  it('renders attention count', () => {
    const { getByText } = render(
      <StatsRow total={12} healthy={10} attention={2} />
    )
    expect(getByText('2')).toBeTruthy()
    expect(getByText('Attention')).toBeTruthy()
  })

  it('shows warning icon for attention when > 0', () => {
    const { queryByTestId } = render(
      <StatsRow total={12} healthy={10} attention={2} />
    )
    expect(queryByTestId('attention-warning-icon')).toBeTruthy()
  })

  it('does not show warning icon for attention when = 0', () => {
    const { queryByTestId, getByText } = render(
      <StatsRow total={5} healthy={5} attention={0} />
    )
    expect(queryByTestId('attention-warning-icon')).toBeNull()
    expect(getByText('0')).toBeTruthy()
  })
})
