import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { TabBarInsetProvider } from '@/contexts/TabBarInsetContext'
import { useThemeContext } from '@/contexts/ThemeContext'
import { iconColorsDark, iconColorsLight } from '@/theme'

const TAB_BAR_HEIGHT = 80

// The native stack paints its container (not just each screen) with the
// navigation theme's background, and that container shows while a pushed
// screen is dismissed.
const navigationThemes = {
  light: {
    ...DefaultTheme,
    colors: { ...DefaultTheme.colors, background: iconColorsLight.background },
  },
  dark: {
    ...DarkTheme,
    colors: { ...DarkTheme.colors, background: iconColorsDark.background },
  },
}

export default function AppLayout() {
  const { resolvedTheme } = useThemeContext()
  const { bottom } = useSafeAreaInsets()
  const tabBarInset = bottom + TAB_BAR_HEIGHT

  return (
    <ThemeProvider value={navigationThemes[resolvedTheme]}>
      <TabBarInsetProvider value={tabBarInset}>
        <Stack
          screenOptions={{
            headerShown: false,
          }}
        >
          <Stack.Screen
            name="(tabs)"
            options={{
              headerShown: false,
            }}
          />
          <Stack.Screen
            name="settings"
            options={{
              headerShown: false,
              presentation: 'card',
            }}
          />
          <Stack.Screen
            name="profile/edit"
            options={{
              headerShown: false,
              presentation: 'modal',
            }}
          />
          <Stack.Screen
            name="subscription/index"
            options={{
              headerShown: false,
              presentation: 'card',
            }}
          />
          <Stack.Screen
            name="subscription/upgrade"
            options={{
              headerShown: false,
              presentation: 'modal',
            }}
          />
          <Stack.Screen
            name="subscription/cancel"
            options={{
              headerShown: false,
              presentation: 'modal',
            }}
          />
          <Stack.Screen
            name="notifications"
            options={{
              headerShown: false,
              presentation: 'card',
            }}
          />
          <Stack.Screen
            name="vacation-mode"
            options={{
              headerShown: false,
              presentation: 'card',
            }}
          />
          <Stack.Screen
            name="chat/index"
            options={{
              headerShown: false,
              presentation: 'card',
            }}
          />
          <Stack.Screen
            name="achievements"
            options={{
              headerShown: false,
              presentation: 'card',
            }}
          />
          <Stack.Screen
            name="log-care"
            options={{
              headerShown: false,
              presentation: 'transparentModal',
              animation: 'fade',
            }}
          />
          <Stack.Screen
            name="tip"
            options={{
              headerShown: false,
              presentation: 'transparentModal',
              animation: 'fade',
            }}
          />
        </Stack>
      </TabBarInsetProvider>
    </ThemeProvider>
  )
}
