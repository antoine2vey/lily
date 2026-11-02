import type { Canopy, CanopyId, CanopyInvitationView } from '@lily/shared'
import { QueryClientProvider } from '@tanstack/react-query'
import {
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react-native'
import { Result } from 'effect'
import { router } from 'expo-router'
import { Alert, type AlertButton } from 'react-native'
import { toast } from 'sonner-native'
import { createTestQueryClient } from '@/__tests__/utils/query-helpers'
import { CanopyInvitationScreen } from '@/screens/canopy-join'
import type { ApiResult } from '@/utils/client'

const INVITATION_ID = '0b9f7a52-3c1e-4d7a-9a51-6f2b8c4e1d30'
const CLOSED_TITLE = 'This invitation is closed'

const view = (
  status: CanopyInvitationView['status']
): CanopyInvitationView => ({
  id: INVITATION_ID,
  canopyId: 'canopy-flat' as CanopyId,
  canopyName: 'Our Flat',
  inviterName: 'Alex',
  memberCount: 2,
  status,
  expiresAt: new Date('2026-11-04T00:00:00Z'),
})

const mockLoft: Canopy = {
  id: 'canopy-1' as CanopyId,
  name: 'Loft',
  timezone: 'Europe/Paris',
  latitude: null,
  longitude: null,
  role: 'owner',
  members: [],
  invite: null,
  invitations: [],
  createdAt: new Date('2026-10-01T00:00:00Z'),
  updatedAt: new Date('2026-10-01T00:00:00Z'),
}

let mockMine: ApiResult<{ canopy: Canopy | null }> = Result.succeed({
  canopy: null,
})
let mockInvitation: ApiResult<CanopyInvitationView> = Result.succeed(
  view('pending')
)
let mockNextInvitation: ApiResult<CanopyInvitationView> = mockInvitation
const mockRefetch = jest.fn(async () => {
  mockInvitation = mockNextInvitation
  return { data: mockInvitation }
})
const mockAccept = jest.fn(async () => ({ name: 'Our Flat' }))
const mockDecline = jest.fn(async () => undefined)
let mockDeclinePending = false
const mockLeave = jest.fn(async () => undefined)

jest.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({
    state: { _tag: 'Authenticated', user: { id: 'user-1' } },
  }),
}))

jest.mock('@/hooks/useCanopyInvite', () => ({
  useCanopyInvite: () => ({ result: undefined, refetch: jest.fn() }),
  useCanopyInvitation: () => ({
    result: mockInvitation,
    refetch: mockRefetch,
  }),
}))

jest.mock('@/hooks/useMyCanopy', () => ({
  useMyCanopy: () => ({ result: mockMine }),
}))

jest.mock('@/hooks/useCanopyMutations', () => ({
  useAcceptCanopyInvite: () => ({ mutateAsync: jest.fn() }),
  useAcceptCanopyInvitation: () => ({ mutateAsync: mockAccept }),
  useDeclineCanopyInvitation: () => ({
    mutateAsync: mockDecline,
    isPending: mockDeclinePending,
  }),
  useLeaveCanopy: () => ({ mutateAsync: mockLeave }),
}))

jest.mock('@/screens/canopy-join/BringPlantsScreen', () => ({
  BringPlantsScreen: () => null,
}))

jest.mock('expo-router', () => ({
  ...jest.requireActual('@/__tests__/mocks/navigation'),
  router: { replace: jest.fn(), push: jest.fn() },
}))

jest.mock('sonner-native', () => ({
  toast: { success: jest.fn(), error: jest.fn() },
}))

beforeEach(() => {
  jest.clearAllMocks()
  mockMine = Result.succeed({ canopy: null })
  mockInvitation = Result.succeed(view('pending'))
  mockNextInvitation = mockInvitation
  mockDeclinePending = false
})

const renderInvitation = () =>
  render(
    <QueryClientProvider client={createTestQueryClient()}>
      <CanopyInvitationScreen rawId={INVITATION_ID} />
    </QueryClientProvider>
  )

describe('answering a direct invitation', () => {
  it('joins through the invitation, not a link', async () => {
    renderInvitation()
    fireEvent.press(await screen.findByTestId('canopy-join-button'))
    await waitFor(() => expect(mockAccept).toHaveBeenCalledWith(INVITATION_ID))
  })

  it('declines, confirms with a toast and closes', async () => {
    renderInvitation()
    fireEvent.press(await screen.findByTestId('canopy-decline-button'))
    await waitFor(() => expect(mockDecline).toHaveBeenCalledWith(INVITATION_ID))
    expect(toast.success).toHaveBeenCalledWith('Invitation declined')
    expect(router.replace).toHaveBeenCalledWith('/(app)/(tabs)')
    expect(mockAccept).not.toHaveBeenCalled()
  })

  it('cannot join while a decline is in flight', async () => {
    mockDeclinePending = true
    renderInvitation()
    fireEvent.press(await screen.findByTestId('canopy-join-button'))
    expect(mockAccept).not.toHaveBeenCalled()
  })

  it('cannot decline while a join is in flight', async () => {
    mockAccept.mockImplementationOnce(() => new Promise(() => {}))
    renderInvitation()
    fireEvent.press(await screen.findByTestId('canopy-join-button'))
    await waitFor(() => expect(mockAccept).toHaveBeenCalled())
    fireEvent.press(screen.getByTestId('canopy-decline-button'))
    expect(mockDecline).not.toHaveBeenCalled()
  })

  it('shows a closed invitation without a way to join or decline', async () => {
    mockInvitation = Result.succeed(view('withdrawn'))
    renderInvitation()
    expect(await screen.findByText(CLOSED_TITLE)).toBeTruthy()
    expect(screen.queryByTestId('canopy-join-button')).toBeNull()
    expect(screen.queryByTestId('canopy-decline-button')).toBeNull()
  })

  it('does not leave the current Canopy for an invitation withdrawn since the screen loaded', async () => {
    mockMine = Result.succeed({ canopy: mockLoft })
    mockNextInvitation = Result.succeed(view('withdrawn'))
    const alert = jest.spyOn(Alert, 'alert')
    renderInvitation()
    fireEvent.press(await screen.findByTestId('canopy-leave-and-join-button'))
    const buttons = alert.mock.calls[0]?.[2] as AlertButton[]
    buttons.find((b) => b.style === 'destructive')?.onPress?.()
    expect(await screen.findByText(CLOSED_TITLE)).toBeTruthy()
    expect(mockLeave).not.toHaveBeenCalled()
    expect(mockAccept).not.toHaveBeenCalled()
  })
})
