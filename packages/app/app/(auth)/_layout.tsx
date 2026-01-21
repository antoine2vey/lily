import { Stack } from 'expo-router'
import { iconColors } from 'src/theme'

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
