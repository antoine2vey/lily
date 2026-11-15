import { fireEvent, render, screen } from '@testing-library/react-native'
import { openExternalUrl } from '@/utils/linking'
import { AboutScreen } from '../AboutScreen'

jest.mock('expo-router', () => ({
  router: { back: jest.fn() },
}))

jest.mock('@/utils/linking', () => ({ openExternalUrl: jest.fn() }))

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

  it('opens the repository LICENSE from the License row', () => {
    render(<AboutScreen />)

    fireEvent.press(screen.getByText('License'))

    expect(openExternalUrl).toHaveBeenCalledWith(
      'https://github.com/antoine2vey/lily/blob/main/LICENSE'
    )
  })
})
