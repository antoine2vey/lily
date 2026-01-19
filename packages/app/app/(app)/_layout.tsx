import { Stack } from 'expo-router'
import { colors } from 'src/theme'

export default function AppLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: true,
        headerStyle: {
          backgroundColor: colors.background,
        },
        headerTintColor: colors.textPrimary,
        headerTitleStyle: {
          fontFamily: 'PlusJakartaSans_700Bold',
        },
        contentStyle: {
          backgroundColor: colors.background,
        },
      }}
    />
  )
}
