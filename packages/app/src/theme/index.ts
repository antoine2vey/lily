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

export const iconColors = iconColorsLight

// =============================================================================
// DEPRECATED EXPORTS - Use Tailwind classes instead
// These are kept temporarily for backwards compatibility during migration.
// Remove usage of these and use className with Tailwind classes.
// =============================================================================

/**
 * @deprecated Use Tailwind classes instead: bg-primary, text-text-primary, etc.
 */
export const colors = {
  // Primary (updated to align with reference screens)
  primary: '#80ac53',
  primaryDark: '#6a9145',
  primaryLight: '#9bc76d',
  primaryTint: '#dceccb',

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
  success: '#80ac53',
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

/**
 * @deprecated Use Tailwind spacing classes: p-1, m-2, gap-4, etc.
 */
export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  '2xl': 40,
  '3xl': 48,
} as const

/**
 * @deprecated Use Tailwind rounded classes: rounded-sm, rounded-md, rounded-lg, etc.
 */
export const borderRadius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  full: 9999,
} as const

/**
 * @deprecated Use Tailwind text/font classes: text-xl, font-semibold, etc.
 */
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
