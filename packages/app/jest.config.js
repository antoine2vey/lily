// Provide EXPO_PUBLIC_* env vars that client.tsx reads at module scope.
// Expo's Metro bundler loads .env automatically, but Jest does not.
process.env.EXPO_PUBLIC_API_URL =
  process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000'

module.exports = {
  preset: 'jest-expo',
  // Reanimated 4.7 / worklets 0.13 ship `.native.ts` files that need the
  // native TurboModule; their resolver routes Jest to the JS mock variants.
  resolver: 'react-native-reanimated/jest/resolver.js',
  // A broken Homebrew watchman aborts the crawl before any test runs; the node
  // crawler is what CI uses anyway.
  watchman: false,
  // RNGH 3 detectors call into the native module on mount; this mocks it.
  setupFiles: ['react-native-gesture-handler/jestSetup'],
  setupFilesAfterEnv: ['./src/__tests__/setup.ts'],
  testMatch: ['**/__tests__/**/*.test.ts', '**/__tests__/**/*.test.tsx'],
  transformIgnorePatterns: [
    'node_modules/(?!\\.bun|((jest-)?react-native|@react-native(-community)?)|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|react-navigation|@react-navigation/.*|@unimodules/.*|unimodules|sentry-expo|native-base|react-native-svg|effect|@effect|nativewind|react-native-css-interop|msgpackr|@ronradtke/react-native-markdown-display|markdown-it|intl-messageformat|@formatjs/.*)',
  ],
  moduleNameMapper: {
    '^src/(.*)$': '<rootDir>/src/$1',
    '^msgpackr$': '<rootDir>/src/__tests__/mocks/msgpackr.ts',
    '^react-native-purchases$':
      '<rootDir>/src/__tests__/mocks/react-native-purchases.ts',
    '^@ronradtke/react-native-markdown-display$':
      '<rootDir>/src/__tests__/mocks/react-native-markdown-display.tsx',
    '^@callstack/liquid-glass$':
      '<rootDir>/src/__tests__/mocks/liquid-glass.ts',
  },
  collectCoverageFrom: [
    'src/**/*.{ts,tsx}',
    '!src/**/*.d.ts',
    '!src/**/__tests__/**',
  ],
}
