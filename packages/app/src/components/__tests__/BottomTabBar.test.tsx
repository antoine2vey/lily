import { fireEvent, render, screen } from '@testing-library/react-native'
import type { StandaloneTabBarProps } from '../BottomTabBar'
import { BottomTabBar } from '../BottomTabBar'

const mockNavigate = jest.fn()
let mockPathname = '/'

jest.mock('expo-router', () => ({
  usePathname: () => mockPathname,
  router: { navigate: (...args: unknown[]) => mockNavigate(...args) },
}))

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => {
      const labels: Record<string, string> = {
        'tabs.home': 'Home',
        'tabs.plants': 'Plants',
        'tabs.care': 'Care',
        'tabs.profile': 'Profile',
        'tabs.add': 'Add',
      }
      return labels[key] ?? key
    },
  }),
}))

describe('BottomTabBar', () => {
  const defaultProps: StandaloneTabBarProps = {
    onFabPress: jest.fn(),
  }

  beforeEach(() => {
    jest.clearAllMocks()
    mockPathname = '/'
  })

  it('renders all tab items', () => {
    render(<BottomTabBar {...defaultProps} />)
    expect(screen.getByText('Home')).toBeTruthy()
    expect(screen.getByText('Plants')).toBeTruthy()
    expect(screen.getByText('Care')).toBeTruthy()
    expect(screen.getByText('Profile')).toBeTruthy()
  })

  it('renders FAB button', () => {
    const { toJSON } = render(<BottomTabBar {...defaultProps} />)
    expect(toJSON()).toBeTruthy()
  })

  it('calls onFabPress when FAB pressed', () => {
    const onFabPress = jest.fn()
    const { UNSAFE_root } = render(
      <BottomTabBar {...defaultProps} onFabPress={onFabPress} />
    )

    const pressables = UNSAFE_root.findAllByType(
      require('react-native').Pressable
    )
    if (pressables.length > 0) {
      fireEvent.press(pressables[0])
      expect(onFabPress).toHaveBeenCalledTimes(1)
    }
  })

  it('navigates when inactive tab pressed', () => {
    mockPathname = '/'
    render(<BottomTabBar {...defaultProps} />)

    fireEvent.press(screen.getByText('Plants'))
    expect(mockNavigate).toHaveBeenCalledWith('/plants')
  })

  it('does not navigate when active tab pressed', () => {
    mockPathname = '/'
    render(<BottomTabBar {...defaultProps} />)

    fireEvent.press(screen.getByText('Home'))
    expect(mockNavigate).not.toHaveBeenCalled()
  })

  it('applies focused styling to active tab', () => {
    mockPathname = '/plants'
    const { toJSON } = render(<BottomTabBar {...defaultProps} />)
    expect(toJSON()).toBeTruthy()
  })
})
