/**
 * Fonts - Required for style prop (NativeWind limitation)
 * Use these with: style={{ fontFamily: fonts.semiBold }}
 */
export const fonts = {
  regular: 'SpaceGrotesk_400Regular',
  medium: 'SpaceGrotesk_500Medium',
  semiBold: 'SpaceGrotesk_600SemiBold',
  bold: 'SpaceGrotesk_700Bold',
  extraBold: 'SpaceGrotesk_700Bold',
} as const

/**
 * Icon colors - Light mode (default)
 * MaterialIcons and other icon libraries require color as a prop
 * Use the useIconColors() hook to get theme-aware colors
 */
export const iconColorsLight = {
  primary: '#80ac53',
  primaryDark: '#6a9145',
  muted: '#9CA3AF',
  white: '#FFFFFF',
  error: '#EF4444',
  warning: '#F59E0B',
  success: '#80ac53',
  waterBlue: '#60A5FA',
  slate400: '#94a3b8',
  slate500: '#64748b',
  slate900: '#0f172a',
  coral: '#E8997E',
  fertilizerOrange: '#F59E0B',
  repotBrown: '#A0845C',
  mistTeal: '#5EEAD4',
  pruneRed: '#F87171',
  border: '#E5E7EB',
  textPrimary: '#1A1A1A',
  textMuted: '#9CA3AF',
  textSecondary: '#4A5568',
  achievementGold: '#FCD34D',
  surfaceTinted: '#F0F5F0',
  info: '#3B82F6',
  background: '#F8FAF8',
} as const

/**
 * Icon colors - Dark mode
 * Brighter variants for visibility on dark backgrounds
 */
export const iconColorsDark = {
  primary: '#9bc76d', // Brighter green for dark backgrounds
  primaryDark: '#80ac53',
  muted: '#6B7280',
  white: '#FFFFFF',
  error: '#F87171', // Slightly brighter red
  warning: '#FBBF24', // Brighter amber
  success: '#9bc76d',
  waterBlue: '#93C5FD', // Brighter blue
  slate400: '#94a3b8',
  slate500: '#94a3b8', // Lighter in dark mode
  slate900: '#F8FAFC', // Inverted for dark mode
  coral: '#F5B89A', // Brighter coral
  fertilizerOrange: '#FBBF24',
  repotBrown: '#C4A882', // Brighter brown for dark mode
  mistTeal: '#99F6E4', // Brighter teal
  pruneRed: '#FCA5A5', // Brighter red
  border: '#374151', // Dark mode border
  textPrimary: '#FFFFFF',
  textMuted: '#9CA3AF',
  textSecondary: '#D1D5DB',
  achievementGold: '#FDE68A', // Brighter gold
  surfaceTinted: '#2D3728', // Dark tinted surface
  info: '#60A5FA',
  background: '#1A1A1A',
} as const
