import { MaterialIcons } from '@expo/vector-icons'
import { Pressable, useWindowDimensions } from 'react-native'
import { useThemeContext } from '@/contexts/ThemeContext'
import { useIconColors } from '@/hooks/useIconColors'

/**
 * Dev-only floating button that flips light/dark from any screen. Long press
 * returns to following the system. It writes the same stored preference as
 * the Settings screen. Native modals and form sheets render above it.
 */
export function DevThemeToggle() {
  const { isDark, preference, setTheme } = useThemeContext()
  const iconColors = useIconColors()
  const { height } = useWindowDimensions()

  return (
    <Pressable
      testID="dev-theme-toggle"
      accessibilityRole="button"
      accessibilityLabel="Toggle light or dark mode (dev only)"
      onPress={() => setTheme(isDark ? 'light' : 'dark')}
      onLongPress={() => setTheme('system')}
      hitSlop={8}
      className={`absolute right-2 w-10 h-10 rounded-full items-center justify-center bg-black/50 active:bg-black/70 ${
        preference === 'system' ? '' : 'border border-white/60'
      }`}
      style={{ top: height * 0.45 }}
    >
      <MaterialIcons
        name={isDark ? 'light-mode' : 'dark-mode'}
        size={20}
        color={iconColors.white}
      />
    </Pressable>
  )
}
