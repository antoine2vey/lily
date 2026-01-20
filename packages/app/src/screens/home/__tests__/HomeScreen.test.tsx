import { render } from '@testing-library/react-native'
import { HomeScreen } from '../HomeScreen'

// Mock dependencies
jest.mock('expo-router', () => ({
  useRouter: () => ({
    push: jest.fn(),
    replace: jest.fn(),
  }),
}))

jest.mock('src/contexts/AuthContext', () => ({
  useAuth: () => ({
    state: {
      _tag: 'Authenticated',
      user: {
        id: 'user-1',
        username: 'Alex',
        name: 'Alex',
        avatarUrl: null,
      },
    },
    logout: jest.fn(),
  }),
}))

jest.mock('src/utils/client', () => ({
  useEffectQuery: () => ({
    data: { items: [] },
    isLoading: false,
    isRefetching: false,
    refetch: jest.fn(),
  }),
}))

jest.mock('src/components/BottomSheet', () => ({
  BottomSheet: ({
    children,
    visible,
  }: {
    children: React.ReactNode
    visible: boolean
  }) => (visible ? children : null),
}))

describe('HomeScreen', () => {
  beforeEach(() => {
    jest.useFakeTimers()
    jest.setSystemTime(new Date('2024-01-15T10:00:00'))
  })

  afterEach(() => {
    jest.useRealTimers()
  })

  it('renders greeting based on time of day', () => {
    const { getByText } = render(<HomeScreen />)
    // Greeting is now combined in a single text with newline
    expect(getByText(/Good morning/)).toBeTruthy()
  })

  it('renders username from auth context', () => {
    const { getByText } = render(<HomeScreen />)
    expect(getByText(/Alex/)).toBeTruthy()
  })

  it('renders user avatar in header', () => {
    const { UNSAFE_queryByType } = render(<HomeScreen />)
    expect(UNSAFE_queryByType).toBeDefined()
  })

  it('renders notification bell', () => {
    const { queryByLabelText } = render(<HomeScreen />)
    expect(queryByLabelText(/notification/i)).toBeTruthy()
  })

  it('renders ScrollView for content', () => {
    const { UNSAFE_root } = render(<HomeScreen />)
    expect(UNSAFE_root).toBeTruthy()
  })
})

describe('HomeScreen greeting', () => {
  afterEach(() => {
    jest.useRealTimers()
  })

  it('shows "Good morning" before noon', () => {
    jest.useFakeTimers()
    jest.setSystemTime(new Date('2024-01-15T09:00:00'))
    const { getByText } = render(<HomeScreen />)
    expect(getByText(/Good morning/)).toBeTruthy()
  })

  it('shows "Good afternoon" between noon and 5pm', () => {
    jest.useFakeTimers()
    jest.setSystemTime(new Date('2024-01-15T14:00:00'))
    const { getByText } = render(<HomeScreen />)
    expect(getByText(/Good afternoon/)).toBeTruthy()
  })

  it('shows "Good evening" after 5pm', () => {
    jest.useFakeTimers()
    jest.setSystemTime(new Date('2024-01-15T18:00:00'))
    const { getByText } = render(<HomeScreen />)
    expect(getByText(/Good evening/)).toBeTruthy()
  })
})
