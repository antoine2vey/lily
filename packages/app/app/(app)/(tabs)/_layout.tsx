import { Tabs } from 'expo-router'
import { useState } from 'react'
import { View } from 'react-native'
import { BottomSheet } from 'src/components/BottomSheet'
import { BottomTabBar } from 'src/components/BottomTabBar'

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

      <BottomSheet
        visible={showAddPlant}
        onClose={() => setShowAddPlant(false)}
        title="Add Plant"
      >
        <View />
      </BottomSheet>
    </>
  )
}
