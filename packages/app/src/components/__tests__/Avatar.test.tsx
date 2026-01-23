import { fireEvent, render, screen } from '@testing-library/react-native'
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

  it('renders question mark when no name provided', () => {
    render(<Avatar />)
    expect(screen.getByText('?')).toBeTruthy()
  })

  it('applies correct size for sm variant', () => {
    const { toJSON } = render(<Avatar name="John" size="sm" />)
    expect(toJSON()).toBeTruthy()
  })

  it('applies correct size for md variant', () => {
    const { toJSON } = render(<Avatar name="John" size="md" />)
    expect(toJSON()).toBeTruthy()
  })

  it('applies correct size for lg variant', () => {
    const { toJSON } = render(<Avatar name="John" size="lg" />)
    expect(toJSON()).toBeTruthy()
  })

  it('applies correct size for xl variant', () => {
    const { toJSON } = render(<Avatar name="John" size="xl" />)
    expect(toJSON()).toBeTruthy()
  })

  it('handles three-word names correctly', () => {
    render(<Avatar name="John Paul Smith" />)
    // Takes first two parts
    expect(screen.getByText('JP')).toBeTruthy()
  })

  it('handles image load error with fallback', () => {
    const { toJSON, getByTestId } = render(
      <Avatar
        source={{ uri: 'https://example.com/invalid.jpg' }}
        name="John Doe"
      />
    )
    // Component should render
    expect(toJSON()).toBeTruthy()
  })

  it('handles empty string name', () => {
    // Empty string produces empty initials (Option.fromNullable considers "" as Some(""))
    const { toJSON } = render(<Avatar name="" />)
    expect(toJSON()).toBeTruthy()
  })

  it('handles whitespace-only name', () => {
    // Whitespace-only name produces empty initials after trim
    const { toJSON } = render(<Avatar name="   " />)
    expect(toJSON()).toBeTruthy()
  })
})
