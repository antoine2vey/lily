import {
  type Canopy,
  type CanopyId,
  LimitExceededError,
  type Plant,
  PlantInDelegationError,
  ZoneName,
} from '@lily/shared'
import {
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react-native'
import { toast } from 'sonner-native'
import { mockPlants } from '@/__tests__/fixtures/plants'
import { CanopyPlantsCard } from '@/screens/canopy/components/CanopyPlantsCard'

const mockShare = jest.fn(
  (_plantId: string): Promise<unknown> => Promise.resolve({})
)
const mockUnshare = jest.fn(
  (_plantId: string): Promise<unknown> => Promise.resolve({})
)
const mockItems = { current: [] as ReadonlyArray<Plant> }

jest.mock('@/hooks/usePlants', () => ({
  usePlants: () => ({ data: { items: mockItems.current } }),
}))

jest.mock('@/hooks/usePlantCanopyActions', () => ({
  useSharePlantWithCanopy: () => ({ mutateAsync: mockShare }),
  useUnsharePlant: () => ({ mutateAsync: mockUnshare }),
}))

jest.mock('sonner-native', () => ({
  toast: { success: jest.fn(), error: jest.fn(), warning: jest.fn() },
}))

const canopyRef = { id: 'canopy-1' as CanopyId, name: 'Loft' }

const joinedAt = new Date('2026-10-01T00:00:00Z')

const canopy: Canopy = {
  id: 'canopy-1' as CanopyId,
  name: 'Loft',
  timezone: ZoneName.make('Europe/Paris'),
  latitude: null,
  longitude: null,
  role: 'member',
  members: [
    { userId: 'me', name: 'Lily', image: null, role: 'member', joinedAt },
    { userId: 'alex', name: 'Alex', image: null, role: 'owner', joinedAt },
  ],
  invite: null,
  invitations: [],
  createdAt: new Date('2026-10-01T00:00:00Z'),
  updatedAt: new Date('2026-10-01T00:00:00Z'),
}

const base = mockPlants[0]!

const personal: Plant = {
  ...base,
  id: 'personal',
  name: 'Calathea',
  ownership: 'owned',
  userId: 'me',
}
const sharedByMe: Plant = {
  ...base,
  id: 'shared-by-me',
  name: 'Pothos',
  ownership: 'canopy',
  userId: null,
  canopy: canopyRef,
  createdBy: { id: 'me', name: 'Lily' },
}
const caretaking: Plant = {
  ...base,
  id: 'caretaking',
  name: 'Fern',
  ownership: 'caretaking',
  userId: 'sam',
}
const sharedByAlex: Plant = {
  ...base,
  id: 'shared-by-alex',
  name: 'Monstera',
  ownership: 'canopy',
  userId: null,
  canopy: canopyRef,
  createdBy: { id: 'alex', name: 'Alex' },
}

const renderCard = () =>
  render(<CanopyPlantsCard canopy={canopy} myUserId="me" />)

const tile = (plantId: string) =>
  screen.getByTestId(`canopy-plant-toggle-${plantId}`)

beforeEach(() => {
  jest.clearAllMocks()
  mockItems.current = [personal, sharedByMe, caretaking, sharedByAlex]
})

describe('CanopyPlantsCard', () => {
  it('lists only the plants I may share or unshare', () => {
    renderCard()
    expect(tile('personal')).toBeTruthy()
    expect(tile('shared-by-me')).toBeTruthy()
    expect(screen.queryByTestId('canopy-plant-toggle-caretaking')).toBeNull()
    expect(
      screen.queryByTestId('canopy-plant-toggle-shared-by-alex')
    ).toBeNull()
    expect(screen.getByText('1 of 2 shared')).toBeTruthy()
  })

  it('checks a shared plant and leaves a personal one unchecked', () => {
    renderCard()
    expect(tile('shared-by-me').props.accessibilityState).toMatchObject({
      checked: true,
    })
    expect(tile('personal').props.accessibilityState).toMatchObject({
      checked: false,
    })
  })

  it('shares a personal plant and unshares a shared one', () => {
    renderCard()
    fireEvent.press(tile('personal'))
    fireEvent.press(tile('shared-by-me'))
    expect(mockShare).toHaveBeenCalledTimes(1)
    expect(mockShare).toHaveBeenCalledWith('personal')
    expect(mockUnshare).toHaveBeenCalledTimes(1)
    expect(mockUnshare).toHaveBeenCalledWith('shared-by-me')
  })

  it('shows the new state while the request is in flight and ignores taps', async () => {
    mockShare.mockImplementationOnce(() => new Promise(() => {}))
    mockUnshare.mockImplementationOnce(() => new Promise(() => {}))
    renderCard()
    fireEvent.press(tile('personal'))
    fireEvent.press(tile('shared-by-me'))
    await waitFor(() =>
      expect(tile('personal').props.accessibilityState).toMatchObject({
        checked: true,
        busy: true,
      })
    )
    expect(tile('shared-by-me').props.accessibilityState).toMatchObject({
      checked: false,
      busy: true,
    })
    expect(screen.getByText('1 of 2 shared')).toBeTruthy()
    fireEvent.press(tile('personal'))
    expect(mockShare).toHaveBeenCalledTimes(1)
    expect(mockUnshare).not.toHaveBeenCalledWith('personal')
  })

  it('reverts the tile when the request fails', async () => {
    let reject: (error: unknown) => void = () => {}
    mockShare.mockImplementationOnce(
      () => new Promise((_, rej) => (reject = rej))
    )
    renderCard()
    fireEvent.press(tile('personal'))
    await waitFor(() =>
      expect(tile('personal').props.accessibilityState).toMatchObject({
        checked: true,
      })
    )
    reject(new PlantInDelegationError({ plantId: 'personal' }))
    await waitFor(() =>
      expect(tile('personal').props.accessibilityState).toMatchObject({
        checked: false,
        busy: false,
      })
    )
    expect(screen.getByText('1 of 2 shared')).toBeTruthy()
  })

  it('shows the limit toast when the Canopy is full', async () => {
    mockShare.mockRejectedValueOnce(
      new LimitExceededError({
        feature: 'canopy_plants',
        limit: 10,
        current: 10,
        message: 'Limit reached',
      })
    )
    renderCard()
    fireEvent.press(tile('personal'))
    await waitFor(() =>
      expect(toast.warning).toHaveBeenCalledWith(
        'The Canopy reached its free plant limit, so this plant stays personal.'
      )
    )
    expect(toast.error).not.toHaveBeenCalled()
  })

  it('shows the delegation toast when the plant is in a care delegation', async () => {
    mockShare.mockRejectedValueOnce(
      new PlantInDelegationError({ plantId: 'personal' })
    )
    renderCard()
    fireEvent.press(tile('personal'))
    await waitFor(() =>
      expect(toast.warning).toHaveBeenCalledWith(
        'This plant is in a care delegation. End it before sharing it.'
      )
    )
  })

  it('renders nothing when no plant is eligible', () => {
    mockItems.current = [caretaking, sharedByAlex]
    renderCard()
    expect(screen.queryByTestId('canopy-plants-card')).toBeNull()
    expect(screen.queryByText('Plants')).toBeNull()
  })
})
