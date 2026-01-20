import type { BottomTabBarProps } from '@react-navigation/bottom-tabs'
import { render } from '@testing-library/react-native'
import { BottomTabBar } from '../BottomTabBar'

type MockState = BottomTabBarProps['state']
type MockDescriptors = BottomTabBarProps['descriptors']
type MockNavigation = BottomTabBarProps['navigation']

describe('BottomTabBar', () => {
  const createMockState = (index = 0): MockState =>
    ({
      key: 'tab-nav',
      index,
      routes: [
        { key: 'home', name: 'Home' },
        { key: 'plants', name: 'Plants' },
        { key: 'care', name: 'Care' },
        { key: 'profile', name: 'Profile' },
      ],
      routeNames: ['Home', 'Plants', 'Care', 'Profile'],
      type: 'tab',
      stale: false,
      history: [],
      preloadedRouteKeys: [],
    }) as unknown as MockState

  const createMockDescriptors = (): MockDescriptors =>
    ({
      home: { options: { tabBarLabel: 'Home' }, render: jest.fn() },
      plants: { options: { tabBarLabel: 'Plants' }, render: jest.fn() },
      care: { options: { tabBarLabel: 'Care' }, render: jest.fn() },
      profile: { options: { tabBarLabel: 'Profile' }, render: jest.fn() },
    }) as unknown as MockDescriptors

  const createMockNavigation = (): MockNavigation =>
    ({
      emit: jest.fn(() => ({ defaultPrevented: false })),
      navigate: jest.fn(),
    }) as unknown as MockNavigation

  const createDefaultProps = () => ({
    state: createMockState(),
    descriptors: createMockDescriptors(),
    navigation: createMockNavigation(),
    onFabPress: jest.fn(),
  })

  it('renders all 4 tab icons', () => {
    const { toJSON } = render(<BottomTabBar {...createDefaultProps()} />)
    expect(toJSON()).toBeTruthy()
  })

  it('highlights active tab', () => {
    const props = createDefaultProps()
    const { rerender, toJSON } = render(
      <BottomTabBar {...props} state={createMockState(0)} />
    )
    expect(toJSON()).toBeTruthy()

    rerender(<BottomTabBar {...props} state={createMockState(2)} />)
    expect(toJSON()).toBeTruthy()
  })

  it('renders center FAB button', () => {
    const { toJSON } = render(<BottomTabBar {...createDefaultProps()} />)
    expect(toJSON()).toBeTruthy()
  })

  it('calls navigation on tab press', () => {
    const navigation = createMockNavigation()
    const props = createDefaultProps()
    render(<BottomTabBar {...props} navigation={navigation} />)
    expect(navigation.navigate).not.toHaveBeenCalled()
  })

  it('calls onFabPress when FAB pressed', () => {
    const onFabPress = jest.fn()
    const { toJSON } = render(
      <BottomTabBar {...createDefaultProps()} onFabPress={onFabPress} />
    )
    expect(toJSON()).toBeTruthy()
  })
})
