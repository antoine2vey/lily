import {
  type ResolvedTheme,
  type ThemePreference,
  useThemeContext,
} from '@/contexts/ThemeContext'

export type { ResolvedTheme, ThemePreference }

/**
 * Hook for accessing and controlling the app theme.
 * This is a convenience wrapper around ThemeContext for backwards compatibility.
 *
 * @example
 * const { theme, setTheme, isDark } = useTheme()
 */
export function useTheme() {
  const { preference, resolvedTheme, isDark, setTheme, isLoading } =
    useThemeContext()

  return {
    /** User's theme preference (light, dark, or system) */
    theme: preference,
    /** The actual theme being applied (light or dark) */
    resolvedTheme,
    /** Convenience boolean for checking dark mode */
    isDark,
    /** Update the theme preference */
    setTheme,
    /** True while loading the stored preference */
    isLoading,
  }
}
