import { router, Tabs } from 'expo-router'
import { useState } from 'react'
import { BottomTabBar } from 'src/components/BottomTabBar'
import { AddPlantOptionsSheet } from 'src/screens/add-plant/AddPlantOptionsSheet'

export default function TabsLayout() {
  const [showAddPlant, setShowAddPlant] = useState(false)

  return (
    <>
      <Tabs
        tabBar={(props) => (
          <BottomTabBar {...props} onFabPress={() => setShowAddPlant(true)} />
        )}
        screenOptions={{
          headerShown: false,
        }}
        initialRouteName="index"
      >
        <Tabs.Screen
          name="index"
          options={{
            title: 'Home',
          }}
        />
        <Tabs.Screen
          name="plants"
          options={{
            title: 'My Plants',
          }}
        />
        <Tabs.Screen
          name="care"
          options={{
            title: 'Care',
          }}
        />
        <Tabs.Screen
          name="profile"
          options={{
            title: 'Profile',
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
