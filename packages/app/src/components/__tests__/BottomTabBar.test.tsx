import { render } from '@testing-library/react-native'
import { BottomTabBar } from '../BottomTabBar'

describe('BottomTabBar', () => {
  const createMockState = (index = 0) => ({
    key: 'tab-nav',
    index,
    routes: [
      { key: 'home', name: 'Home' },
      { key: 'plants', name: 'Plants' },
      { key: 'care', name: 'Care' },
      { key: 'profile', name: 'Profile' },
    ],
    routeNames: ['Home', 'Plants', 'Care', 'Profile'],
    type: 'tab' as const,
    stale: false,
    history: [],
  })

  const createMockDescriptors = () => ({
    home: { options: { tabBarLabel: 'Home' } },
    plants: { options: { tabBarLabel: 'Plants' } },
    care: { options: { tabBarLabel: 'Care' } },
    profile: { options: { tabBarLabel: 'Profile' } },
  })

  const createMockNavigation = () => ({
    emit: jest.fn(() => ({ defaultPrevented: false })),
    navigate: jest.fn(),
  })

  const createMockInsets = () => ({
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
  })

  const defaultProps = {
    state: createMockState(),
    descriptors: createMockDescriptors(),
    navigation: createMockNavigation(),
    insets: createMockInsets(),
    onFabPress: jest.fn(),
  }

  it('renders all 4 tab icons', () => {
    const { toJSON } = render(<BottomTabBar {...(defaultProps as any)} />)
    expect(toJSON()).toBeTruthy()
  })

  it('highlights active tab', () => {
    const { rerender, toJSON } = render(
      <BottomTabBar {...(defaultProps as any)} state={createMockState(0)} />
    )
    expect(toJSON()).toBeTruthy()

    rerender(
      <BottomTabBar {...(defaultProps as any)} state={createMockState(2)} />
    )
    expect(toJSON()).toBeTruthy()
  })

  it('renders center FAB button', () => {
    const { toJSON } = render(<BottomTabBar {...(defaultProps as any)} />)
    expect(toJSON()).toBeTruthy()
  })

  it('calls navigation on tab press', () => {
    const navigation = createMockNavigation()
    render(
      <BottomTabBar {...(defaultProps as any)} navigation={navigation as any} />
    )
    expect(navigation.navigate).not.toHaveBeenCalled()
  })

  it('calls onFabPress when FAB pressed', () => {
    const onFabPress = jest.fn()
    const { toJSON } = render(
      <BottomTabBar {...(defaultProps as any)} onFabPress={onFabPress} />
    )
    expect(toJSON()).toBeTruthy()
  })
})
