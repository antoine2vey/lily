import {
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react-native'
import { Result } from 'effect'
import { Alert } from 'react-native'
import { toast } from 'sonner-native'
import { mockPlants } from '@/__tests__/fixtures/plants'

jest.mock('sonner-native', () => ({
  toast: { success: jest.fn(), error: jest.fn(), dismiss: jest.fn() },
}))

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), back: jest.fn() }),
  router: { push: jest.fn() },
}))

jest.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({
    state: { _tag: 'Authenticated', user: { id: 'lily' }, accessToken: 't' },
  }),
}))

const mockCanopyRole = { current: 'member' as 'member' | 'owner' }
jest.mock('@/hooks/useMyCanopy', () => ({
  useMyCanopy: () => ({
    data: {
      canopy: {
        id: 'canopy-1',
        name: 'Home',
        role: mockCanopyRole.current,
        members: [],
      },
    },
  }),
}))

const mockDeadPlants = { current: [] as ReadonlyArray<unknown> }
jest.mock('@/hooks/useDeadPlants', () => ({
  useDeadPlants: () => ({ plants: mockDeadPlants.current, isLoading: false }),
}))

// useEffectMutation resolves an API failure as Result.fail, so React Query
// sees a successful mutation: onSuccess runs and onError never does. The
// mocks reproduce that.
const mockDeleteResult = { current: Result.succeed({}) as unknown }
jest.mock('@/hooks/useDeletePlant', () => ({
  useDeletePlant: () => ({
    isPending: false,
    mutate: (_vars: unknown, opts?: { onSuccess?: (r: unknown) => void }) =>
      opts?.onSuccess?.(mockDeleteResult.current),
    mutateAsync: () => Promise.resolve(mockDeleteResult.current),
  }),
}))

const mockReviveResult = { current: Result.succeed({}) as unknown }
jest.mock('@/hooks/useRevivePlant', () => ({
  useRevivePlant: () => ({
    isPending: false,
    mutate: (_vars: unknown, opts?: { onSuccess?: (r: unknown) => void }) =>
      opts?.onSuccess?.(mockReviveResult.current),
    mutateAsync: () => Promise.resolve(mockReviveResult.current),
  }),
}))

import { CemeteryScreen } from '../CemeteryScreen'

const dead = { diedAt: new Date('2026-10-01'), deathCause: null }
const canopy = { id: 'canopy-1', name: 'Home' }

const lilysOwn = {
  ...mockPlants[0]!,
  ...dead,
  id: 'own',
  name: 'Calathea',
  ownership: 'owned' as const,
  userId: 'lily',
}
const alexsCanopyPlant = {
  ...mockPlants[0]!,
  ...dead,
  id: 'alex-canopy',
  name: 'Monstera',
  ownership: 'canopy' as const,
  userId: null,
  canopy,
  createdBy: { id: 'alex', name: 'Alex' },
}
const lilysCanopyPlant = {
  ...alexsCanopyPlant,
  id: 'lily-canopy',
  name: 'Pothos',
  createdBy: { id: 'lily', name: 'Lily' },
}

describe('CemeteryScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockCanopyRole.current = 'member'
    mockDeadPlants.current = [lilysOwn, alexsCanopyPlant, lilysCanopyPlant]
    mockDeleteResult.current = Result.succeed({})
    mockReviveResult.current = Result.succeed({})
  })

  it('offers Delete only on plants the viewer may delete', () => {
    render(<CemeteryScreen />)

    expect(screen.getByTestId('cemetery-delete-own')).toBeTruthy()
    expect(screen.getByTestId('cemetery-delete-lily-canopy')).toBeTruthy()
    expect(screen.queryByTestId('cemetery-delete-alex-canopy')).toBeNull()
    // Every Canopy member may bring a shared plant back.
    expect(screen.getByTestId('cemetery-bring-back-alex-canopy')).toBeTruthy()
  })

  it("offers Delete on any member's Canopy plant to the Canopy owner", () => {
    mockCanopyRole.current = 'owner'
    render(<CemeteryScreen />)

    expect(screen.getByTestId('cemetery-delete-alex-canopy')).toBeTruthy()
  })

  it('shows the error toast, not success, when the API refuses the delete', async () => {
    mockDeleteResult.current = Result.fail({
      _tag: 'PlantNotAuthorizedError',
      message: 'Forbidden',
    })
    render(<CemeteryScreen />)

    fireEvent.press(screen.getByTestId('cemetery-delete-own'))
    fireEvent.press(screen.getByText('Delete Plant'))

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith('Failed to delete plant')
    )
    expect(toast.success).not.toHaveBeenCalled()
  })

  it('shows the success toast when the delete lands', async () => {
    render(<CemeteryScreen />)

    fireEvent.press(screen.getByTestId('cemetery-delete-own'))
    fireEvent.press(screen.getByText('Delete Plant'))

    await waitFor(() => expect(toast.success).toHaveBeenCalled())
    expect(toast.error).not.toHaveBeenCalled()
  })

  it('shows the Canopy paywall when bringing back would overfill the Canopy', async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {})
    mockReviveResult.current = Result.fail({
      _tag: 'LimitExceededError',
      feature: 'canopy_plants',
      limit: 5,
      message: 'Limit',
    })
    render(<CemeteryScreen />)

    fireEvent.press(screen.getByTestId('cemetery-bring-back-alex-canopy'))

    await waitFor(() => expect(alert).toHaveBeenCalled())
    expect(alert.mock.calls[0]?.[0]).toBe('This Canopy is full')
    expect(toast.success).not.toHaveBeenCalled()
  })
})
