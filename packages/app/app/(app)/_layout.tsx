import { router, Stack } from 'expo-router'
import { useState } from 'react'
import { LiquidGlassTabBar } from 'src/components/LiquidGlassTabBar'
import { useCareBadgeCount } from 'src/hooks/useCareBadgeCount'
import { AddPlantOptionsSheet } from 'src/screens/add-plant/AddPlantOptionsSheet'
import { iconColors } from 'src/theme'

export default function AppLayout() {
  const [showAddPlant, setShowAddPlant] = useState(false)
  const careBadgeCount = useCareBadgeCount()

  return (
    <>
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: {
            backgroundColor: iconColors.background,
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
      </Stack>

      <LiquidGlassTabBar
        onFabPress={() => setShowAddPlant(true)}
        careBadgeCount={careBadgeCount}
      />

      <AddPlantOptionsSheet
        visible={showAddPlant}
        onClose={() => setShowAddPlant(false)}
        onSelectAI={() => router.push('/add-plant/ai-scanner')}
        onSelectScan={() => router.push('/add-plant/nursery-scanner')}
        onSelectManual={() => router.push('/add-plant/manual-basic')}
      />
    </>
  )
}
