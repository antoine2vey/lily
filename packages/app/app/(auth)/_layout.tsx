import { Stack } from 'expo-router'
import { MESH_BASE_COLOR } from '@/components/MeshBackground'
import { useThemeContext } from '@/contexts/ThemeContext'

// Every auth screen draws its own mesh background, so screens crossfade
// instead of sliding two meshes past each other.
export default function AuthLayout() {
  const { isDark } = useThemeContext()

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        animation: 'fade',
        animationDuration: 350,
        contentStyle: {
          backgroundColor: isDark
            ? MESH_BASE_COLOR.dark
            : MESH_BASE_COLOR.light,
        },
      }}
    />
  )
}
