import { render, screen } from '@testing-library/react-native'
import { AboutScreen } from '../AboutScreen'

jest.mock('expo-router', () => ({
  router: { back: jest.fn() },
}))

describe('AboutScreen', () => {
  it('renders about screen', () => {
    const { toJSON } = render(<AboutScreen />)
    expect(toJSON()).toBeTruthy()
  })

  it('displays about title', () => {
    render(<AboutScreen />)

    expect(screen.getByText('About')).toBeTruthy()
  })

  it('displays app name', () => {
    render(<AboutScreen />)

    expect(screen.getByText('Lily')).toBeTruthy()
  })
})
