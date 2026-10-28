import AsyncStorage from '@react-native-async-storage/async-storage'
import { QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react-native'
import { createTestQueryClient } from '@/__tests__/utils/query-helpers'
import { CanopyJoinScreen } from '@/screens/canopy-join'
import Index from '../../../../app/index'

const TOKEN = 'U97umPWqTRea_CZl99IrKv07PctPfxf7mjipVeP7HcM'

type MockAuthState =
  | { _tag: 'Unauthenticated' }
  | { _tag: 'Authenticated'; user: { id: string } }

let mockAuthState: MockAuthState = { _tag: 'Unauthenticated' }

jest.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ state: mockAuthState }),
}))

jest.mock('@/hooks/useOnboardingComplete', () => ({
  useOnboardingComplete: () => ({ isComplete: true, isLoading: false }),
}))

jest.mock('@/hooks/useWelcomeSeen', () => ({
  ...jest.requireActual('@/hooks/useWelcomeSeen'),
  useWelcomeSeen: () => ({ hasSeen: true, isLoading: false }),
}))

jest.mock('@/hooks/useCanopyInvite', () => ({
  useCanopyInvite: () => ({ result: undefined, refetch: jest.fn() }),
}))

jest.mock('@/hooks/useMyCanopy', () => ({
  useMyCanopy: () => ({ result: undefined }),
}))

jest.mock('@/hooks/useCanopyMutations', () => ({
  useAcceptCanopyInvite: () => ({ mutateAsync: jest.fn() }),
  useLeaveCanopy: () => ({ mutateAsync: jest.fn() }),
}))

jest.mock('@/screens/canopy-join/BringPlantsScreen', () => ({
  BringPlantsScreen: () => null,
}))

jest.mock('expo-router', () => {
  const { Text } = jest.requireActual('react-native')
  return {
    ...jest.requireActual('@/__tests__/mocks/navigation'),
    router: { replace: jest.fn(), push: jest.fn() },
    Redirect: ({ href }: { href: string }) => (
      <Text testID="redirect">{href}</Text>
    ),
  }
})

const store = new Map<string, string>()

beforeEach(() => {
  store.clear()
  jest
    .mocked(AsyncStorage.getItem)
    .mockImplementation(async (key) => store.get(key) ?? null)
  jest.mocked(AsyncStorage.setItem).mockImplementation(async (key, value) => {
    store.set(key, value)
  })
  jest.mocked(AsyncStorage.removeItem).mockImplementation(async (key) => {
    store.delete(key)
  })
})

const openLink = (rawToken: string) =>
  render(
    <QueryClientProvider client={createTestQueryClient()}>
      <CanopyJoinScreen rawToken={rawToken} />
    </QueryClientProvider>
  )

const signIn = () => {
  mockAuthState = { _tag: 'Authenticated', user: { id: 'user-1' } }
}

const signOut = () => {
  mockAuthState = { _tag: 'Unauthenticated' }
}

describe('an invite opened while signed out', () => {
  it('reopens the join screen once the user signs in, then is used up', async () => {
    signOut()
    const signedOut = openLink(TOKEN)
    await waitFor(() => expect(store.size).toBe(1))
    signedOut.unmount()

    signIn()
    const gate = render(<Index />)
    expect(await screen.findByTestId('redirect')).toHaveTextContent(
      `/join/${TOKEN}`
    )
    gate.unmount()

    openLink(TOKEN)
    await waitFor(() => expect(store.size).toBe(0))

    render(<Index />)
    expect(await screen.findByTestId('redirect')).toHaveTextContent(
      '/(app)/(tabs)'
    )
  })

  it('stashes nothing for a malformed token', async () => {
    signOut()
    openLink('not-a-token')
    signIn()
    render(<Index />)
    expect(await screen.findByTestId('redirect')).toHaveTextContent(
      '/(app)/(tabs)'
    )
    expect(store.size).toBe(0)
  })
})
