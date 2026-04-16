import { Stack } from 'expo-router'
import { iconColorsLight as iconColors } from '@/theme'

export default function AuthLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: {
          backgroundColor: iconColors.background,
        },
      }}
    />
  )
}
