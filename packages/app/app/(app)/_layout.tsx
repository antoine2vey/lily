import { Stack } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { TabBarInsetProvider } from '@/contexts/TabBarInsetContext'
import { useIconColors } from '@/hooks/useIconColors'

const TAB_BAR_HEIGHT = 80

export default function AppLayout() {
  const { background } = useIconColors()
  const { bottom } = useSafeAreaInsets()
  const tabBarInset = bottom + TAB_BAR_HEIGHT

  return (
    <TabBarInsetProvider value={tabBarInset}>
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: {
            backgroundColor: background,
          },
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
  )
}
