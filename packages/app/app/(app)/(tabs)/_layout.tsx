import { router, Tabs } from 'expo-router'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { View } from 'react-native'
import { LiquidGlassTabBar } from '@/components/LiquidGlassTabBar'
import { useCareBadgeCount } from '@/hooks/useCareBadgeCount'
import { AddPlantOptionsSheet } from '@/screens/add-plant/AddPlantOptionsSheet'

export default function TabsLayout() {
  const { t } = useTranslation('common')
  const [showAddPlant, setShowAddPlant] = useState(false)
  const careBadgeCount = useCareBadgeCount()

  return (
    <View className="flex-1">
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarStyle: { display: 'none' },
        }}
        initialRouteName="index"
      >
        <Tabs.Screen name="index" options={{ title: t('tabs.home') }} />
        <Tabs.Screen name="plants" options={{ title: t('tabs.plants') }} />
        <Tabs.Screen name="care" options={{ title: t('tabs.care') }} />
        <Tabs.Screen name="profile" options={{ title: t('tabs.profile') }} />
      </Tabs>

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
    </View>
  )
}
