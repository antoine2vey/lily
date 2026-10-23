import { render, screen } from '@testing-library/react-native'

jest.mock('@/hooks/useRooms', () => ({
  useRooms: jest.fn(),
}))

import { useRooms } from '@/hooks/useRooms'
import { RoomPicker } from '../RoomPicker'

const mockedUseRooms = useRooms as jest.Mock

describe('RoomPicker', () => {
  it('renders nothing, label included, when the user has no rooms', () => {
    mockedUseRooms.mockReturnValue({ data: [] })

    render(<RoomPicker label="Room" value={null} onSelect={jest.fn()} />)

    expect(screen.queryByText('Room')).toBeNull()
  })

  it('renders the label above the room chips', () => {
    mockedUseRooms.mockReturnValue({
      data: [{ id: 'room-1', name: 'Kitchen', icon: '🍳', luminosity: null }],
    })

    render(<RoomPicker label="Room" value={null} onSelect={jest.fn()} />)

    expect(screen.getByText('Room')).toBeTruthy()
    expect(screen.getByText('Kitchen')).toBeTruthy()
  })
})
