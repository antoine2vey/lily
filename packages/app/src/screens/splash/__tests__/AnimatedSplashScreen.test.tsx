import { render, screen } from '@testing-library/react-native'
import { Text } from 'react-native'
import { AnimatedSplashScreen } from '../AnimatedSplashScreen'

describe('AnimatedSplashScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('renders splash screen', () => {
    const { toJSON } = render(
      <AnimatedSplashScreen isReady={false}>
        <Text>Content</Text>
      </AnimatedSplashScreen>
    )
    expect(toJSON()).toBeTruthy()
  })

  it('displays app name', () => {
    render(
      <AnimatedSplashScreen isReady={false}>
        <Text>Content</Text>
      </AnimatedSplashScreen>
    )

    expect(screen.getByText('Lily')).toBeTruthy()
  })
})
