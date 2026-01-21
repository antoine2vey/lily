import { render, screen } from '@testing-library/react-native'
import { describe, expect, it, vi } from 'vitest'

// Mock navigation
vi.mock('@react-navigation/native', () => ({
  useNavigation: () => ({
    goBack: vi.fn(),
    navigate: vi.fn(),
  }),
}))

// Mock Linking
vi.mock('react-native/Libraries/Linking/Linking', () => ({
  openURL: vi.fn(),
}))

import { AboutScreen } from '../AboutScreen'

describe('AboutScreen', () => {
  it('renders header with title', () => {
    render(<AboutScreen />)
    expect(screen.getByText('About')).toBeTruthy()
  })

  it('renders app name', () => {
    render(<AboutScreen />)
    expect(screen.getByText('Lily')).toBeTruthy()
  })

  it('renders version number', () => {
    render(<AboutScreen />)
    expect(screen.getByText('VERSION 1.0.0')).toBeTruthy()
  })

  it('renders mission quote', () => {
    render(<AboutScreen />)
    expect(screen.getByText(/We believe every leaf tells a story/)).toBeTruthy()
  })

  it('renders Open Source Licenses link', () => {
    render(<AboutScreen />)
    expect(screen.getByText('Open Source Licenses')).toBeTruthy()
  })

  it('renders Community Guidelines link', () => {
    render(<AboutScreen />)
    expect(screen.getByText('Community Guidelines')).toBeTruthy()
  })

  it('renders Instagram link', () => {
    render(<AboutScreen />)
    expect(screen.getByText('Follow us on Instagram')).toBeTruthy()
  })

  it('renders footer text', () => {
    render(<AboutScreen />)
    expect(screen.getByText('Made with love in Portland, OR')).toBeTruthy()
  })
})
