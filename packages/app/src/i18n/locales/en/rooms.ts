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
  outdoor: 'Outdoor',
  outdoorDescription:
    'Weather like rain and wind will affect plant care schedules',
  plants: 'Plants',
  addPlants: 'Add plants to this room',
  noUnassignedPlants: 'All plants are already assigned to rooms',
  plantsSelected: '{count} plant(s) selected',
  lighting: 'Lighting',
  lightingLevels: {
    1: 'Low\nlight',
    2: 'Medium\nlight',
    3: 'Bright\nindirect',
    4: 'Direct\nlight',
    5: 'Full\nsun',
  },
  detectLighting: 'Detect from photo',
  lightingDetected: 'Lighting level detected',
  lightingDetectionFailed: 'Could not detect lighting from photo',
  lightingHint:
    'Take a photo of the room to auto-detect lighting, or select manually',
  orientation: 'Window orientation',
  orientationLevels: {
    N: 'North',
    NE: 'Northeast',
    E: 'East',
    SE: 'Southeast',
    S: 'South',
    SW: 'Southwest',
    W: 'West',
    NW: 'Northwest',
  },
  detectOrientation: 'Detect with compass',
  orientationDetected: 'Window orientation set',
  orientationDetectFailed: 'Could not detect orientation',
  orientationUseDirection: 'Use this direction',
  orientationClear: 'Clear',
  orientationCalibrate:
    'Move the phone in a figure-8, or step near the window to hold the heading steady',
  orientationPermissionDenied:
    'Location permission is needed to use the compass.',
  orientationUnavailable: 'Compass not available on this device.',
  orientationHint:
    'Hold the phone flat and point its top edge at the window — the arrow follows the top edge',
  filter: {
    allRooms: 'All Rooms',
    noRoom: 'No Room',
  },
  lightWarning: 'This room has {roomLight} but your plant needs {plantLight}',
  lightUnknown:
    'This room has no lighting info. Add it in room settings for better recommendations.',
} as const
