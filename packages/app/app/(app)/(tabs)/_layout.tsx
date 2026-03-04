import { router, Tabs } from 'expo-router'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { BottomTabBar } from 'src/components/BottomTabBar'
import { useCareBadgeCount } from 'src/hooks/useCareBadgeCount'
import { AddPlantOptionsSheet } from 'src/screens/add-plant/AddPlantOptionsSheet'

export default function TabsLayout() {
  const { t } = useTranslation('common')
  const [showAddPlant, setShowAddPlant] = useState(false)
  const careBadgeCount = useCareBadgeCount()

  return (
    <>
      <Tabs
        tabBar={(props) => (
          <BottomTabBar
            {...props}
            onFabPress={() => setShowAddPlant(true)}
            careBadgeCount={careBadgeCount}
          />
        )}
        screenOptions={{
          headerShown: false,
        }}
        initialRouteName="index"
      >
        <Tabs.Screen
          name="index"
          options={{
            title: t('tabs.home'),
          }}
        />
        <Tabs.Screen
          name="plants"
          options={{
            title: t('tabs.plants'),
          }}
        />
        <Tabs.Screen
          name="care"
          options={{
            title: t('tabs.care'),
          }}
        />
        <Tabs.Screen
          name="profile"
          options={{
            title: t('tabs.profile'),
          }}
        />
      </Tabs>

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
