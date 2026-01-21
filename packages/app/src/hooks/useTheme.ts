import AsyncStorage from '@react-native-async-storage/async-storage'
import { useCallback, useEffect, useState } from 'react'

type Theme = 'light' | 'dark' | 'system'

const THEME_STORAGE_KEY = 'app-theme'

export function useTheme() {
  const [theme, setThemeState] = useState<Theme>('system')
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    const loadTheme = async () => {
      try {
        const savedTheme = await AsyncStorage.getItem(THEME_STORAGE_KEY)
        if (savedTheme && ['light', 'dark', 'system'].includes(savedTheme)) {
          setThemeState(savedTheme as Theme)
        }
      } catch {
        // Use default theme on error
      } finally {
        setIsLoading(false)
      }
    }

    loadTheme()
  }, [])

  const setTheme = useCallback(async (newTheme: Theme) => {
    setThemeState(newTheme)
    try {
      await AsyncStorage.setItem(THEME_STORAGE_KEY, newTheme)
    } catch {
      // Ignore storage errors
    }
  }, [])

  return {
    theme,
    setTheme,
    isLoading,
  }
}
