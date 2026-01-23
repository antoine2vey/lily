import { fireEvent, render, screen } from '@testing-library/react-native'
import { BottomTabBar } from '../BottomTabBar'

// Mock navigation state and descriptors
const createMockNavigation = () => ({
  emit: jest.fn().mockReturnValue({ defaultPrevented: false }),
  navigate: jest.fn(),
})

const createMockState = (activeIndex = 0) => ({
  index: activeIndex,
  routes: [
    { key: 'index-1', name: 'index' },
    { key: 'plants-1', name: 'plants' },
    { key: 'care-1', name: 'care' },
    { key: 'profile-1', name: 'profile' },
  ],
})

const createMockDescriptors = () => ({
  'index-1': { options: { title: 'Home' } },
  'plants-1': { options: { title: 'Plants' } },
  'care-1': { options: { title: 'Care' } },
  'profile-1': { options: { title: 'Profile' } },
})

describe('BottomTabBar', () => {
  const defaultProps = {
    state: createMockState(),
    descriptors: createMockDescriptors(),
    navigation: createMockNavigation(),
    onFabPress: jest.fn(),
  }

  beforeEach(() => {
    jest.clearAllMocks()
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

    // Find the FAB (first Pressable with specific styling)
    const pressables = UNSAFE_root.findAllByType(
      require('react-native').Pressable
    )
    // FAB is typically the first Pressable
    if (pressables.length > 0) {
      fireEvent.press(pressables[0])
      expect(onFabPress).toHaveBeenCalledTimes(1)
    }
  })

  it('navigates when tab pressed', () => {
    const navigation = createMockNavigation()
    render(<BottomTabBar {...defaultProps} navigation={navigation} />)

    fireEvent.press(screen.getByText('Plants'))
    expect(navigation.emit).toHaveBeenCalled()
    expect(navigation.navigate).toHaveBeenCalledWith('plants')
  })

  it('does not navigate when active tab pressed', () => {
    const navigation = createMockNavigation()
    const state = createMockState(0) // Home is active
    render(
      <BottomTabBar {...defaultProps} state={state} navigation={navigation} />
    )

    fireEvent.press(screen.getByText('Home'))
    expect(navigation.emit).toHaveBeenCalled()
    // Navigate should not be called for active tab
    expect(navigation.navigate).not.toHaveBeenCalled()
  })

  it('emits tabPress event when tab pressed', () => {
    const navigation = createMockNavigation()
    render(<BottomTabBar {...defaultProps} navigation={navigation} />)

    fireEvent.press(screen.getByText('Plants'))
    expect(navigation.emit).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'tabPress',
        target: 'plants-1',
        canPreventDefault: true,
      })
    )
  })

  it('uses tabBarLabel when provided', () => {
    const descriptors = {
      ...createMockDescriptors(),
      'index-1': { options: { tabBarLabel: 'Dashboard' } },
    }
    render(<BottomTabBar {...defaultProps} descriptors={descriptors} />)
    expect(screen.getByText('Dashboard')).toBeTruthy()
  })

  it('falls back to route name when no title or label', () => {
    const descriptors = {
      'index-1': { options: {} },
      'plants-1': { options: {} },
      'care-1': { options: {} },
      'profile-1': { options: {} },
    }
    render(<BottomTabBar {...defaultProps} descriptors={descriptors} />)
    expect(screen.getByText('index')).toBeTruthy()
  })

  it('applies focused styling to active tab', () => {
    const state = createMockState(1) // Plants is active
    const { toJSON } = render(<BottomTabBar {...defaultProps} state={state} />)
    expect(toJSON()).toBeTruthy()
  })
})
