import AsyncStorage from '@react-native-async-storage/async-storage'
import { useColorScheme as useNativeWindColorScheme } from 'nativewind'
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react'
import { Appearance, type ColorSchemeName } from 'react-native'

export type ThemePreference = 'light' | 'dark' | 'system'
export type ResolvedTheme = 'light' | 'dark'

const THEME_STORAGE_KEY = 'app-theme'

interface ThemeContextValue {
  /** User's theme preference (light, dark, or system) */
  preference: ThemePreference
  /** The actual theme being applied (light or dark) */
  resolvedTheme: ResolvedTheme
  /** Convenience boolean for checking dark mode */
  isDark: boolean
  /** Update the theme preference */
  setTheme: (theme: ThemePreference) => Promise<void>
  /** True while loading the stored preference */
  isLoading: boolean
}

const ThemeContext = createContext<ThemeContextValue | null>(null)

export function useThemeContext(): ThemeContextValue {
  const context = useContext(ThemeContext)
  if (!context) {
    throw new Error('useThemeContext must be used within a ThemeProvider')
  }
  return context
}

interface ThemeProviderProps {
  children: ReactNode
}

export function ThemeProvider({ children }: ThemeProviderProps) {
  const [preference, setPreference] = useState<ThemePreference>('system')
  const [isLoading, setIsLoading] = useState(true)
  const [systemTheme, setSystemTheme] = useState<ColorSchemeName>(() =>
    Appearance.getColorScheme()
  )

  // NativeWind's color scheme hook to apply the dark class
  const { setColorScheme } = useNativeWindColorScheme()

  // Listen to system theme changes
  useEffect(() => {
    const subscription = Appearance.addChangeListener(({ colorScheme }) => {
      setSystemTheme(colorScheme)
    })
    return () => subscription.remove()
  }, [])

  // Load stored preference on mount
  useEffect(() => {
    const loadPreference = async () => {
      try {
        const stored = await AsyncStorage.getItem(THEME_STORAGE_KEY)
        if (stored && ['light', 'dark', 'system'].includes(stored)) {
          setPreference(stored as ThemePreference)
        }
      } catch {
        // Use default preference on error
      } finally {
        setIsLoading(false)
      }
    }

    loadPreference()
  }, [])

  // Resolve 'system' to actual theme
  const resolvedTheme: ResolvedTheme = useMemo(() => {
    if (preference === 'system') {
      return systemTheme === 'dark' ? 'dark' : 'light'
    }
    return preference
  }, [preference, systemTheme])

  const isDark = resolvedTheme === 'dark'

  // Sync with NativeWind whenever resolved theme changes
  useEffect(() => {
    setColorScheme(resolvedTheme)
  }, [resolvedTheme, setColorScheme])

  const setTheme = useCallback(async (newTheme: ThemePreference) => {
    setPreference(newTheme)
    try {
      await AsyncStorage.setItem(THEME_STORAGE_KEY, newTheme)
    } catch {
      // Ignore storage errors
    }
  }, [])

  const value = useMemo(
    () => ({
      preference,
      resolvedTheme,
      isDark,
      setTheme,
      isLoading,
    }),
    [preference, resolvedTheme, isDark, setTheme, isLoading]
  )

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}
