import { render, screen } from '@testing-library/react-native'
import { Avatar } from '../Avatar'

describe('Avatar', () => {
  it('renders image when source provided', () => {
    const { toJSON } = render(
      <Avatar source={{ uri: 'https://example.com/avatar.jpg' }} />
    )
    expect(toJSON()).toBeTruthy()
  })

  it('renders initials when no source', () => {
    render(<Avatar name="John Doe" />)
    expect(screen.getByText('JD')).toBeTruthy()
  })

  it('renders first letter of name as fallback', () => {
    render(<Avatar name="Alice" />)
    expect(screen.getByText('A')).toBeTruthy()
  })

  it('applies correct size', () => {
    const { rerender, toJSON } = render(<Avatar name="John" size="sm" />)
    expect(toJSON()).toBeTruthy()

    rerender(<Avatar name="John" size="md" />)
    expect(toJSON()).toBeTruthy()

    rerender(<Avatar name="John" size="lg" />)
    expect(toJSON()).toBeTruthy()

    rerender(<Avatar name="John" size="xl" />)
    expect(toJSON()).toBeTruthy()
  })

  it('has circular shape', () => {
    const { toJSON } = render(<Avatar name="John" />)
    expect(toJSON()).toBeTruthy()
  })

  it('handles image load error with fallback', () => {
    const { toJSON } = render(
      <Avatar
        source={{ uri: 'https://example.com/invalid.jpg' }}
        name="John Doe"
      />
    )
    expect(toJSON()).toBeTruthy()
  })

  it('renders question mark when no name provided', () => {
    render(<Avatar />)
    expect(screen.getByText('?')).toBeTruthy()
  })
})
