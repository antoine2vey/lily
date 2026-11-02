import { render, screen } from '@testing-library/react-native'

jest.mock('@/hooks/useRooms', () => ({
  useRooms: jest.fn(),
}))

import { useRooms } from '@/hooks/useRooms'
import { RoomPicker } from '../RoomPicker'

const mockedUseRooms = useRooms as jest.Mock

const room = (id: string, name: string, canopyId: string | null) => ({
  id,
  name,
  icon: '🍳',
  luminosity: null,
  canopyId,
})

describe('RoomPicker', () => {
  it('renders nothing, label included, when the user has no rooms', () => {
    mockedUseRooms.mockReturnValue({ data: [] })

    render(
      <RoomPicker label="Room" value={null} onSelect={jest.fn()} owner="me" />
    )

    expect(screen.queryByText('Room')).toBeNull()
  })

  it('renders the label above the room chips', () => {
    mockedUseRooms.mockReturnValue({ data: [room('room-1', 'Kitchen', null)] })

    render(
      <RoomPicker label="Room" value={null} onSelect={jest.fn()} owner="me" />
    )

    expect(screen.getByText('Room')).toBeTruthy()
    expect(screen.getByText('Kitchen')).toBeTruthy()
  })

  it('offers only the rooms of the chosen owner', () => {
    mockedUseRooms.mockReturnValue({
      data: [
        room('room-1', 'Study', null),
        room('room-2', 'Living room', 'canopy-1'),
      ],
    })

    const { rerender } = render(
      <RoomPicker
        label="Room"
        value={null}
        onSelect={jest.fn()}
        owner="canopy"
      />
    )

    expect(screen.getByText('Living room')).toBeTruthy()
    expect(screen.queryByText('Study')).toBeNull()

    rerender(
      <RoomPicker label="Room" value={null} onSelect={jest.fn()} owner="me" />
    )

    expect(screen.getByText('Study')).toBeTruthy()
    expect(screen.queryByText('Living room')).toBeNull()
  })

  it('hides the picker when the chosen owner has no rooms', () => {
    mockedUseRooms.mockReturnValue({ data: [room('room-1', 'Study', null)] })

    render(
      <RoomPicker
        label="Room"
        value={null}
        onSelect={jest.fn()}
        owner="canopy"
      />
    )

    expect(screen.queryByText('Room')).toBeNull()
  })
})
