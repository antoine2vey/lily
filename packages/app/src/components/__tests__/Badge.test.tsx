import { render, screen } from '@testing-library/react-native'
import { Text } from 'react-native'
import { Badge } from '../Badge'

describe('Badge', () => {
  it('renders label text', () => {
    render(<Badge label="Success" variant="success" />)
    expect(screen.getByText('Success')).toBeTruthy()
  })

  it('renders with success variant', () => {
    const { toJSON } = render(<Badge label="Test" variant="success" />)
    expect(toJSON()).toBeTruthy()
  })

  it('renders with warning variant', () => {
    const { toJSON } = render(<Badge label="Test" variant="warning" />)
    expect(toJSON()).toBeTruthy()
  })

  it('renders with error variant', () => {
    const { toJSON } = render(<Badge label="Test" variant="error" />)
    expect(toJSON()).toBeTruthy()
  })

  it('renders with info variant', () => {
    const { toJSON } = render(<Badge label="Test" variant="info" />)
    expect(toJSON()).toBeTruthy()
  })

  it('renders with neutral variant', () => {
    const { toJSON } = render(<Badge label="Test" variant="neutral" />)
    expect(toJSON()).toBeTruthy()
  })

  it('renders with sm size', () => {
    const { toJSON } = render(
      <Badge label="Test" variant="success" size="sm" />
    )
    expect(toJSON()).toBeTruthy()
  })

  it('renders with md size (default)', () => {
    const { toJSON } = render(
      <Badge label="Test" variant="success" size="md" />
    )
    expect(toJSON()).toBeTruthy()
  })

  it('renders with icon', () => {
    const icon = <Text testID="badge-icon">Icon</Text>
    render(<Badge label="Test" variant="success" icon={icon} />)
    expect(screen.getByTestId('badge-icon')).toBeTruthy()
  })

  it('renders without icon by default', () => {
    const { toJSON } = render(<Badge label="Test" variant="success" />)
    const json = toJSON()
    expect(json).toBeTruthy()
  })
})
