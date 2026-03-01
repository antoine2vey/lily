import type { rooms } from '@lily/db/schema'

export type RoomRecord = typeof rooms.$inferSelect

export const mockRooms: RoomRecord[] = [
  {
    id: 'room-1',
    name: 'Living Room',
    icon: '🛋️',
    luminosity: null,
    isOutdoor: false,
    order: 1,
    userId: 'user-1',
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
  },
  {
    id: 'room-2',
    name: 'Kitchen',
    icon: '🍳',
    luminosity: 3,
    isOutdoor: false,
    order: 2,
    userId: 'user-1',
    createdAt: new Date('2024-01-02'),
    updatedAt: new Date('2024-01-02'),
  },
  {
    id: 'room-3',
    name: 'Bedroom',
    icon: '🛏️',
    luminosity: null,
    isOutdoor: false,
    order: 1,
    userId: 'user-2',
    createdAt: new Date('2024-01-03'),
    updatedAt: new Date('2024-01-03'),
  },
]

export const createTestRoom = (
  overrides: Partial<RoomRecord> = {}
): RoomRecord => ({
  id: `room-${crypto.randomUUID()}`,
  name: 'Test Room',
  icon: '🏠',
  luminosity: null,
  isOutdoor: false,
  order: 0,
  userId: 'user-1',
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
})
