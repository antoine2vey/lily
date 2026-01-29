// Mock for react-native-purchases to avoid NativeEventEmitter error in tests
export const LOG_LEVEL = {
  VERBOSE: 'VERBOSE',
  DEBUG: 'DEBUG',
  INFO: 'INFO',
  WARN: 'WARN',
  ERROR: 'ERROR',
}

const Purchases = {
  configure: jest.fn(),
  setLogLevel: jest.fn(),
  getAppUserID: jest.fn().mockResolvedValue('test-user-id'),
  logIn: jest.fn().mockResolvedValue({ customerInfo: {} }),
  logOut: jest.fn().mockResolvedValue({}),
  getOfferings: jest.fn().mockResolvedValue({ current: null, all: {} }),
  getCustomerInfo: jest.fn().mockResolvedValue({
    entitlements: { active: {}, all: {} },
    activeSubscriptions: [],
  }),
  purchasePackage: jest.fn().mockResolvedValue({ customerInfo: {} }),
  restorePurchases: jest.fn().mockResolvedValue({}),
}

export default Purchases
