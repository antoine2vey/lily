import { act, render, screen } from '@testing-library/react-native'

jest.mock('sonner-native', () => ({
  toast: { success: jest.fn(), error: jest.fn(), dismiss: jest.fn() },
}))

jest.mock('@/hooks/useRooms', () => ({ useRooms: jest.fn() }))
jest.mock('@/hooks/usePlants', () => ({
  usePlants: jest.fn(() => ({ data: undefined })),
}))
jest.mock('@/hooks/useCreateRoom', () => ({
  useCreateRoom: () => ({ mutate: jest.fn(), isPending: false }),
}))
jest.mock('@/hooks/useUpdateRoom', () => ({
  useUpdateRoom: () => ({ mutate: jest.fn(), isPending: false }),
}))
jest.mock('@/hooks/useDeleteRoom', () => ({
  useDeleteRoom: () => ({ mutate: jest.fn(), isPending: false }),
}))
jest.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ invalidateQueries: jest.fn() }),
}))

import { useRooms } from '@/hooks/useRooms'
import { RoomsScreen } from '../RoomsScreen'

const mockedUseRooms = useRooms as jest.Mock

const room = {
  id: 'room-1',
  name: 'Living Room',
  icon: '🛋️',
  luminosity: null,
  orientation: null,
  isOutdoor: false,
  plantCount: 3,
}

describe('RoomsScreen root testID', () => {
  afterEach(() => {
    jest.useRealTimers()
  })

  it('renders while loading, before and after the skeleton delay', () => {
    jest.useFakeTimers()
    mockedUseRooms.mockReturnValue({ data: undefined, isLoading: true })

    render(<RoomsScreen />)
    expect(screen.getByTestId('rooms-screen')).toBeTruthy()

    act(() => {
      jest.advanceTimersByTime(400)
    })
    expect(screen.getByTestId('rooms-screen')).toBeTruthy()
  })

  it('renders when the account has no rooms', () => {
    mockedUseRooms.mockReturnValue({ data: [], isLoading: false })

    render(<RoomsScreen />)

    expect(screen.getByTestId('rooms-screen')).toBeTruthy()
  })

  it('renders when the account has rooms', () => {
    mockedUseRooms.mockReturnValue({ data: [room], isLoading: false })

    render(<RoomsScreen />)

    expect(screen.getByTestId('rooms-screen')).toBeTruthy()
    expect(screen.getByText('Living Room')).toBeTruthy()
  })
})
