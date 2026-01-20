import { render, screen } from '@testing-library/react-native'
import { Text } from 'react-native'
import { Badge } from '../Badge'

describe('Badge', () => {
  it('renders label text', () => {
    render(<Badge label="HEALTHY" variant="success" />)
    expect(screen.getByText('HEALTHY')).toBeTruthy()
  })

  it('applies success colors', () => {
    const { toJSON } = render(<Badge label="HEALTHY" variant="success" />)
    expect(toJSON()).toBeTruthy()
  })

  it('applies warning colors', () => {
    const { toJSON } = render(<Badge label="THIRSTY" variant="warning" />)
    expect(toJSON()).toBeTruthy()
  })

  it('applies error colors', () => {
    const { toJSON } = render(<Badge label="CRITICAL" variant="error" />)
    expect(toJSON()).toBeTruthy()
  })

  it('applies info colors', () => {
    const { toJSON } = render(<Badge label="INFO" variant="info" />)
    expect(toJSON()).toBeTruthy()
  })

  it('applies neutral colors', () => {
    const { toJSON } = render(<Badge label="NEUTRAL" variant="neutral" />)
    expect(toJSON()).toBeTruthy()
  })

  it('renders icon when provided', () => {
    render(
      <Badge
        label="HEALTHY"
        variant="success"
        icon={<Text testID="badge-icon">Icon</Text>}
      />
    )
    expect(screen.getByTestId('badge-icon')).toBeTruthy()
  })

  it('applies correct size', () => {
    const { rerender, toJSON } = render(
      <Badge label="Small" variant="success" size="sm" />
    )
    expect(toJSON()).toBeTruthy()

    rerender(<Badge label="Medium" variant="success" size="md" />)
    expect(toJSON()).toBeTruthy()
  })
})
