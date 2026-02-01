import { useThemeContext } from 'src/contexts/ThemeContext'
import { iconColorsDark, iconColorsLight } from 'src/theme'

/**
 * Returns theme-aware icon colors.
 * Use this hook to get the appropriate icon colors based on the current theme.
 *
 * @example
 * const iconColors = useIconColors()
 * <MaterialIcons name="home" color={iconColors.primary} />
 */
export function useIconColors() {
  const { isDark } = useThemeContext()
  const colors = isDark ? iconColorsDark : iconColorsLight
  return { ...colors, isDark }
}
