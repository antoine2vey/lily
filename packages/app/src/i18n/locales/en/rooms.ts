export default {
  title: 'Rooms',
  addRoom: 'Add Room',
  editRoom: 'Edit Room',
  roomName: 'Room name',
  roomNamePlaceholder: 'e.g., Living Room',
  icon: 'Icon',
  plantCount: '{count, plural, =0 {No plants} one {# plant} other {# plants}}',
  empty: {
    title: 'No rooms yet',
    description:
      'Create rooms to organize your plants by location and easily find them.',
    button: 'Create Your First Room',
  },
  create: {
    title: 'New Room',
    button: 'Create Room',
  },
  edit: {
    title: 'Edit Room',
    button: 'Save Changes',
  },
  delete: {
    title: 'Delete {name}?',
    message:
      'Plants in this room will not be deleted. They will simply have no room assigned.',
    confirm: 'Delete Room',
    cancel: 'Keep Room',
  },
  toast: {
    created: 'Room "{name}" created',
    updated: 'Room "{name}" updated',
    deleted: 'Room "{name}" deleted',
    createFailed: 'Failed to create room',
    updateFailed: 'Failed to update room',
    deleteFailed: 'Failed to delete room',
  },
  plants: 'Plants',
  addPlants: 'Add plants to this room',
  noUnassignedPlants: 'All plants are already assigned to rooms',
  plantsSelected: '{count} plant(s) selected',
  filter: {
    allRooms: 'All Rooms',
    noRoom: 'No Room',
  },
} as const
