// Provide EXPO_PUBLIC_* env vars that client.tsx reads at module scope.
// Expo's Metro bundler loads .env automatically, but Jest does not.
process.env.EXPO_PUBLIC_API_URL =
  process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000'

module.exports = {
  preset: 'jest-expo',
  setupFilesAfterEnv: ['./src/__tests__/setup.ts'],
  testMatch: ['**/__tests__/**/*.test.ts', '**/__tests__/**/*.test.tsx'],
  transformIgnorePatterns: [
    'node_modules/(?!\\.bun|((jest-)?react-native|@react-native(-community)?)|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|react-navigation|@react-navigation/.*|@unimodules/.*|unimodules|sentry-expo|native-base|react-native-svg|effect|@effect|nativewind|react-native-css-interop|msgpackr|@ronradtke/react-native-markdown-display|markdown-it)',
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
