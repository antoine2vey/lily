export const colors = {
  // Primary
  primary: '#5B8C5A',
  primaryDark: '#4A7A49',
  primaryLight: '#6B9C6A',
  primaryTint: '#E8F5E8',

  // Secondary (Coral for destructive)
  coral: '#E8997E',
  coralDark: '#D88A6F',

  // Backgrounds
  background: '#F8FAF8',
  backgroundDark: '#1A1A1A',
  surface: '#FFFFFF',
  surfaceDark: '#252A1F',
  surfaceTinted: '#F0F5F0',
  inputBackground: '#E8F0E8',

  // Text
  textPrimary: '#1A1A1A',
  textSecondary: '#4A5568',
  textMuted: '#9CA3AF',
  textInverse: '#FFFFFF',

  // Legacy aliases for compatibility
  textMain: '#1A1A1A',

  // Status
  success: '#5B8C5A',
  warning: '#F59E0B',
  error: '#EF4444',
  info: '#3B82F6',

  // Semantic
  waterBlue: '#60A5FA',
  fertilizerOrange: '#F59E0B',
  pruneRed: '#F87171',
  mistTeal: '#5EEAD4',
  achievementGold: '#FCD34D',

  // Utility
  white: '#FFFFFF',
  black: '#000000',
  border: '#E5E7EB',
  borderDark: '#374151',
} as const

export const fonts = {
  regular: 'PlusJakartaSans_400Regular',
  medium: 'PlusJakartaSans_500Medium',
  semiBold: 'PlusJakartaSans_600SemiBold',
  bold: 'PlusJakartaSans_700Bold',
  extraBold: 'PlusJakartaSans_800ExtraBold',
} as const

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  '2xl': 40,
  '3xl': 48,
} as const

export const borderRadius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  full: 9999,
} as const

export const typography = {
  display: { size: 32, weight: '700', lineHeight: 1.2 },
  h1: { size: 28, weight: '700', lineHeight: 1.3 },
  h2: { size: 24, weight: '600', lineHeight: 1.3 },
  h3: { size: 20, weight: '600', lineHeight: 1.4 },
  h4: { size: 18, weight: '600', lineHeight: 1.4 },
  bodyLarge: { size: 16, weight: '400', lineHeight: 1.5 },
  body: { size: 14, weight: '400', lineHeight: 1.5 },
  bodySmall: { size: 12, weight: '400', lineHeight: 1.4 },
  caption: { size: 11, weight: '500', lineHeight: 1.3 },
  button: { size: 16, weight: '600', lineHeight: 1 },
} as const
