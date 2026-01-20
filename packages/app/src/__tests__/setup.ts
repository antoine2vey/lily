import '@testing-library/jest-native/extend-expect'

// Note: @expo/vector-icons is mocked via __mocks__/@expo/vector-icons.js
// to avoid act() warnings from async font loading

// Mock safe area context
jest.mock('react-native-safe-area-context', () => {
  const insets = { top: 0, right: 0, bottom: 0, left: 0 }
  return {
    SafeAreaProvider: ({ children }: { children: React.ReactNode }) => children,
    SafeAreaView: ({ children }: { children: React.ReactNode }) => children,
    useSafeAreaInsets: () => insets,
    useSafeAreaFrame: () => ({ x: 0, y: 0, width: 375, height: 812 }),
  }
})

// Mock theme
jest.mock('src/theme', () => ({
  colors: {
    primary: '#5B8C5A',
    primaryDark: '#4A7A49',
    primaryLight: '#6B9C6A',
    primaryTint: '#E8F5E8',
    coral: '#E8997E',
    coralDark: '#D88A6F',
    background: '#F8FAF8',
    surface: '#FFFFFF',
    surfaceTinted: '#F0F5F0',
    inputBackground: '#E8F0E8',
    textPrimary: '#1A1A1A',
    textSecondary: '#4A5568',
    textMuted: '#9CA3AF',
    textInverse: '#FFFFFF',
    textMain: '#1A1A1A',
    success: '#5B8C5A',
    warning: '#F59E0B',
    error: '#EF4444',
    info: '#3B82F6',
    waterBlue: '#60A5FA',
    fertilizerOrange: '#F59E0B',
    pruneRed: '#F87171',
    mistTeal: '#5EEAD4',
    achievementGold: '#FCD34D',
    white: '#FFFFFF',
    black: '#000000',
    border: '#E5E7EB',
    borderDark: '#374151',
  },
  fonts: {
    regular: 'PlusJakartaSans_400Regular',
    medium: 'PlusJakartaSans_500Medium',
    semiBold: 'PlusJakartaSans_600SemiBold',
    bold: 'PlusJakartaSans_700Bold',
    extraBold: 'PlusJakartaSans_800ExtraBold',
  },
  spacing: {
    xs: 4,
    sm: 8,
    md: 16,
    lg: 24,
    xl: 32,
    '2xl': 40,
    '3xl': 48,
  },
  borderRadius: {
    sm: 8,
    md: 12,
    lg: 16,
    xl: 24,
    full: 9999,
  },
}))
