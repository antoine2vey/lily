import { render, screen } from '@testing-library/react-native'
import { Option } from 'effect'
import { ProfileHeader } from '../ProfileHeader'

describe('ProfileHeader', () => {
  it('renders profile header with name', () => {
    render(
      <ProfileHeader
        avatarUrl={Option.none()}
        name="John Doe"
        memberSince="2024-01-15T00:00:00Z"
      />
    )

    expect(screen.getByText('John Doe')).toBeTruthy()
  })

  it('displays username when provided', () => {
    render(
      <ProfileHeader
        avatarUrl={Option.none()}
        name="John Doe"
        username="johndoe"
        memberSince="2024-01-15T00:00:00Z"
      />
    )

    expect(screen.getByText('@johndoe')).toBeTruthy()
  })

  it('displays first letter avatar when no avatar URL', () => {
    render(
      <ProfileHeader
        avatarUrl={Option.none()}
        name="John Doe"
        memberSince="2024-01-15T00:00:00Z"
      />
    )

    expect(screen.getByText('J')).toBeTruthy()
  })

  it('displays avatar image when URL provided', () => {
    render(
      <ProfileHeader
        avatarUrl={Option.some('https://example.com/avatar.jpg')}
        name="John Doe"
        memberSince="2024-01-15T00:00:00Z"
      />
    )

    // No "J" initial should be shown when image URL is provided
    expect(screen.queryByText('J')).toBeNull()
  })

  it('displays member since badge', () => {
    render(
      <ProfileHeader
        avatarUrl={Option.none()}
        name="John Doe"
        memberSince="2024-01-15T00:00:00Z"
      />
    )

    expect(screen.getByText(/Member since/i)).toBeTruthy()
  })
})
