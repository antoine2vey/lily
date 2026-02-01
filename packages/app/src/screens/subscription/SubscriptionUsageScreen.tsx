import { MaterialIcons } from '@expo/vector-icons'
import { Array, pipe } from 'effect'
import { router } from 'expo-router'
import { useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  Text,
  View,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useRevenueCat } from 'src/contexts/RevenueCatContext'
import { useIconColors } from 'src/hooks/useIconColors'
import { useSubscriptionUsage } from 'src/hooks/useSubscriptionUsage'
import * as RevenueCatService from 'src/services/revenuecat'
import { PlanCard } from './components/PlanCard'
import { UsageMeter } from './components/UsageMeter'

const USAGE_CONFIG = {
  ai_chats: {
    icon: 'chat' as const,
    label: 'AI Chats',
  },
  plant_ids: {
    icon: 'local-florist' as const,
    label: 'Plant IDs',
  },
  card_scans: {
    icon: 'qr-code-scanner' as const,
    label: 'Card Scans',
  },
}

const PREMIUM_FEATURES = [
  'Unlimited AI Diagnostics',
  'Detailed Care Guides',
  'Advanced Statistics',
]

export function SubscriptionUsageScreen() {
  const { data, isLoading } = useSubscriptionUsage()
  const { restore } = useRevenueCat()
  const [isRestoring, setIsRestoring] = useState(false)
  const iconColors = useIconColors()

  const handleRestorePurchases = async () => {
    setIsRestoring(true)
    try {
      await restore()

      const message = RevenueCatService.isDevModeEnabled()
        ? 'Restore simulated! (Dev Mode)'
        : 'Purchases restored successfully.'

      Alert.alert('Success', message, [{ text: 'OK' }])
    } catch {
      Alert.alert('Error', 'Failed to restore purchases. Please try again.')
    } finally {
      setIsRestoring(false)
    }
  }

  const handleCancelSubscription = () => {
    router.push('/subscription/cancel')
  }

  if (isLoading || !data) {
    return (
      <SafeAreaView className="flex-1 bg-background dark:bg-background-dark">
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator
            testID="activity-indicator"
            size="large"
            color={iconColors.primary}
          />
        </View>
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView
      className="flex-1 bg-background dark:bg-background-dark"
      edges={['top']}
    >
      {/* Header */}
      <View className="flex-row items-center px-4 py-3">
        <Pressable
          onPress={() => router.back()}
          className="w-10 h-10 items-center justify-center rounded-full"
        >
          <MaterialIcons
            name="arrow-back-ios-new"
            size={20}
            color={iconColors.primary}
          />
        </Pressable>
        <Text className="flex-1 text-lg text-center mr-10 font-bold text-text-primary dark:text-white">
          Subscription
        </Text>
      </View>

      <ScrollView
        className="flex-1"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingVertical: 8 }}
      >
        {/* Current Plan Card */}
        <View className="mt-2">
          <PlanCard planName={data.planName} status={data.status}>
            {pipe(
              data.usage,
              Array.map((item) => {
                const config = USAGE_CONFIG[item.type]
                return (
                  <UsageMeter
                    key={item.type}
                    icon={config.icon}
                    label={config.label}
                    current={item.current}
                    max={item.max}
                  />
                )
              })
            )}
          </PlanCard>
        </View>

        {/* Cancel Subscription Button (Premium users only) */}
        {data.isPremium && data.status === 'active' && (
          <View className="mx-4 mt-6">
            <Pressable
              onPress={handleCancelSubscription}
              className="py-4 rounded-xl items-center border border-coral bg-transparent active:bg-coral/10"
            >
              <Text className="text-base font-semibold text-coral">
                Cancel Subscription
              </Text>
            </Pressable>
          </View>
        )}

        {/* Premium Upgrade Card */}
        {!data.isPremium && (
          <View className="mx-4 mt-6 rounded-2xl p-6 items-center shadow-lg border border-primary/20 bg-surface dark:bg-surface-dark overflow-hidden">
            {/* Star Icon */}
            <View className="w-14 h-14 rounded-full items-center justify-center mb-4 bg-primary-tint dark:bg-primary/20 border border-primary/20">
              <MaterialIcons name="star" size={28} color={iconColors.primary} />
            </View>

            {/* Premium Access Label */}
            <Text className="text-sm mb-1 uppercase tracking-widest font-bold text-primary">
              Premium Access
            </Text>

            {/* Title */}
            <Text className="text-2xl mb-4 font-bold text-text-primary dark:text-white">
              Upgrade to Lily Pro
            </Text>

            {/* Feature List */}
            <View className="w-full rounded-xl p-4 mb-4 gap-3 bg-background dark:bg-background-dark border border-border/30 dark:border-slate-700/30">
              {pipe(
                PREMIUM_FEATURES,
                Array.map((feature) => (
                  <View key={feature} className="flex-row items-start gap-3">
                    <MaterialIcons
                      name="check-circle"
                      size={20}
                      color={iconColors.primary}
                    />
                    <Text className="text-sm font-medium text-text-primary dark:text-white flex-1">
                      {feature}
                    </Text>
                  </View>
                ))
              )}
            </View>

            {/* View Plans Button */}
            <Pressable
              onPress={() => router.push('/subscription/upgrade')}
              className="w-full py-4 rounded-xl items-center bg-primary active:bg-primary-dark"
            >
              <Text className="text-base font-bold text-white">View Plans</Text>
            </Pressable>
          </View>
        )}

        {/* Restore Purchases */}
        <View className="items-center py-6">
          <Pressable onPress={handleRestorePurchases} disabled={isRestoring}>
            <Text className="text-sm font-medium text-text-muted dark:text-slate-400">
              {isRestoring ? 'Restoring...' : 'Restore Purchases'}
            </Text>
          </Pressable>
        </View>

        {/* Bottom spacer */}
        <View className="h-8" />
      </ScrollView>
    </SafeAreaView>
  )
}
