import type { Canopy, CanopyId } from '@lily/shared'
import { QueryClientProvider } from '@tanstack/react-query'
import {
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react-native'
import { router } from 'expo-router'
import { toast } from 'sonner-native'
import { createTestQueryClient } from '@/__tests__/utils/query-helpers'
import { CanopyCreateScreen } from '@/screens/canopy/CanopyCreateScreen'
import type { ApiFailure } from '@/utils/client'

const mockCreated: Canopy = {
  id: 'canopy-1' as CanopyId,
  name: 'Our Flat',
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

type CreateCallbacks = {
  onSuccess: (canopy: Canopy) => void
  onError: (error: ApiFailure) => void
}

const mockCreate = jest.fn((_name: string, { onSuccess }: CreateCallbacks) =>
  onSuccess(mockCreated)
)

jest.mock('@/hooks/useCanopyMutations', () => ({
  useCreateCanopy: () => ({ mutate: mockCreate, isPending: false }),
  refreshOwnedData: jest.fn(),
}))

jest.mock('@/hooks/usePlants', () => ({
  usePlants: () => ({ data: { items: [], total: 0 }, isLoading: false }),
}))

jest.mock('expo-router', () => ({
  ...jest.requireActual('@/__tests__/mocks/navigation'),
  router: { replace: jest.fn(), push: jest.fn(), back: jest.fn() },
}))

jest.mock('sonner-native', () => ({
  toast: { success: jest.fn(), error: jest.fn(), warning: jest.fn() },
}))

beforeEach(() => {
  jest.clearAllMocks()
})

const renderCreate = () =>
  render(
    <QueryClientProvider client={createTestQueryClient()}>
      <CanopyCreateScreen />
    </QueryClientProvider>
  )

describe('creating a Canopy', () => {
  it('asks the creator which plants to bring before opening the Canopy', async () => {
    renderCreate()
    fireEvent.changeText(screen.getByTestId('canopy-name-input'), ' Our Flat ')
    fireEvent.press(screen.getByTestId('canopy-create-submit'))

    expect(mockCreate).toHaveBeenCalledWith('Our Flat', expect.anything())
    expect(await screen.findByTestId('canopy-bring-submit')).toBeTruthy()
    expect(router.replace).not.toHaveBeenCalled()

    fireEvent.press(screen.getByTestId('canopy-bring-submit'))

    await waitFor(() => expect(router.replace).toHaveBeenCalledWith('/canopy'))
    expect(toast.success).toHaveBeenCalledWith('You created Our Flat', {})
  })
})
