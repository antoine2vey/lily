import {
  type Canopy,
  type CanopyId,
  CanopyInviteNotFoundError,
  type CanopyInvitePreview,
} from '@lily/shared'
import { QueryClientProvider } from '@tanstack/react-query'
import {
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react-native'
import { Result } from 'effect'
import { Alert, type AlertButton } from 'react-native'
import { createTestQueryClient } from '@/__tests__/utils/query-helpers'
import { CanopyJoinScreen } from '@/screens/canopy-join'
import type { ApiResult } from '@/utils/client'

const TOKEN = 'U97umPWqTRea_CZl99IrKv07PctPfxf7mjipVeP7HcM'
const INVALID_TITLE = 'This invite link does not work'

const preview: CanopyInvitePreview = {
  canopyName: 'Our Flat',
  inviterName: 'Alex',
  memberCount: 2,
  expiresAt: new Date('2026-11-04T00:00:00Z'),
}

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

const mockMine = Result.succeed({ canopy: mockLoft })
let mockPreview: ApiResult<CanopyInvitePreview> = Result.succeed(preview)
let mockNextPreview: ApiResult<CanopyInvitePreview> = Result.succeed(preview)
const mockRefetch = jest.fn(async () => {
  mockPreview = mockNextPreview
  return { data: mockPreview }
})
const mockLeave = jest.fn(async () => undefined)
const mockAccept = jest.fn(async () => ({ name: 'Our Flat' }))

jest.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({
    state: { _tag: 'Authenticated', user: { id: 'user-1' } },
  }),
}))

jest.mock('@/hooks/useCanopyInvite', () => ({
  useCanopyInvite: () => ({ result: mockPreview, refetch: mockRefetch }),
  useCanopyInvitation: () => ({ result: undefined, refetch: jest.fn() }),
}))

jest.mock('@/hooks/useMyCanopy', () => ({
  useMyCanopy: () => ({ result: mockMine }),
}))

jest.mock('@/hooks/useCanopyMutations', () => ({
  useAcceptCanopyInvite: () => ({ mutateAsync: mockAccept }),
  useAcceptCanopyInvitation: () => ({ mutateAsync: jest.fn() }),
  useDeclineCanopyInvitation: () => ({ mutateAsync: jest.fn() }),
  useLeaveCanopy: () => ({ mutateAsync: mockLeave }),
}))

jest.mock('sonner-native', () => ({
  toast: { success: jest.fn(), error: jest.fn() },
}))

jest.mock('@/screens/canopy-join/BringPlantsScreen', () => ({
  BringPlantsScreen: () => null,
}))

jest.mock('expo-router', () => ({
  ...jest.requireActual('@/__tests__/mocks/navigation'),
  router: { replace: jest.fn(), push: jest.fn() },
}))

beforeEach(() => {
  jest.clearAllMocks()
  mockPreview = Result.succeed(preview)
  mockNextPreview = Result.succeed(preview)
})

/** Taps "Leave Loft and join", then the destructive button in the dialog. */
const confirmLeaveAndJoin = async () => {
  const alert = jest.spyOn(Alert, 'alert')
  render(
    <QueryClientProvider client={createTestQueryClient()}>
      <CanopyJoinScreen rawToken={TOKEN} />
    </QueryClientProvider>
  )
  fireEvent.press(await screen.findByTestId('canopy-leave-and-join-button'))
  const buttons = alert.mock.calls[0]?.[2] as AlertButton[]
  buttons.find((b) => b.style === 'destructive')?.onPress?.()
}

describe('a share link', () => {
  it('offers no decline', async () => {
    render(
      <QueryClientProvider client={createTestQueryClient()}>
        <CanopyJoinScreen rawToken={TOKEN} />
      </QueryClientProvider>
    )
    expect(
      await screen.findByTestId('canopy-leave-and-join-button')
    ).toBeTruthy()
    expect(screen.queryByTestId('canopy-decline-button')).toBeNull()
  })
})

describe('leaving one Canopy to join another', () => {
  it('leaves and then accepts while the invite is still valid', async () => {
    await confirmLeaveAndJoin()
    await waitFor(() => expect(mockAccept).toHaveBeenCalledTimes(1))
    expect(mockRefetch).toHaveBeenCalledTimes(1)
    expect(mockLeave).toHaveBeenCalledTimes(1)
  })

  it('does not leave when the invite was revoked after the screen loaded', async () => {
    mockNextPreview = Result.fail(new CanopyInviteNotFoundError())
    await confirmLeaveAndJoin()
    expect(await screen.findByText(INVALID_TITLE)).toBeTruthy()
    expect(mockRefetch).toHaveBeenCalledTimes(1)
    expect(mockLeave).not.toHaveBeenCalled()
    expect(mockAccept).not.toHaveBeenCalled()
  })

  it('does not leave when the Canopy filled up after the screen loaded', async () => {
    mockNextPreview = Result.succeed({ ...preview, memberCount: 10 })
    await confirmLeaveAndJoin()
    expect(await screen.findByText('Our Flat is full')).toBeTruthy()
    expect(mockRefetch).toHaveBeenCalledTimes(1)
    expect(mockLeave).not.toHaveBeenCalled()
    expect(mockAccept).not.toHaveBeenCalled()
  })
})
