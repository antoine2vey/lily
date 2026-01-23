/**
 * Expo and React Native module mocks
 * Only mocks modules that are actually installed in the project
 */

// nativewind - mock to prevent CSS interop issues
jest.mock('nativewind', () => ({
  styled: (component: unknown) => component,
  useColorScheme: () => ({ colorScheme: 'light', setColorScheme: jest.fn() }),
}))

// expo-image-picker
jest.mock('expo-image-picker', () => ({
  launchImageLibraryAsync: jest.fn().mockResolvedValue({
    canceled: false,
    assets: [{ uri: 'file://mock-image.jpg', width: 100, height: 100 }],
  }),
  launchCameraAsync: jest.fn().mockResolvedValue({
    canceled: false,
    assets: [{ uri: 'file://mock-camera.jpg', width: 100, height: 100 }],
  }),
  requestCameraPermissionsAsync: jest
    .fn()
    .mockResolvedValue({ status: 'granted' }),
  requestMediaLibraryPermissionsAsync: jest
    .fn()
    .mockResolvedValue({ status: 'granted' }),
  MediaTypeOptions: {
    Images: 'Images',
    Videos: 'Videos',
    All: 'All',
  },
}))

// expo-secure-store
jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn().mockResolvedValue(null),
  setItemAsync: jest.fn().mockResolvedValue(undefined),
  deleteItemAsync: jest.fn().mockResolvedValue(undefined),
}))

// expo-notifications
jest.mock('expo-notifications', () => ({
  getExpoPushTokenAsync: jest
    .fn()
    .mockResolvedValue({ data: 'mock-expo-push-token' }),
  getPermissionsAsync: jest.fn().mockResolvedValue({ status: 'granted' }),
  requestPermissionsAsync: jest.fn().mockResolvedValue({ status: 'granted' }),
  setNotificationHandler: jest.fn(),
  addNotificationReceivedListener: jest
    .fn()
    .mockReturnValue({ remove: jest.fn() }),
  addNotificationResponseReceivedListener: jest
    .fn()
    .mockReturnValue({ remove: jest.fn() }),
  scheduleNotificationAsync: jest.fn().mockResolvedValue('notification-id'),
  cancelScheduledNotificationAsync: jest.fn().mockResolvedValue(undefined),
  cancelAllScheduledNotificationsAsync: jest.fn().mockResolvedValue(undefined),
  getBadgeCountAsync: jest.fn().mockResolvedValue(0),
  setBadgeCountAsync: jest.fn().mockResolvedValue(undefined),
}))

// expo-camera
jest.mock('expo-camera', () => ({
  Camera: {
    requestCameraPermissionsAsync: jest
      .fn()
      .mockResolvedValue({ status: 'granted' }),
    Constants: {
      Type: { back: 0, front: 1 },
      FlashMode: { off: 0, on: 1, auto: 2 },
    },
  },
  useCameraPermissions: jest
    .fn()
    .mockReturnValue([
      { status: 'granted', granted: true },
      jest.fn().mockResolvedValue({ status: 'granted' }),
    ]),
}))

// expo-device
jest.mock('expo-device', () => ({
  isDevice: true,
  brand: 'Apple',
  modelName: 'iPhone 15',
  osName: 'iOS',
  osVersion: '17.0',
}))

// expo-constants
jest.mock('expo-constants', () => ({
  default: {
    expoConfig: {
      extra: {
        eas: {
          projectId: 'mock-project-id',
        },
      },
    },
    executionEnvironment: 'storeClient',
  },
  ExecutionEnvironment: {
    Standalone: 'standalone',
    StoreClient: 'storeClient',
    Bare: 'bare',
  },
}))

// @react-native-async-storage/async-storage
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn().mockResolvedValue(null),
  setItem: jest.fn().mockResolvedValue(undefined),
  removeItem: jest.fn().mockResolvedValue(undefined),
  clear: jest.fn().mockResolvedValue(undefined),
  getAllKeys: jest.fn().mockResolvedValue([]),
  multiGet: jest.fn().mockResolvedValue([]),
  multiSet: jest.fn().mockResolvedValue(undefined),
  multiRemove: jest.fn().mockResolvedValue(undefined),
}))

// @react-native-community/datetimepicker
jest.mock('@react-native-community/datetimepicker', () => 'DateTimePicker')

// expo-linking
jest.mock('expo-linking', () => ({
  openURL: jest.fn().mockResolvedValue(undefined),
  canOpenURL: jest.fn().mockResolvedValue(true),
  createURL: jest.fn((path: string) => `lily://${path}`),
  makeUrl: jest.fn((path: string) => `lily://${path}`),
}))

// expo-linear-gradient
jest.mock('expo-linear-gradient', () => ({
  LinearGradient: 'LinearGradient',
}))

// expo-splash-screen
jest.mock('expo-splash-screen', () => ({
  preventAutoHideAsync: jest.fn().mockResolvedValue(undefined),
  hideAsync: jest.fn().mockResolvedValue(undefined),
}))
