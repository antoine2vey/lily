import { router, Tabs } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { View } from 'react-native'
import { LiquidGlassTabBar } from '@/components/LiquidGlassTabBar'
import { useCareBadgeCount } from '@/hooks/useCareBadgeCount'

export default function TabsLayout() {
  const { t } = useTranslation('common')
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
        <Tabs.Screen name="chat" options={{ title: t('tabs.chat') }} />
      </Tabs>

      <LiquidGlassTabBar
        onFabPress={() => router.push('/add-plant/scanner')}
        careBadgeCount={careBadgeCount}
      />
    </View>
  )
}
